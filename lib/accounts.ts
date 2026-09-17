import "server-only";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { dbReady } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/security";
import type { Role } from "@/lib/auth";

export type Account = { id: string; username: string; role: Role; created_by: string | null; created_at: Date; has_password: boolean };
export type SetupLink = { token: string; expires_at: Date; created_at: Date };

export const USERNAME_PATTERN = /^[A-Za-z0-9._-]{2,64}$/;
export const ROLES: Role[] = ["contributor", "admin", "club_leader"];
export const ROLE_LABELS: Record<Role, string> = { contributor: "Contributor", admin: "Admin", club_leader: "Club leader" };
const SETUP_LINK_DAYS = 7;

export function parseRole(value: unknown): Role | null {
  return ROLES.includes(value as Role) ? (value as Role) : null;
}

function envUsernames() {
  return [process.env.ADMIN_USERNAME, process.env.CONTRIBUTOR_USERNAME].filter((value): value is string => Boolean(value));
}

function validatePassword(password: string) {
  return password.length < 12 || Buffer.byteLength(password, "utf8") > 72 ? "Passwords must be at least 12 characters and at most 72 bytes." : null;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function listAccounts() {
  const sql = await dbReady();
  return sql<Account[]>`select id, username, role, created_by, created_at, password_hash is not null as has_password from accounts order by created_at asc`;
}

export async function getAccount(id: string) {
  const sql = await dbReady();
  const rows = await sql<Account[]>`select id, username, role, created_by, created_at, password_hash is not null as has_password from accounts where id = ${id} limit 1`;
  return rows[0] || null;
}

export async function findAccount(username: string) {
  const sql = await dbReady();
  const rows = await sql<{ id: string; username: string; role: Role; password_hash: string | null }[]>`
    select id, username, role, password_hash from accounts where lower(username) = lower(${username}) limit 1
  `;
  return rows[0] || null;
}

// Accounts start without a password. The admin shares a setup link and the
// person chooses their own password there.
export async function createAccount(username: string, role: Role, createdBy: string): Promise<{ error: string; id?: undefined } | { id: string; error?: undefined }> {
  if (!USERNAME_PATTERN.test(username)) return { error: "Usernames must be 2–64 letters, numbers, dots, underscores, or dashes." };
  if (envUsernames().some((value) => value.toLowerCase() === username.toLowerCase())) return { error: "That username is already in use." };
  const sql = await dbReady();
  const rows = await sql<{ id: string }[]>`
    insert into accounts (username, role, created_by)
    values (${username}, ${role}, ${createdBy})
    on conflict (lower(username)) do nothing
    returning id
  `;
  if (!rows[0]) return { error: "That username is already in use." };
  return { id: rows[0].id };
}

export async function deleteAccount(id: string) {
  const sql = await dbReady();
  const rows = await sql<{ username: string; role: Role }[]>`delete from accounts where id = ${id} returning username, role`;
  return rows[0] || null;
}

export async function updateAccountRole(id: string, role: Role) {
  const sql = await dbReady();
  const rows = await sql<{ username: string }[]>`update accounts set role = ${role} where id = ${id} returning username`;
  return rows[0]?.username || null;
}

// Issues a fresh single-use setup link and invalidates any earlier unused ones.
// The raw token is stored encrypted so the admin page can show the link again
// until it is used or expires; lookups go through the hash.
export async function createSetupLink(accountId: string, createdBy: string) {
  const sql = await dbReady();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SETUP_LINK_DAYS * 24 * 60 * 60 * 1000);
  const rows = await sql.begin(async (tx) => {
    await tx`update password_setup_tokens set used_at = now() where account_id = ${accountId} and used_at is null`;
    return tx<{ expires_at: Date; created_at: Date }[]>`
      insert into password_setup_tokens (account_id, token_hash, token_encrypted, created_by, expires_at)
      values (${accountId}, ${hashToken(token)}, ${encryptSecret(token)}, ${createdBy}, ${expiresAt})
      returning expires_at, created_at
    `;
  });
  return { token, expires_at: rows[0].expires_at, created_at: rows[0].created_at } satisfies SetupLink;
}

export async function getPendingSetupLink(accountId: string): Promise<SetupLink | null> {
  const sql = await dbReady();
  const rows = await sql<{ token_encrypted: string; expires_at: Date; created_at: Date }[]>`
    select token_encrypted, expires_at, created_at from password_setup_tokens
    where account_id = ${accountId} and used_at is null and expires_at > now()
    order by created_at desc limit 1
  `;
  if (!rows[0]) return null;
  try {
    return { token: decryptSecret(rows[0].token_encrypted), expires_at: rows[0].expires_at, created_at: rows[0].created_at };
  } catch {
    return null;
  }
}

export async function findSetupToken(token: string) {
  if (!/^[A-Za-z0-9_-]{40,50}$/.test(token)) return null;
  const sql = await dbReady();
  const rows = await sql<{ id: string; account_id: string; username: string; role: Role }[]>`
    select t.id, t.account_id, a.username, a.role from password_setup_tokens t
    join accounts a on a.id = t.account_id
    where t.token_hash = ${hashToken(token)} and t.used_at is null and t.expires_at > now()
    limit 1
  `;
  return rows[0] || null;
}

// Sets the password for the account behind a setup link and burns the link.
export async function completeSetup(token: string, password: string): Promise<{ error: string; username?: undefined; role?: undefined } | { username: string; role: Role; error?: undefined }> {
  const passwordError = validatePassword(password);
  if (passwordError) return { error: passwordError };
  const sql = await dbReady();
  const hash = await bcrypt.hash(password, 12);
  const result = await sql.begin(async (tx) => {
    const claimed = await tx<{ account_id: string }[]>`
      update password_setup_tokens set used_at = now()
      where token_hash = ${hashToken(token)} and used_at is null and expires_at > now()
      returning account_id
    `;
    if (!claimed[0]) return null;
    const rows = await tx<{ username: string; role: Role }[]>`
      update accounts set password_hash = ${hash} where id = ${claimed[0].account_id} returning username, role
    `;
    return rows[0] || null;
  });
  return result ? { username: result.username, role: result.role } : { error: "This setup link is no longer valid. Ask your admin for a new one." };
}
