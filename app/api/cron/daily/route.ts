import { NextRequest, NextResponse } from "next/server";
import { sendDueAnnouncements } from "@/lib/scheduled-delivery";
import { logEvent } from "@/lib/log";
import { syncLunchMenus } from "@/lib/lunch-menu";
import { invalidateSharedCache, readScheduleHint, writeScheduleHint } from "@/lib/shared-cache";
import { rememberNextDelivery } from "@/lib/delivery-clock";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    console.warn("[cron] Unauthorized cron request rejected.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const now = new Date();
  const hint = await readScheduleHint();
  if (hint.nextCheckAt && hint.nextCheckAt > now.getTime()) {
    return NextResponse.json({ success: true, skipped: true, reason: "Nothing scheduled yet", nextCheckAt: new Date(hint.nextCheckAt).toISOString() }, { headers: { "Cache-Control": "no-store" } });
  }
  try {
    const result = await sendDueAnnouncements(now, "cron");
    if (result.reason === "Another delivery run is already in progress") return NextResponse.json(result);
    // Wake for the daily 6 AM menu refresh, 6 PM send, or an exact send.
    const lunchMenu = await syncLunchMenus().catch(async (error) => {
      const message = error instanceof Error ? error.message : String(error);
      await logEvent({ action: "refresh_lunch_menu", actor: "cron", role: "system", success: false, details: { error: message } });
      return { error: message };
    });
    if (result.sent || ("changed" in lunchMenu && lunchMenu.changed)) await invalidateSharedCache("public");
    await rememberNextDelivery(hint.revision, now, !result.success);
    if (result.sent || result.failures.length) await logEvent({ action: "cron_request", actor: "cron", role: "system", success: result.success, details: { path: request.nextUrl.pathname, sent: result.sent, failures: result.failures } });
    return NextResponse.json({ ...result, lunchMenu }, { status: result.success ? 200 : 500, headers: { "Cache-Control": "no-store" } });
  } catch {
    // Do not hammer an exhausted/unavailable DB on each cron request.
    await writeScheduleHint(hint.revision, now.getTime() + 15 * 60_000);
    console.error("[cron] Delivery check unavailable; retrying after 15 minutes.");
    return NextResponse.json({ success: false, error: "Delivery check temporarily unavailable" }, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "900" } });
  }
}
