"use server";

import { requireRole } from "@/lib/auth";
import { dbReady } from "@/lib/db";
import { tokenHash, validateClasses } from "@/lib/personal-timetable";

export async function personalTimetableAction(operation: "load" | "save" | "revoke", token: string, input?: unknown): Promise<{ classes?: Record<string, string>; error?: string }> {
  const session = await requireRole("admin");
  const owner = session.accountId ? `account:${session.accountId}` : `username:${session.username}`;
  try {
    const hash = tokenHash(token);
    const classes = operation === "save" ? validateClasses(input) : undefined;
    const sql = await dbReady();
    if (operation === "save") {
      const rows = await sql`insert into personal_timetables (token_hash, owner_key, classes)
        values (${hash}, ${owner}, ${JSON.stringify(classes)}::jsonb)
        on conflict (token_hash) do update set classes = excluded.classes, updated_at = now()
        where personal_timetables.owner_key = ${owner} and personal_timetables.revoked_at is null returning token_hash`;
      if (!rows.length) return { error: "This link was revoked or belongs to another account. Reset the browser's remembered link." };
      return { classes };
    }
    if (operation === "revoke") {
      await sql`update personal_timetables set revoked_at = now(), classes = '{}'::jsonb where token_hash = ${hash} and owner_key = ${owner}`;
      return {};
    }
    if (operation !== "load") return { error: "Unknown operation." };
    const rows = await sql<{ classes: Record<string, string> }[]>`select classes from personal_timetables where token_hash = ${hash} and owner_key = ${owner} and revoked_at is null`;
    return { classes: rows[0]?.classes };
  } catch {
    return { error: "Could not load or save your timetable. Check class names (maximum 100 characters each) and try again." };
  }
}
