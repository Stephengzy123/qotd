import { NextResponse } from "next/server";
import { dbReady } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const sql = await dbReady();
    const rows = await sql<{ id: string | null; title: string | null; body: string | null; published_at: Date | null }[]>`
      select live_update_id as id, live_update_title as title, live_update_body as body,
        live_update_published_at as published_at
      from settings where singleton = true`;
    const row = rows[0];
    const update = row?.id && row.title && row.body && row.published_at
      ? { id: row.id, title: row.title, body: row.body, publishedAt: row.published_at.toISOString() }
      : null;
    return NextResponse.json({ update }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Update check unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
