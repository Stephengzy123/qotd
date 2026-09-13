import { NextRequest, NextResponse } from "next/server";
import { sendDueAnnouncements } from "@/lib/scheduled-delivery";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await sendDueAnnouncements();
  return NextResponse.json(result, { status: result.success ? 200 : 500 });
}
