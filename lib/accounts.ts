import "server-only";
import bcrypt from "bcryptjs";
import { dbReady } from "@/lib/db";
import type { Role } from "@/lib/auth";

export type Account = { id: string; username: string; role: Role; created_by: string | null; created_at: Date };

export const USERNAME_PATTERN = /^[A-Za-z0-9._-]{2,64}$/;

function envUsernames() {
  return [process.env.ADMIN_USERNAME, process.env.CONTRIBUTOR_USERNAME].filter((value): value is string => Boolean(value));
}

export async function listAccounts() {
  const sql = await dbReady();
  return sql<Account[]>`select id, username, role, created_by, created_at from accounts order by created_at asc`;
}

export async function findAccount(username: string) {
  const sql = await dbReady();
  const rows = await sql<{ username: string; role: Role; password_hash: string }[]>`
    select username, role, password_hash from accounts where lower(username) = lower(${username}) limit 1
  `;
  return rows[0] || null;
}

export async function createAccount(username: string, password: string, role: Role, createdBy: string): Promise<{ error: string; id?: undefined } | { id: string; error?: undefined }> {
  if (!USERNAME_PATTERN.test(username)) return { error: "Usernames must be 2–64 letters, numbers, dots, underscores, or dashes." };
  if (password.length < 8 || password.length > 128) return { error: "Passwords must be between 8 and 128 characters." };
  if (envUsernames().some((value) => value.toLowerCase() === username.toLowerCase())) return { error: "That username is already in use." };
  const sql = await dbReady();
  const hash = await bcrypt.hash(password, 12);
  const rows = await sql<{ id: string }[]>`
    insert into accounts (username, password_hash, role, created_by)
    values (${username}, ${hash}, ${role}, ${createdBy})
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
