import "server-only";

import { dbReady } from "@/lib/db";
import { getWebhookDetails } from "@/lib/webhook-details";
import { cachedRead } from "@/lib/shared-cache";
import { normalizeTimetable } from "@/lib/timetable";

export function publicLiveIdentity() {
  return cachedRead("live-identity", async () => {
    const sql = await dbReady();
    const settings = (await sql`select webhook_url_encrypted, live_channel_name from settings where singleton = true`)[0];
    const profile = await getWebhookDetails(settings?.webhook_url_encrypted);
    return {
      botName: profile.status === "connected" ? profile.name : "Announcements",
      channelName: String(settings?.live_channel_name || "Announcements"),
      avatarUrl: profile.status === "connected" ? profile.avatarUrl : null,
    };
  });
}

export function publicTimetableConfig() {
  return cachedRead("school-timetable", async () => {
    const sql = await dbReady();
    return normalizeTimetable((await sql`select timetable_config from settings where singleton = true`)[0]?.timetable_config);
  });
}

export function publicRotationSourceConfigured() {
  return cachedRead("rotation-source-configured", async () => {
    const sql = await dbReady();
    return Boolean((await sql`select calendar_feed_url_encrypted is not null as configured from settings where singleton = true`)[0]?.configured);
  });
}

export function publicUpdateNotice() {
  return cachedRead("update-notice", async () => {
    const sql = await dbReady();
    const row = (await sql<{ id: string | null; title: string | null; body: string | null; published_at: Date | null }[]>`
      select live_update_id as id, live_update_title as title, live_update_body as body, live_update_published_at as published_at from settings where singleton = true`)[0];
    return row?.id && row.title && row.body && row.published_at
      ? { id: row.id, title: row.title, body: row.body, publishedAt: row.published_at.toISOString() } : null;
  });
}

export function publicUpdateHistory() {
  return cachedRead("update-history", async () => {
    const sql = await dbReady();
    const rows = await sql<{ id: string; title: string; body: string; published_at: Date; edited_at: Date | null }[]>`
      select id, title, body, published_at, edited_at from update_history_entries order by published_at desc, id desc`;
    return rows.map(row => ({ ...row, published_at: row.published_at.toISOString(), edited_at: row.edited_at?.toISOString() || null }));
  });
}
