"use server";

import { requireRole } from "@/lib/auth";
import { dbReady } from "@/lib/db";
import { decryptSecret, validateDiscordWebhook } from "@/lib/security";
import { getWebhookDetails } from "@/lib/webhook-details";
import { quickMessage } from "@/lib/quick-message";
import { scheduleLivePush } from "@/lib/web-push";
import { logEvent } from "@/lib/log";
import { revalidatePath } from "next/cache";

type Result = { error?: string; success?: string };

export async function quickAnnounceAction(_previous: Result, form: FormData): Promise<Result> {
  const session = await requireRole("admin");
  const nickname = String(form.get("nickname") || "").trim();
  const body = String(form.get("message") || "");
  const destination = String(form.get("destination") || "live");
  const requestId = String(form.get("requestId") || "");
  if (!nickname || nickname.length > 80 || /[\r\n\x00-\x1f]/.test(nickname)) return { error: "Enter a nickname of 1–80 characters." };
  if (!["discord", "live"].includes(destination)) return { error: "Choose a valid destination." };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) return { error: "Reload this page before sending." };
  if (!body.trim() || body.length > 2000) return { error: "Write a message of 1–2,000 characters." };
  const sql = await dbReady();
  const settings = (await sql`select webhook_url_encrypted, mention_role_id from settings where singleton = true`)[0];
  const message = quickMessage(body);
  if (!message || message.length > 2000) return { error: "The message must be 1–2,000 characters after removing pings." };
  let webhook: URL | null = null;
  if (destination === "discord") {
    if (!settings?.webhook_url_encrypted) return { error: "Configure the announcement webhook first." };
    try {
      const decrypted = decryptSecret(settings.webhook_url_encrypted);
      if (!validateDiscordWebhook(decrypted)) return { error: "The announcement webhook is invalid." };
      webhook = new URL(decrypted);
      webhook.searchParams.set("wait", "true");
    } catch { return { error: "The announcement webhook could not be read." }; }
  }
  const profile = await getWebhookDetails(settings?.webhook_url_encrypted);
  const avatar = profile.status === "connected" ? profile.avatarUrl : null;
  // The UUID is a per-draft idempotency key: double-clicks/replayed actions do not resend.
  const rows = await sql`insert into dispatches (id, mode, message, success, question_type, destination, sender_name, sender_avatar_url)
    values (${requestId}, 'manual_selected', ${message}, ${destination === "live"}, 'announcement', ${destination}, ${nickname}, ${avatar})
    on conflict (id) do nothing returning id`;
  if (!rows.length) return { error: "This send was already attempted. Check Recent sends before starting another." };
  let error: string | null = null, status: number | null = null;
  if (webhook) {
    try {
      const response = await fetch(webhook, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: nickname, content: message, allowed_mentions: { parse: [], users: [], roles: [], replied_user: false } }),
        redirect: "error", signal: AbortSignal.timeout(10000),
      });
      status = response.status;
      if (!response.ok) error = `Discord rejected the message (HTTP ${status}). Check the nickname, message, and webhook.`;
    } catch { error = "Discord delivery could not be confirmed. Check the channel before trying again to avoid a duplicate."; }
    await sql`update dispatches set success = ${!error}, response_status = ${status}, error = ${error} where id = ${requestId}`;
  }
  await logEvent({ action: "quick_announcement", actor: session.username, role: session.role, success: !error, details: { dispatchId: requestId, nickname, destination, ping: false, responseStatus: status } });
  if (!error) scheduleLivePush(requestId);
  revalidatePath("/admin", "layout"); revalidatePath("/live"); revalidatePath("/contribute");
  return error ? { error } : { success: destination === "live" ? "Published to /live." : "Sent to Discord and /live." };
}
