import "server-only";
import { dbReady } from "@/lib/db";
import { calendarHeading, getCalendarByDate } from "@/lib/calendar";
import { displayScheduledDate } from "@/lib/qotd";
import { removePings } from "@/lib/live-text";

// Successful publication and the unique date claim are the same database write.
// Hiding a fallback does not make it eligible to be published again.
export async function sendCalendarFallback(scheduledDate: string, localDate: string) {
  const sql = await dbReady();
  const existing = await sql`
    select id from questions where question_type = 'announcement'
      and scheduled_date = ${scheduledDate} and status in ('approved', 'sent')
    union all
    select id from dispatches where calendar_fallback_date = ${scheduledDate}
    limit 1
  `;
  if (existing.length) return null;
  const settings = (await sql`select calendar_feed_url_encrypted from settings where singleton = true`)[0];
  if (!settings?.calendar_feed_url_encrypted) return null;
  const titles = await getCalendarByDate(settings.calendar_feed_url_encrypted as string, scheduledDate);
  if (!titles.length) return null;
  const message = removePings(`# <:sgs:1372767087612657724> Block Rotation for ${displayScheduledDate(scheduledDate)}\n\n${calendarHeading(titles)}`);
  const rows = await sql`
    insert into dispatches (local_date, mode, message, success, question_type, destination, calendar_fallback_date)
    select ${localDate}, 'scheduled', ${message}, true, 'announcement', 'live', ${scheduledDate}::date
    where not exists (
      select 1 from questions where question_type = 'announcement'
        and scheduled_date = ${scheduledDate} and status in ('approved', 'sent')
    )
    on conflict (calendar_fallback_date) do nothing
    returning id
  `;
  return rows[0] ? { dispatchId: rows[0].id as string } : null;
}
