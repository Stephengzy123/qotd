import "server-only";
import { dbReady } from "@/lib/db";
import { errorDetail, logEvent } from "@/lib/log";
import { encryptSecret } from "@/lib/security";
import { resolveWebhooks, deliverWebhooks } from "@/lib/webhook-destinations";

export type ClubChannel = { account_id: string; webhook_url_encrypted: string | null; updated_by: string | null; updated_at: Date };
export type ClubPost = { id: string; username: string; message: string; success: boolean; error: string | null; created_at: Date; destination_name: string | null };

// Discord rejects webhook messages longer than 2,000 characters.
export const CLUB_POST_MAX_LENGTH = 2000;

export async function getClubChannel(accountId: string) {
  const sql = await dbReady();
  const rows = await sql<ClubChannel[]>`select account_id, webhook_url_encrypted, updated_by, updated_at from club_channels where account_id = ${accountId} limit 1`;
  return rows[0] || null;
}

// Original per-account webhook remains an optional destination alongside saved assignments.
export async function saveClubWebhook(accountId: string, webhookUrl: string, updatedBy: string) {
  const sql = await dbReady();
  await sql`
    insert into club_channels (account_id, webhook_url_encrypted, updated_by, updated_at)
    values (${accountId}, ${encryptSecret(webhookUrl)}, ${updatedBy}, now())
    on conflict (account_id) do update set webhook_url_encrypted = excluded.webhook_url_encrypted, updated_by = excluded.updated_by, updated_at = now()
  `;
}

export async function listClubPosts(accountId: string, limit = 20) {
  const sql = await dbReady();
  return sql<ClubPost[]>`select id, username, message, success, error, created_at, destination_name from club_posts where account_id = ${accountId} order by created_at desc limit ${limit}`;
}

export async function postClubDestinations(account: { id: string; username: string }, message: string, ids: string[], requestId: string) {
  if (!message.trim() || message.length > CLUB_POST_MAX_LENGTH) return { error: "Write a message of 1–2,000 characters." };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) return { error: "Reload before posting." };
  let targets;
  try { targets = await resolveWebhooks(ids, account.id); }
  catch (error) { return { error: errorDetail(error) }; }
  const sql = await dbReady();
  const claimed = await sql`insert into club_send_requests (id, account_id) values (${requestId}, ${account.id}) on conflict do nothing returning id`;
  if (!claimed.length) return { error: "This post was already attempted. Check post history before starting another." };
  // This path intentionally never writes to dispatches or schedules live push.
  const results = await deliverWebhooks(targets, { content: message, allowed_mentions: { parse: ["users", "roles"] } });
  for (const result of results) {
    await sql`insert into club_posts (account_id, username, message, success, response_status, error, destination_name)
      values (${account.id}, ${account.username}, ${message}, ${result.success}, ${result.status}, ${result.error}, ${result.name})`;
  }
  const failures = results.filter(result => !result.success);
  await logEvent({ action: "club_post", actor: account.username, role: "club_leader", success: !failures.length, details: { requestId, destinations: results } });
  return failures.length ? { error: `Sent to ${results.length - failures.length}/${results.length} destinations. ${failures.map(r => `${r.name}: ${r.error}`).join(" ")} Check history; do not resend to successful destinations.` } : { success: true };
}
