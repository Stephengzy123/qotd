import { dbReady } from "@/lib/db";
import { parsePushSubscription } from "@/lib/push-validation";
import { normalizePushPreferences, validatePushPreferences } from "@/lib/push-preferences";

async function handle(request: Request, update: boolean) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response("Forbidden", { status: 403 });
  const reader = request.body?.getReader();
  if (!reader) return new Response("Invalid subscription", { status: 400 });
  let size = 0, body = "";
  const decoder = new TextDecoder();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 4096) { await reader.cancel(); return new Response("Too large", { status: 413 }); }
    body += decoder.decode(value, { stream: true });
  }
  let subscription: ReturnType<typeof parsePushSubscription>;
  let preferences: ReturnType<typeof validatePushPreferences> | null = null;
  try {
    const input = JSON.parse(body + decoder.decode());
    subscription = parsePushSubscription(input.subscription);
    if (update) preferences = validatePushPreferences(input.preferences);
  } catch { return new Response("Invalid notification preferences", { status: 400 }); }
  if (!subscription) return new Response("Invalid subscription", { status: 400 });
  const sql = await dbReady();
  const { endpoint, keys } = subscription;
  const rows = update
    ? await sql`update push_subscriptions set preferences = ${sql.json(preferences!)} where endpoint = ${endpoint} and auth = ${keys.auth} and p256dh = ${keys.p256dh} returning preferences`
    : await sql`select preferences from push_subscriptions where endpoint = ${endpoint} and auth = ${keys.auth} and p256dh = ${keys.p256dh}`;
  if (!rows.length) return new Response("Subscription not found. Enable notifications again.", { status: 404 });
  return Response.json({ preferences: normalizePushPreferences(rows[0].preferences) }, { headers: { "Cache-Control": "no-store" } });
}

export const POST = (request: Request) => handle(request, false);
export const PATCH = (request: Request) => handle(request, true);
