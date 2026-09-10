import { NextRequest, NextResponse } from "next/server";
import { pacificParts, sendQuestion } from "@/lib/qotd";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { localDate, hour } = pacificParts();
  if (hour !== 5) return NextResponse.json({ skipped: true, reason: "Not 5 AM Pacific", localDate });
  const result = await sendQuestion(null, "scheduled", localDate);
  if ("error" in result) {
    const message = result.error || "Scheduled delivery failed.";
    return NextResponse.json({ error: message }, { status: message.includes("already handled") ? 200 : 500 });
  }
  return NextResponse.json({ success: true, localDate });
}
