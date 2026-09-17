import "server-only";
import { dbReady } from "@/lib/db";
import { errorDetail, logEvent } from "@/lib/log";
import { decryptSecret, encryptSecret } from "@/lib/security";

export type ClubChannel = { account_id: string; webhook_url_encrypted: string | null; updated_by: string | null; updated_at: Date };
export type ClubPost = { id: string; username: string; message: string; success: boolean; error: string | null; created_at: Date };

// Discord rejects webhook messages longer than 2,000 characters.
export const CLUB_POST_MAX_LENGTH = 2000;

export async function getClubChannel(accountId: string) {
  const sql = await dbReady();
  const rows = await sql<ClubChannel[]>`select account_id, webhook_url_encrypted, updated_by, updated_at from club_channels where account_id = ${accountId} limit 1`;
  return rows[0] || null;
}

// Each club leader account posts to exactly one webhook, so one channel.
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
  return sql<ClubPost[]>`select id, username, message, success, error, created_at from club_posts where account_id = ${accountId} order by created_at desc limit ${limit}`;
}

export async function postClubMessage(account: { id: string; username: string }, message: string): Promise<{ error: string; success?: undefined } | { success: true; error?: undefined }> {
  const channel = await getClubChannel(account.id);
  if (!channel?.webhook_url_encrypted) return { error: "Your channel isn’t connected yet. Ask an admin to add your webhook." };
  let responseStatus: number | null = null;
  let errorMessage: string | null = null;
  try {
    const response = await fetch(decryptSecret(channel.webhook_url_encrypted), {
      method: "POST",
      headers: { "content-type": "application/json" },
      // Explicit @user and @role mentions work; @everyone and @here do not.
      body: JSON.stringify({ content: message, allowed_mentions: { parse: ["users", "roles"] } }),
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
    responseStatus = response.status;
    if (!response.ok) errorMessage = `Discord returned HTTP ${response.status}.`;
  } catch (error) {
    errorMessage = errorDetail(error) || "The Discord request failed.";
  }
  const success = !errorMessage;
  const sql = await dbReady();
  const rows = await sql<{ id: string }[]>`
    insert into club_posts (account_id, username, message, success, response_status, error)
    values (${account.id}, ${account.username}, ${message}, ${success}, ${responseStatus}, ${errorMessage})
    returning id
  `;
  await logEvent({ action: "club_post", actor: account.username, role: "club_leader", success, details: { postId: rows[0]?.id, responseStatus, error: errorMessage ?? undefined, messageLength: message.length } });
  return success ? { success: true } : { error: errorMessage || "Send failed." };
}
