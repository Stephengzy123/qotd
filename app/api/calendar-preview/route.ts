import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { dbReady } from "@/lib/db";
import { calendarHeading, getCalendarByDate } from "@/lib/calendar";
import { errorDetail, logEvent } from "@/lib/log";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || (session.role !== "contributor" && session.role !== "admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const date = request.nextUrl.searchParams.get("date") || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }
  const sql = await dbReady();
  const settings = (await sql`select calendar_feed_url_encrypted from settings where singleton = true`)[0];
  if (!settings?.calendar_feed_url_encrypted) return NextResponse.json({ calendar: "" });
  try {
    const titles = await getCalendarByDate(settings.calendar_feed_url_encrypted as string, date);
    return NextResponse.json({ calendar: calendarHeading(titles) });
  } catch (error) {
    await logEvent({ action: "calendar_preview", actor: session.username, role: session.role, success: false, details: { date, error: errorDetail(error) } });
    return NextResponse.json({ error: "Calendar unavailable" }, { status: 502 });
  }
}
