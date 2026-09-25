"use server";

import { headers } from "next/headers";
import { dbReady } from "@/lib/db";
import { hashAddress } from "@/lib/security";
import { tokenHash, validateClasses, restoreClasses } from "@/lib/personal-timetable";

export async function publicTimetableAction(operation: "load" | "save" | "revoke", readToken: string, editToken: string, input?: unknown): Promise<{ classes?: Record<string, string>; error?: string }> {
  try {
    const hash = tokenHash(readToken);
    const owner = `public:${tokenHash(editToken)}`;
    const sql = await dbReady();
    if (operation === "load") {
      const rows = await sql<{ classes: unknown }[]>`select classes from personal_timetables where token_hash = ${hash} and owner_key = ${owner} and revoked_at is null`;
      return rows[0] ? { classes: restoreClasses(rows[0].classes) } : { error: "This browser's saved timetable could not be found. Reset the remembered link if you want to start again." };
    }
    if (operation === "revoke") {
      const rows = await sql`update personal_timetables set revoked_at = now(), classes = '{}'::jsonb where token_hash = ${hash} and owner_key = ${owner} and revoked_at is null returning token_hash`;
      return rows.length ? {} : { error: "This timetable could not be revoked. It may already have been reset." };
    }
    if (operation !== "save") return { error: "Unknown operation." };
    const classes = validateClasses(input);
    const requestHeaders = await headers();
    const address = hashAddress(requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown");
    const saved = await sql.begin(async tx => {
      await tx`select pg_advisory_xact_lock(hashtext(${address}))`;
      const existing = await tx`select token_hash from personal_timetables where token_hash = ${hash} and owner_key = ${owner} and revoked_at is null`;
      if (!existing.length) {
        const count = (await tx`select count(*)::int as n from personal_timetables where address_hash = ${address} and updated_at > now() - interval '1 hour'`)[0].n;
        if (count >= 20) return "limited";
      }
      const rows = await tx`insert into personal_timetables (token_hash, owner_key, classes, address_hash)
        values (${hash}, ${owner}, ${tx.json(classes)}, ${address})
        on conflict (token_hash) do update set classes = excluded.classes, updated_at = now()
        where personal_timetables.owner_key = ${owner} and personal_timetables.revoked_at is null returning token_hash`;
      return rows.length ? "saved" : "conflict";
    });
    if (saved === "limited") return { error: "Too many new timetables from this connection. Try again later." };
    if (saved !== "saved") return { error: "This link was revoked or belongs to another browser. Reset the remembered link." };
    return { classes };
  } catch { return { error: "Could not load or save the timetable. Check your class names and try again." }; }
}
