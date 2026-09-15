import "server-only";
import { scheduleLivePush } from "@/lib/web-push";
import { dbReady } from "@/lib/db";
import { addDays, pacificParts, sendAnnouncement } from "@/lib/qotd";
import { logEvent } from "@/lib/log";

// Both entry points share eligibility and the atomic claim in sendAnnouncement.
export async function sendDueAnnouncements(now = new Date(), trigger: "cron" | "page_load" = "cron") {
  const { localDate, hour } = pacificParts(now);
  if (hour !== 18) return { success: true, skipped: true, sent: 0, failures: [] as string[], reason: "Not the 6 PM Pacific hour", localDate, hour };
  const tomorrow = addDays(localDate, 1);
  const sql = await dbReady();
  const due = await sql<{ id: string }[]>`
    select id from questions
    where status = 'approved' and (
      (question_type = 'announcement' and scheduled_date - (days_early + 1) <= ${localDate}) or
      (question_type = 'event' and scheduled_date <= ${localDate})
    )
    order by scheduled_date asc, created_at asc
  `;
  const failures: string[] = [];
  let sent = 0;
  for (const announcement of due) {
    const result = await sendAnnouncement(announcement.id, "scheduled", localDate);
    if ("error" in result) failures.push(result.error || "Scheduled delivery failed.");
    else { sent += 1; scheduleLivePush(result.dispatchId); }
  }
  await logEvent({ action: "scheduled_delivery_run", actor: trigger, role: "system", success: failures.length === 0, details: { localDate, due: due.length, sent, failures } });
  return { success: failures.length === 0, localDate, tomorrow, sent, failures };
}
