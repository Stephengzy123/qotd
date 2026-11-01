import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { Redis } from "@upstash/redis";

type Scope = "public" | "schedule";
type Entry<T> = { value: T; loadedAt: number; retryAt?: number } | { failed: true; retryAt: number };
let client: Redis | undefined;

export function sharedCacheConfigured() {
  return Boolean((process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL) && (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN));
}

function redis() {
  if (!sharedCacheConfigured()) return null;
  client ??= new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN!,
    retry: { retries: 1, backoff: () => 100 },
    signal: () => AbortSignal.timeout(2500),
  });
  return client;
}

function key(name: string) {
  // Preview deployments must never invalidate production or share another DB's cache.
  const environment = process.env.VERCEL_ENV || "development";
  const identity = `${process.env.DATABASE_URL || ""}:${environment}:${environment === "preview" ? process.env.VERCEL_GIT_COMMIT_REF || "" : ""}`;
  const namespace = createHash("sha256").update(identity).digest("hex").slice(0, 20);
  return `announcements:v1:${namespace}:${name}`;
}

export async function cacheRevision(scope: Scope): Promise<string | null> {
  const store = redis();
  if (!store) return null;
  const revisionKey = key(`${scope}:revision`);
  const saved = await store.get<string>(revisionKey);
  if (saved) return saved;
  const revision = randomUUID();
  const created = await store.set(revisionKey, revision, { nx: true });
  return created ? revision : await store.get<string>(revisionKey);
}

export async function invalidateSharedCache(...scopes: Scope[]) {
  const store = redis();
  if (!store) return;
  try {
    await Promise.all([...new Set(scopes)].map(scope => store.set(key(`${scope}:revision`), randomUUID())));
  } catch {
    console.error("[cache] Invalidation failed; public copies refresh within their normal one-hour freshness window.");
  }
}

export async function cachedRead<T>(name: string, load: () => Promise<T>, maxAgeSeconds = 3600): Promise<T> {
  let entry: Entry<T> | null = null;
  let entryKey: string | null = null;
  let store: Redis | null = null;
  try {
    store = redis();
    const revision = await cacheRevision("public");
    if (store && revision) {
      entryKey = key(`public:${revision}:${createHash("sha256").update(name).digest("hex")}`);
      entry = await store.get<Entry<T>>(entryKey);
    }
  } catch {
    // Optional cache outage: preserve the existing DB-backed behavior.
    store = null;
  }
  const now = Date.now();
  if (entry && "value" in entry && (now - entry.loadedAt < maxAgeSeconds * 1000 || (entry.retryAt || 0) > now)) return entry.value;
  if (entry && "failed" in entry && entry.retryAt > now) throw new Error("Data temporarily unavailable. Please retry shortly.");
  try {
    const value = await load();
    if (store && entryKey) {
      try { await store.set(entryKey, { value, loadedAt: now }, { ex: 30 * 86400 }); } catch { /* A cache write must not fail a successful read. */ }
    }
    return value;
  } catch (error) {
    if (store && entryKey) {
      // Keep the last good copy during a DB outage; back off instead of retrying
      // Neon on every poll. Revisions prevent a load racing an edit from winning.
      const replacement = entry && "value" in entry ? { ...entry, retryAt: now + 300_000 } : { failed: true, retryAt: now + 60_000 };
      try { await store.set(entryKey, replacement, { ex: entry && "value" in entry ? 30 * 86400 : 60 }); } catch {}
    }
    if (entry && "value" in entry) return entry.value;
    throw error;
  }
}

export async function readScheduleHint(): Promise<{ revision: string | null; nextCheckAt: number | null }> {
  try {
    const store = redis();
    const revision = await cacheRevision("schedule");
    if (!store || !revision) return { revision: null, nextCheckAt: null };
    if (await store.get(key("schedule:editing"))) return { revision: null, nextCheckAt: null };
    const hint = await store.get<{ revision: string; nextCheckAt: number }>(key("schedule:next"));
    return { revision, nextCheckAt: hint?.revision === revision && Number.isFinite(hint.nextCheckAt) ? hint.nextCheckAt : null };
  } catch { return { revision: null, nextCheckAt: null }; }
}

export async function prepareScheduleChange() {
  const store = redis();
  if (!store) return;
  try {
    // Atomically expire the old hint before changing Neon. A cron racing the
    // save may run, but cannot cache the pre-edit schedule during this window.
    await store.multi()
      .set(key("schedule:revision"), randomUUID())
      .set(key("schedule:editing"), true, { ex: 120 })
      .exec();
  } catch {
    throw new Error("The scheduling cache is unavailable. Try saving again shortly.");
  }
}

export async function writeScheduleHint(revision: string | null, nextCheckAt: number) {
  if (!revision) return;
  try { await redis()?.set(key("schedule:next"), { revision, nextCheckAt }, { ex: 2 * 86400 }); }
  catch { console.warn("[cache] Could not save the next delivery check time."); }
}
