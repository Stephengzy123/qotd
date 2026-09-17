import "server-only";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import { redirect } from "next/navigation";
import { findAccount } from "@/lib/accounts";

export type Role = "contributor" | "admin" | "club_leader";
const ROLES: Role[] = ["contributor", "admin", "club_leader"];

// Where each role lands after signing in.
export function homePath(role: Role) {
  return role === "admin" ? "/admin" : role === "club_leader" ? "/club" : "/contribute";
}
type Session = { role: Role; username: string; expires: number; accountId?: string };
const COOKIE_NAME = "qotd_session";

function secret() {
  if (!process.env.SESSION_SECRET) throw new Error("SESSION_SECRET is not configured");
  return process.env.SESSION_SECRET;
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

export async function verifyCredentials(username: string, password: string): Promise<Role | null> {
  const candidates: Array<{ role: Role; username?: string; hash?: string }> = [
    { role: "admin", username: process.env.ADMIN_USERNAME, hash: process.env.ADMIN_PASSWORD_HASH },
    { role: "contributor", username: process.env.CONTRIBUTOR_USERNAME, hash: process.env.CONTRIBUTOR_PASSWORD_HASH },
  ];
  for (const candidate of candidates) {
    if (candidate.username && candidate.hash && safeEqual(username, candidate.username)) {
      if (await bcrypt.compare(password, candidate.hash)) return candidate.role;
    }
  }
  // Accounts created from the admin page live in the database.
  try {
    const account = await findAccount(username);
    // Accounts without a password have not finished their setup link yet.
    if (account?.password_hash && (await bcrypt.compare(password, account.password_hash))) return account.role;
  } catch (error) {
    console.error(`[activity] account lookup failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  // Keep unknown-user checks computationally similar to valid-user checks.
  await bcrypt.compare(password, "$2b$12$AOvuXu3KkvUDBQ.oNqo5UOKap7Un5ol1ElLrgH2HmgMqcMJ5UG0rS");
  return null;
}

export async function createSession(role: Role, username: string) {
  const session: Session = { role, username, expires: Date.now() + 1000 * 60 * 60 * 12 };
  if (username !== process.env.ADMIN_USERNAME && username !== process.env.CONTRIBUTOR_USERNAME) {
    const account = await findAccount(username);
    if (!account || account.role !== role) throw new Error("Account no longer available");
    session.accountId = account.id;
  }
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  (await cookies()).set(COOKIE_NAME, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !safeEqual(signature, sign(payload))) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString()) as Session;
    if (session.expires < Date.now() || !ROLES.includes(session.role)) return null;
    const configured = (session.role === "admin" && session.username === process.env.ADMIN_USERNAME) || (session.role === "contributor" && session.username === process.env.CONTRIBUTOR_USERNAME);
    if (!configured) {
      const account = await findAccount(session.username);
      if (!account || account.role !== session.role || (session.accountId && session.accountId !== account.id)) return null;
    }
    return session;
  } catch {
    return null;
  }
}

export async function requireRole(role: Role) {
  const session = await getSession();
  if (!session || session.role !== role) redirect("/login");
  return session;
}

export async function clearSession() {
  (await cookies()).delete(COOKIE_NAME);
}
