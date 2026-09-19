import "server-only";
import { dbReady } from "@/lib/db";
import { liveMessageText } from "@/lib/live-text";

type Row = { id: string; message: string; question_type: "announcement" | "event" | null; sent_time: string; hidden_from_live: boolean; sender_name: string | null; sender_avatar_url: string | null };
export function parseLiveCursor(value: string | null): { time: string; id: string } | null {
  if (!value) return null;
  if (value.length > 300) throw new Error("Invalid cursor");
  const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  if (typeof parsed.time !== "string" || !/^\d{4}-\d{2}-\d{2}[ T][0-9:.+Z-]+$/.test(parsed.time) || !Number.isFinite(Date.parse(parsed.time)) || typeof parsed.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parsed.id)) throw new Error("Invalid cursor");
  return { time: parsed.time, id: parsed.id };
}

export type LiveFilter = "all" | "announcement" | "event" | "human";

export async function getLiveMessages(type: LiveFilter, before: ReturnType<typeof parseLiveCursor>, after: ReturnType<typeof parseLiveCursor>, hidden = false) {
  const sql = await dbReady();
  const rows = await sql<Row[]>`select id, message, question_type, hidden_from_live, sender_name, sender_avatar_url, created_at::text as sent_time from dispatches
    where success = true and hidden_from_live = ${hidden}
    ${type === "all" ? sql`` : type === "human" ? sql`and sender_name is not null` : sql`and question_type = ${type}`}
    ${before ? sql`and (created_at, id) < (${before.time}::timestamptz, ${before.id}::uuid)` : sql``}
    ${after ? sql`and (created_at, id) > (${after.time}::timestamptz, ${after.id}::uuid)` : sql``}
    order by ${after ? sql`created_at asc, id asc` : sql`created_at desc, id desc`} limit 11`;
  const selected = rows.slice(0, 10);
  if (!after) selected.reverse();
  return {
    messages: selected.map(row => ({ id: row.id, message: liveMessageText(row.message), senderName: row.sender_name, senderAvatarUrl: row.sender_avatar_url, hidden: row.hidden_from_live, type: row.question_type, human: row.sender_name !== null, sentAt: new Date(row.sent_time).toISOString(), cursor: Buffer.from(JSON.stringify({ time: row.sent_time, id: row.id })).toString("base64url") })),
    hasMore: rows.length > 10,
  };
}
