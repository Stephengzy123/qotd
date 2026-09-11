import { NextRequest, NextResponse } from "next/server";
import { dbReady } from "@/lib/db";
import { addDays, pacificParts, sendAnnouncement } from "@/lib/qotd";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { localDate, hour } = pacificParts();
  if (hour !== 18) return NextResponse.json({ success: true, skipped: true, reason: "Not the 6 PM Pacific hour", localDate, hour });
  const tomorrow = addDays(localDate, 1);
  const sql = await dbReady();
  const due = await sql<{ id: string }[]>`
    select id from questions
    where status = 'approved' and (
      (question_type = 'announcement' and scheduled_date <= ${tomorrow}) or
      (question_type = 'event' and scheduled_date <= ${localDate})
    )
    order by scheduled_date asc, created_at asc
  `;
  const failures: string[] = [];
  let sent = 0;
  for (const announcement of due) {
    const result = await sendAnnouncement(announcement.id, "scheduled", localDate);
    if ("error" in result) failures.push(result.error || "Scheduled delivery failed.");
    else sent += 1;
  }
  return NextResponse.json({ success: failures.length === 0, localDate, tomorrow, sent, failures }, { status: failures.length ? 500 : 200 });
}
