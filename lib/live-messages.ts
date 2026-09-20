import "server-only";
import { dbReady } from "@/lib/db";
import { liveMessageText } from "@/lib/live-text";

type Row = {
  id: string; message: string; question_type: "announcement" | "event" | null; sent_time: string; hidden_from_live: boolean;
  sender_name: string | null; sender_avatar_url: string | null; reply_to_dispatch_id: string | null;
  reply_message: string | null; reply_sender_name: string | null; reply_sent_time: string | null;
};

function serializeLiveMessage(row: Row) {
  return {
    id: row.id,
    message: liveMessageText(row.message),
    senderName: row.sender_name,
    senderAvatarUrl: row.sender_avatar_url,
    hidden: row.hidden_from_live,
    type: row.question_type,
    human: row.sender_name !== null,
    sentAt: new Date(row.sent_time).toISOString(),
    cursor: Buffer.from(JSON.stringify({ time: row.sent_time, id: row.id })).toString("base64url"),
    replyTo: row.reply_to_dispatch_id ? {
      id: row.reply_to_dispatch_id,
      message: row.reply_message === null ? null : liveMessageText(row.reply_message),
      senderName: row.reply_sender_name,
      sentAt: row.reply_sent_time ? new Date(row.reply_sent_time).toISOString() : null,
      unavailable: row.reply_message === null,
    } : null,
  };
}
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
  const rows = await sql<Row[]>`select d.id, d.message, d.question_type, d.hidden_from_live, d.sender_name, d.sender_avatar_url,
      d.reply_to_dispatch_id, d.created_at::text as sent_time, r.message as reply_message,
      r.sender_name as reply_sender_name, r.created_at::text as reply_sent_time
    from dispatches d
    left join dispatches r on r.id = d.reply_to_dispatch_id and r.success = true and r.hidden_from_live = false
    where d.success = true and d.hidden_from_live = ${hidden}
    ${type === "all" ? sql`` : type === "human" ? sql`and d.sender_name is not null` : sql`and d.question_type = ${type}`}
    ${before ? sql`and (d.created_at, d.id) < (${before.time}::timestamptz, ${before.id}::uuid)` : sql``}
    ${after ? sql`and (d.created_at, d.id) > (${after.time}::timestamptz, ${after.id}::uuid)` : sql``}
    order by ${after ? sql`d.created_at asc, d.id asc` : sql`d.created_at desc, d.id desc`} limit 11`;
  const selected = rows.slice(0, 10);
  if (!after) selected.reverse();
  return {
    messages: selected.map(serializeLiveMessage),
    hasMore: rows.length > 10,
  };
}

export async function getLiveMessageById(id: string) {
  const sql = await dbReady();
  const rows = await sql<Row[]>`select d.id, d.message, d.question_type, d.hidden_from_live, d.sender_name, d.sender_avatar_url,
      d.reply_to_dispatch_id, d.created_at::text as sent_time, r.message as reply_message,
      r.sender_name as reply_sender_name, r.created_at::text as reply_sent_time
    from dispatches d
    left join dispatches r on r.id = d.reply_to_dispatch_id and r.success = true and r.hidden_from_live = false
    where d.id = ${id} and d.success = true and d.hidden_from_live = false limit 1`;
  return rows[0] ? serializeLiveMessage(rows[0]) : null;
}
