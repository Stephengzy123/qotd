import "server-only";
import { cookies, headers } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse, type AuthenticationResponseJSON, type RegistrationResponseJSON } from "@simplewebauthn/server";
import { dbReady } from "@/lib/db";
import type { Role } from "@/lib/auth";

export type Passkey = { id: string; name: string | null; device_type: string | null; backed_up: boolean; created_at: Date; last_used_at: Date | null };

const CHALLENGE_COOKIE = "qotd_webauthn";
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const RP_NAME = "Announcements";

// Relying-party identity is derived from the request so previews and
// production each get their own passkeys. PASSKEY_RP_ID pins it if needed.
export async function relyingParty() {
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  const hostname = host.split(":")[0];
  const protocol = h.get("x-forwarded-proto") || (hostname === "localhost" ? "http" : "https");
  return { rpID: process.env.PASSKEY_RP_ID || hostname, origin: `${protocol}://${host}` };
}

function secret() {
  if (!process.env.SESSION_SECRET) throw new Error("SESSION_SECRET is not configured");
  return process.env.SESSION_SECRET;
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

// The challenge lives in a short-lived signed cookie instead of a table.
async function rememberChallenge(kind: "register" | "login", challenge: string, subject: string) {
  const payload = Buffer.from(JSON.stringify({ kind, challenge, subject, expires: Date.now() + CHALLENGE_TTL_MS })).toString("base64url");
  (await cookies()).set(CHALLENGE_COOKIE, `${payload}.${sign(payload)}`, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: CHALLENGE_TTL_MS / 1000 });
}

async function takeChallenge(kind: "register" | "login") {
  const jar = await cookies();
  const token = jar.get(CHALLENGE_COOKIE)?.value;
  jar.delete(CHALLENGE_COOKIE);
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload);
  if (expected.length !== signature.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;
  const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { kind: string; challenge: string; subject: string; expires: number };
  return data.kind === kind && data.expires > Date.now() ? data : null;
}

export async function listPasskeys(accountId: string) {
  const sql = await dbReady();
  return sql<Passkey[]>`select id, name, device_type, backed_up, created_at, last_used_at from passkeys where account_id = ${accountId} order by created_at asc`;
}

export async function deletePasskey(accountId: string, id: string) {
  const sql = await dbReady();
  const rows = await sql`delete from passkeys where id = ${id} and account_id = ${accountId} returning id`;
  return rows.length > 0;
}

export async function registrationOptions(account: { id: string; username: string }) {
  const { rpID } = await relyingParty();
  const existing = await listPasskeys(account.id);
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userName: account.username,
    userID: new TextEncoder().encode(account.id),
    attestationType: "none",
    excludeCredentials: existing.map((key) => ({ id: key.id })),
    authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
  });
  await rememberChallenge("register", options.challenge, account.id);
  return options;
}

export async function completeRegistration(account: { id: string }, response: RegistrationResponseJSON, name: string) {
  const pending = await takeChallenge("register");
  if (!pending || pending.subject !== account.id) return { error: "The passkey request expired. Try again." };
  const { rpID, origin } = await relyingParty();
  let verification;
  try {
    verification = await verifyRegistrationResponse({ response, expectedChallenge: pending.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: false });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The passkey could not be verified." };
  }
  if (!verification.verified || !verification.registrationInfo) return { error: "The passkey could not be verified." };
  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
  const sql = await dbReady();
  await sql`
    insert into passkeys (id, account_id, public_key, counter, transports, device_type, backed_up, name)
    values (${credential.id}, ${account.id}, ${Buffer.from(credential.publicKey).toString("base64url")}, ${credential.counter}, ${credential.transports ?? null}, ${credentialDeviceType}, ${credentialBackedUp}, ${name.slice(0, 60) || null})
    on conflict (id) do nothing
  `;
  return { id: credential.id };
}

export async function authenticationOptions() {
  const { rpID } = await relyingParty();
  // No allowCredentials: the browser offers whichever discoverable passkeys it holds for this site.
  const options = await generateAuthenticationOptions({ rpID, userVerification: "preferred" });
  await rememberChallenge("login", options.challenge, "");
  return options;
}

export async function completeAuthentication(response: AuthenticationResponseJSON): Promise<{ error: string; account?: undefined } | { account: { id: string; username: string; role: Role }; error?: undefined }> {
  const pending = await takeChallenge("login");
  if (!pending) return { error: "The sign-in request expired. Try again." };
  const sql = await dbReady();
  const rows = await sql<{ id: string; account_id: string; public_key: string; counter: number; transports: string[] | null; username: string; role: Role }[]>`
    select p.id, p.account_id, p.public_key, p.counter, p.transports, a.username, a.role
    from passkeys p join accounts a on a.id = p.account_id where p.id = ${response.id} limit 1
  `;
  const stored = rows[0];
  if (!stored) return { error: "That passkey isn’t registered here." };
  const { rpID, origin } = await relyingParty();
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: pending.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
      credential: { id: stored.id, publicKey: new Uint8Array(Buffer.from(stored.public_key, "base64url")), counter: Number(stored.counter), transports: (stored.transports ?? undefined) as never },
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The passkey could not be verified." };
  }
  if (!verification.verified) return { error: "The passkey could not be verified." };
  await sql`update passkeys set counter = ${verification.authenticationInfo.newCounter}, last_used_at = now() where id = ${stored.id}`;
  return { account: { id: stored.account_id, username: stored.username, role: stored.role } };
}
