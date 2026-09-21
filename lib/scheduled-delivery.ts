import "server-only";
import { scheduleLivePush } from "@/lib/web-push";
import { dbReady } from "@/lib/db";
import { addDays, pacificParts, sendAnnouncement } from "@/lib/qotd";
import { errorDetail, logEvent } from "@/lib/log";
import { sendCalendarFallback } from "@/lib/calendar-fallback";

// Both entry points share eligibility and the atomic claim in sendAnnouncement.
export async function sendDueAnnouncements(now = new Date(), trigger: "cron" | "page_load" = "cron") {
  const sql = await dbReady();
  const run = async () => {
    const { localDate, hour, minute } = pacificParts(now);
    const normalWindow = hour === 18;
    const tomorrow = addDays(localDate, 1);
    const due = await sql<{ id: string }[]>`
      select id from questions
      where status = 'approved' and scheduled_date is not null and (
        (send_schedule_mode = 'exact' and send_at <= ${now}) or
        (${normalWindow} and send_schedule_mode = 'auto' and (
          (question_type = 'announcement' and scheduled_date - (days_early + 1) <= ${localDate}) or
          (question_type in ('event', 'reminder') and scheduled_date <= ${localDate})
        ))
      )
      order by case when send_schedule_mode = 'exact' then send_at else scheduled_date::timestamptz end asc, created_at asc
    `;
    const failures: string[] = [];
    let sent = 0;
    for (const announcement of due) {
      const result = await sendAnnouncement(announcement.id, "scheduled", localDate);
      if ("error" in result) failures.push(result.error || "Scheduled delivery failed.");
      else { sent += 1; scheduleLivePush(result.dispatchId); if ("warning" in result && result.warning) failures.push(result.warning); }
    }
    // The default calendar fallback stays at the normal 6 PM time. A page-load
    // check may still recover it later in that hour if the scheduled request was missed.
    if (normalWindow && (trigger === "page_load" || minute === 0)) {
      try {
        const fallback = await sendCalendarFallback(tomorrow, localDate);
        if (fallback) {
          sent += 1;
          scheduleLivePush(fallback.dispatchId);
          await logEvent({ action: "calendar_fallback", actor: trigger, role: "system", details: { scheduledDate: tomorrow, dispatchId: fallback.dispatchId, destination: "live" } });
        }
      } catch (error) {
        failures.push("Calendar schedule fallback failed.");
        await logEvent({ action: "calendar_fallback", actor: trigger, role: "system", success: false, details: { scheduledDate: tomorrow, error: errorDetail(error) } });
      }
    }
    // Minute-level cron requests would otherwise drown the useful activity log.
    if (due.length || sent || failures.length) await logEvent({ action: "scheduled_delivery_run", actor: trigger, role: "system", success: failures.length === 0, details: { localDate, minute, due: due.length, sent, failures } });
    return { success: failures.length === 0, localDate, tomorrow, sent, failures, skipped: !normalWindow && due.length === 0, reason: !normalWindow && due.length === 0 ? "No exact send is due" : undefined };
  };

  // Cron and the signed-in page-load backup can wake up on the same second.
  // Hold a transaction-scoped advisory lock across the whole run so only one
  // worker can claim due announcements at a time. A concurrent worker exits
  // successfully instead of turning an expected race into a delivery error.
  if (typeof sql.begin !== "function") return run();
  return sql.begin(async (tx) => {
    const lock = await tx<{ locked: boolean }[]>`select pg_try_advisory_xact_lock(716834642) as locked`;
    if (!lock[0]?.locked) {
      const { localDate } = pacificParts(now);
      return { success: true, localDate, tomorrow: addDays(localDate, 1), sent: 0, failures: [], skipped: true, reason: "Another delivery run is already in progress" };
    }
    return run();
  });
}
