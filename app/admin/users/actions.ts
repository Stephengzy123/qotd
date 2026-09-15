"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { dbReady } from "@/lib/db";

export async function addUserAction(formData: FormData) {
  await requireRole("admin");
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "");
  const fail = (message: string): never => redirect(`/admin/users?error=${encodeURIComponent(message)}`);
  if (!/^[a-zA-Z0-9_.-]{3,40}$/.test(username)) fail("Use 3–40 letters, numbers, dots, underscores, or hyphens for the username.");
  if (password.length < 12 || Buffer.byteLength(password, "utf8") > 72) fail("Use a password of at least 12 characters and at most 72 bytes.");
  if ([process.env.ADMIN_USERNAME, process.env.CONTRIBUTOR_USERNAME].some((name) => name?.toLowerCase() === username.toLowerCase())) fail("That username is already in use.");
  const hash = await bcrypt.hash(password, 12);
  const sql = await dbReady();
  const added = await sql`insert into app_users (username, password_hash) values (${username}, ${hash}) on conflict do nothing returning id`;
  if (!added.length) fail("That username is already in use.");
  revalidatePath("/admin/users");
  redirect("/admin/users?ok=Contributor%20account%20created.");
}
