import { NextRequest, NextResponse } from "next/server";
import { sendDueAnnouncements } from "@/lib/scheduled-delivery";
import { logEvent } from "@/lib/log";
import { syncLunchMenus } from "@/lib/lunch-menu";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    await logEvent({ action: "cron_request", actor: "cron", role: "system", success: false, details: { path: request.nextUrl.pathname, reason: expected ? "Invalid authorization" : "CRON_SECRET not configured" } });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await sendDueAnnouncements(new Date(), "cron");
  const lunchMenu = await syncLunchMenus().catch(async (error) => {
    const message = error instanceof Error ? error.message : String(error);
    await logEvent({ action: "refresh_lunch_menu", actor: "cron", role: "system", success: false, details: { error: message } });
    return { error: message };
  });
  if (result.sent || result.failures.length) await logEvent({ action: "cron_request", actor: "cron", role: "system", success: result.success, details: { path: request.nextUrl.pathname, sent: result.sent, failures: result.failures } });
  return NextResponse.json({ ...result, lunchMenu }, { status: result.success ? 200 : 500 });
}
