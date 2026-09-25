"use server";

import { headers } from "next/headers";
import { getSession } from "@/lib/auth";
import { dbReady } from "@/lib/db";
import { hashAddress } from "@/lib/security";
import { tokenHash, validateClasses, restoreClasses } from "@/lib/personal-timetable";

export async function claimAdminTimetableAction(readToken: string, editToken: string): Promise<{ classes?: Record<string, string>; error?: string }> {
  const session = await getSession();
  if (session?.role !== "admin") return { error: "Sign in as an admin to connect the old timetable." };
  try {
    const hash = tokenHash(readToken);
    const editHash = tokenHash(editToken);
    const owner = session.accountId ? `account:${session.accountId}` : `username:${session.username}`;
    const sql = await dbReady();
    const rows = await sql<{ classes: unknown }[]>`update personal_timetables set public_edit_hash = ${editHash}
      where token_hash = ${hash} and owner_key = ${owner} and revoked_at is null
        and (public_edit_hash is null or public_edit_hash = ${editHash}) returning classes`;
    if (!rows[0]) return { error: "The old link was not found for this admin account, or is already connected to another browser." };
    return { classes: restoreClasses(rows[0].classes) };
  } catch { return { error: "Could not connect the old timetable. Try again later." }; }
}

export async function publicTimetableAction(operation: "load" | "save" | "revoke", readToken: string, editToken: string, input?: unknown): Promise<{ classes?: Record<string, string>; linkedAdmin?: boolean; detached?: boolean; error?: string }> {
  try {
    const hash = tokenHash(readToken);
    const editHash = tokenHash(editToken);
    const owner = `public:${editHash}`;
    const sql = await dbReady();
    if (operation === "load") {
      const rows = await sql<{ classes: unknown; owner_key: string }[]>`select classes, owner_key from personal_timetables where token_hash = ${hash} and (owner_key = ${owner} or public_edit_hash = ${editHash}) and revoked_at is null`;
      return rows[0] ? { classes: restoreClasses(rows[0].classes), linkedAdmin: rows[0].owner_key !== owner } : { error: "This browser's saved timetable could not be found. Reset the remembered link if you want to start again." };
    }
    if (operation === "revoke") {
      // A linked admin subscription must remain intact. Disconnect only this browser's edit key.
      const detached = await sql`update personal_timetables set public_edit_hash = null where token_hash = ${hash} and public_edit_hash = ${editHash} and revoked_at is null returning token_hash`;
      if (detached.length) return { detached: true };
      const rows = await sql`update personal_timetables set revoked_at = now(), classes = '{}'::jsonb where token_hash = ${hash} and owner_key = ${owner} and revoked_at is null returning token_hash`;
      return rows.length ? {} : { error: "This timetable could not be revoked. It may already have been reset." };
    }
    if (operation !== "save") return { error: "Unknown operation." };
    const classes = validateClasses(input);
    const requestHeaders = await headers();
    const address = hashAddress(requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown");
    const saved = await sql.begin(async tx => {
      await tx`select pg_advisory_xact_lock(hashtext(${address}))`;
      const existing = await tx`select token_hash from personal_timetables where token_hash = ${hash} and (owner_key = ${owner} or public_edit_hash = ${editHash}) and revoked_at is null`;
      if (!existing.length) {
        const count = (await tx`select count(*)::int as n from personal_timetables where address_hash = ${address} and updated_at > now() - interval '1 hour'`)[0].n;
        if (count >= 20) return "limited";
      }
      const rows = await tx`insert into personal_timetables (token_hash, owner_key, classes, address_hash)
        values (${hash}, ${owner}, ${tx.json(classes)}, ${address})
        on conflict (token_hash) do update set classes = excluded.classes, updated_at = now()
        where (personal_timetables.owner_key = ${owner} or personal_timetables.public_edit_hash = ${editHash}) and personal_timetables.revoked_at is null returning token_hash`;
      return rows.length ? "saved" : "conflict";
    });
    if (saved === "limited") return { error: "Too many new timetables from this connection. Try again later." };
    if (saved !== "saved") return { error: "This link was revoked or belongs to another browser. Reset the remembered link." };
    return { classes, linkedAdmin: owner !== (await sql<{ owner_key: string }[]>`select owner_key from personal_timetables where token_hash = ${hash}`)[0]?.owner_key };
  } catch { return { error: "Could not load or save the timetable. Check your class names and try again." }; }
}
