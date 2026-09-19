"use server";

import { requireRole } from "@/lib/auth";
import { dbReady } from "@/lib/db";
import { resolveWebhooks, deliverWebhooks, selectedWebhookIds } from "@/lib/webhook-destinations";
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
  let targets: Awaited<ReturnType<typeof resolveWebhooks>> = [];
  if (destination === "discord") {
    try { targets = await resolveWebhooks(selectedWebhookIds(form) ?? ["primary"]); }
    catch (error) { return { error: error instanceof Error ? error.message : "Invalid Discord destinations." }; }
  }
  const profile = await getWebhookDetails(settings?.webhook_url_encrypted);
  const avatar = profile.status === "connected" ? profile.avatarUrl : null;
  // The UUID is a per-draft idempotency key: double-clicks/replayed actions do not resend.
  const rows = await sql`insert into dispatches (id, mode, message, success, question_type, destination, sender_name, sender_avatar_url)
    values (${requestId}, 'manual_selected', ${message}, ${destination === "live"}, 'announcement', ${destination}, ${nickname}, ${avatar})
    on conflict (id) do nothing returning id`;
  if (!rows.length) return { error: "This send was already attempted. Check Recent sends before starting another." };
  let error: string | null = null, status: number | null = null;
  let published = destination === "live";
  let results: Awaited<ReturnType<typeof deliverWebhooks>> = [];
  if (targets.length) {
    results = await deliverWebhooks(targets, { username: nickname, content: message, allowed_mentions: { parse: [], users: [], roles: [], replied_user: false } });
    published = results.some(result => result.success);
    status = results.length === 1 ? results[0].status : null;
    const failed = results.filter(result => !result.success);
    error = failed.length ? failed.map(result => `${result.name}: ${result.error}`).join(" ") : null;
    await sql`update dispatches set success = ${published}, response_status = ${status}, error = ${error} where id = ${requestId}`;
  }
  await logEvent({ action: "quick_announcement", actor: session.username, role: session.role, success: !error, details: { dispatchId: requestId, nickname, destination, ping: false, destinations: results, responseStatus: status } });
  if (published) scheduleLivePush(requestId);
  revalidatePath("/admin"); revalidatePath("/admin/sends"); revalidatePath("/live"); revalidatePath("/contribute");
  return error ? { error: `${error} Check Recent sends; do not resend to successful destinations.` } : { success: destination === "live" ? "Published to /live." : "Sent to Discord and /live." };
}
