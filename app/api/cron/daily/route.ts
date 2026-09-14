import { NextRequest, NextResponse } from "next/server";
import { sendDueAnnouncements } from "@/lib/scheduled-delivery";
import { logEvent } from "@/lib/log";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    await logEvent({ action: "cron_request", actor: "cron", role: "system", success: false, details: { path: request.nextUrl.pathname, reason: expected ? "Invalid authorization" : "CRON_SECRET not configured" } });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await logEvent({ action: "cron_request", actor: "cron", role: "system", details: { path: request.nextUrl.pathname } });
  const result = await sendDueAnnouncements(new Date(), "cron");
  return NextResponse.json(result, { status: result.success ? 200 : 500 });
}
