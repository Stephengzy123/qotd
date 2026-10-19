"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { cacheRevision, invalidateSharedCache, sharedCacheConfigured } from "@/lib/shared-cache";
import { publicLiveIdentity, publicTimetableConfig, publicUpdateHistory, publicUpdateNotice } from "@/lib/public-data";
import { getLiveMessages, parseLiveCursor } from "@/lib/live-messages";
import { loadPublicCalendar } from "@/lib/admin-calendar";
import { rememberNextDelivery } from "@/lib/delivery-clock";

export async function refreshPublicCacheAction() {
  await requireRole("admin");
  if (!sharedCacheConfigured()) redirect("/admin/settings?error=Connect+Upstash+Redis+first.");
  try {
    // Confirm Redis is reachable before reporting a successful warm-up.
    await cacheRevision("public");
    await invalidateSharedCache("public", "schedule");
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Vancouver", year: "numeric", month: "numeric" }).formatToParts(now);
    const year = Number(parts.find(part => part.type === "year")!.value);
    const schoolYear = year - (Number(parts.find(part => part.type === "month")!.value) < 8 ? 1 : 0);
    await Promise.all([
      publicLiveIdentity(), publicTimetableConfig(), publicUpdateHistory(), publicUpdateNotice(),
      loadPublicCalendar(`${schoolYear}-08-01`, `${schoolYear + 1}-07-31`),
      loadPublicCalendar(`${year - 1}-08-01`, `${year + 2}-07-31`, true),
      (async () => {
        const latest = await getLiveMessages("all", null, null);
        const cursor = latest.messages.at(-1)?.cursor;
        if (cursor) await getLiveMessages("all", null, parseLiveCursor(cursor));
      })(),
      (async () => rememberNextDelivery(await cacheRevision("schedule"), now))(),
    ]);
  } catch {
    redirect("/admin/settings?error=Could+not+refresh+the+cache.+Check+Redis,+Neon,+and+the+calendar+source.");
  }
  redirect("/admin/settings?ok=Public+cache+refreshed.+The+next+delivery+check+time+has+been+saved.");
}
