import { dbReady } from "@/lib/db";
import { hashAddress } from "@/lib/security";
import { parsePushSubscription } from "@/lib/push-validation";
import { pushConfigured } from "@/lib/web-push";

export function GET() {
  return Response.json({ publicKey: pushConfigured() ? process.env.VAPID_PUBLIC_KEY : null }, { headers: { "Cache-Control": "no-store" } });
}

async function mutate(request: Request, remove: boolean) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response("Forbidden", { status: 403 });
  if (!remove && !pushConfigured()) return new Response("Notifications are not configured yet.", { status: 503 });
  // Bound streamed bodies as well as Content-Length to prevent oversized submissions.
  const reader = request.body?.getReader();
  if (!reader) return new Response("Invalid subscription", { status: 400 });
  let body = "", size = 0;
  const decoder = new TextDecoder();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 4096) { await reader.cancel(); return new Response("Too large", { status: 413 }); }
    body += decoder.decode(value, { stream: true });
  }
  let subscription;
  try { subscription = parsePushSubscription(JSON.parse(body + decoder.decode())); } catch {}
  if (!subscription) return new Response("Invalid subscription", { status: 400 });
  const sql = await dbReady();
  const { endpoint, keys } = subscription;
  if (remove) {
    await sql`delete from push_subscriptions where endpoint = ${endpoint} and auth = ${keys.auth} and p256dh = ${keys.p256dh}`;
  } else {
    const address = hashAddress(request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown");
    const saved = await sql.begin(async tx => {
      await tx`select pg_advisory_xact_lock(hashtext(${address}))`;
      const existing = await tx`select endpoint from push_subscriptions where endpoint = ${endpoint} and auth = ${keys.auth} and p256dh = ${keys.p256dh}`;
      if (existing.length) return true;
      const count = (await tx`select count(*)::int as n from push_subscriptions where address_hash = ${address} and created_at > now() - interval '1 hour'`)[0].n;
      if (count >= 20) return false;
      await tx`insert into push_subscriptions (endpoint, p256dh, auth, address_hash)
        values (${endpoint}, ${keys.p256dh}, ${keys.auth}, ${address})
        on conflict (endpoint) do nothing`;
      return true;
    });
    if (!saved) return new Response("Too many subscriptions. Try again later.", { status: 429 });
  }
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

export const POST = (request: Request) => mutate(request, false);
export const DELETE = (request: Request) => mutate(request, true);
