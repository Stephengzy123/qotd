import { NextRequest, NextResponse } from "next/server";
import { dbReady } from "@/lib/db";
import { pacificParts, sendAnnouncement } from "@/lib/qotd";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { localDate } = pacificParts();
  const sql = await dbReady();
  const due = await sql<{ id: string }[]>`
    select id from questions
    where status = 'approved' and scheduled_date <= ${localDate}
    order by scheduled_date asc, created_at asc
  `;
  const failures: string[] = [];
  let sent = 0;
  for (const announcement of due) {
    const result = await sendAnnouncement(announcement.id, "scheduled", localDate);
    if ("error" in result) failures.push(result.error || "Scheduled delivery failed.");
    else sent += 1;
  }
  return NextResponse.json({ success: failures.length === 0, localDate, sent, failures }, { status: failures.length ? 500 : 200 });
}
