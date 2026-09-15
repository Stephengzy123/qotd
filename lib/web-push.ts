import "server-only";
import webpush from "web-push";
import { after } from "next/server";
import { dbReady } from "@/lib/db";
import { getWebhookDetails } from "@/lib/webhook-details";
import { liveMessageText } from "@/lib/live-text";
import { validPushEndpoint } from "@/lib/push-validation";

export function pushConfigured() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
}

export function scheduleLivePush(dispatchId: string) {
  if (!pushConfigured()) return;
  after(async () => {
    try { await deliverLivePush(dispatchId); }
    catch { console.error("[push] Delivery failed; Discord delivery is unaffected."); }
  });
}

async function deliverLivePush(dispatchId: string) {
  const sql = await dbReady();
  const message = (await sql`select message, created_at from dispatches where id = ${dispatchId} and success = true and hidden_from_live = false`)[0];
  if (!message) return;
  const settings = (await sql`select webhook_url_encrypted from settings where singleton = true`)[0];
  const profile = await getWebhookDetails(settings?.webhook_url_encrypted);
  const payload = JSON.stringify({
    title: profile.status === "connected" ? profile.name : "Announcements",
    body: liveMessageText(message.message).replace(/<a?:[^:>]+:\d+>/g, "").replace(/[*_~`#|]/g, "").replace(/\s+/g, " ").trim().slice(0, 180),
    icon: profile.status === "connected" ? profile.avatarUrl : null,
    tag: `announcement-${dispatchId}`,
  });
  // Page through subscriptions; bounded concurrency avoids opening a socket per visitor.
  let cursor = "";
  for (;;) {
    const rows = await sql<{ endpoint: string; p256dh: string; auth: string }[]>`
      select endpoint, p256dh, auth from push_subscriptions
      where endpoint > ${cursor} and created_at <= ${message.created_at}
      order by endpoint limit 20`;
    if (!rows.length) break;
    await Promise.all(rows.map(async row => {
      if (!validPushEndpoint(row.endpoint)) return;
      try {
        await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, payload, {
          TTL: 3600, timeout: 5000,
          vapidDetails: { subject: process.env.VAPID_SUBJECT!, publicKey: process.env.VAPID_PUBLIC_KEY!, privateKey: process.env.VAPID_PRIVATE_KEY! },
        });
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await sql`delete from push_subscriptions where endpoint = ${row.endpoint} and auth = ${row.auth}`;
        else console.warn("[push] Provider delivery failed", status ?? "network");
      }
    }));
    cursor = rows[rows.length - 1].endpoint;
  }
}
