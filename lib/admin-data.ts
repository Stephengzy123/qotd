import "server-only";
import { dbReady } from "@/lib/db";
import { addDays, DEFAULT_ANNOUNCEMENT_TEMPLATE, DEFAULT_EVENT_TEMPLATE, pacificParts, type SendScheduleMode } from "@/lib/qotd";

export type Announcement = { delivery_destination: "discord" | "live"; remove_pings: boolean; discord_webhook_ids: string[] | null; send_schedule_mode: SendScheduleMode; send_at: Date | string | null; id: string; question: string; contributor_note: string | null; status: string; created_at: Date; scheduled_date: string | Date | null; question_type: "announcement" | "event"; event_title: string | null; days_early: number };

export function relativeDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" }).format(date);
}

export async function loadTemplates() {
  const sql = await dbReady();
  const row = (await sql<{ message_template: string | null; event_message_template: string | null }[]>`select message_template, event_message_template from settings where singleton = true`)[0];
  return {
    announcementTemplate: row?.message_template || DEFAULT_ANNOUNCEMENT_TEMPLATE,
    eventTemplate: row?.event_message_template || DEFAULT_EVENT_TEMPLATE,
  };
}

export async function listAnnouncements(status: "pending" | "approved") {
  const sql = await dbReady();
  return sql<Announcement[]>`select delivery_destination, remove_pings, discord_webhook_ids, send_schedule_mode, send_at, id, question, contributor_note, status, created_at, scheduled_date, question_type, event_title, days_early from questions where status = ${status} order by case when send_schedule_mode = 'exact' then send_at else scheduled_date::timestamptz end asc nulls last, created_at asc`;
}

export async function queueCounts() {
  const sql = await dbReady();
  const row = (await sql<{ pending: number; approved: number; sent_week: number; failed_week: number }[]>`
    select
      count(*) filter (where status = 'pending')::int as pending,
      count(*) filter (where status = 'approved')::int as approved,
      (select count(*)::int from dispatches where success and created_at > now() - interval '7 days') as sent_week,
      (select count(*)::int from dispatches where not success and created_at > now() - interval '7 days') as failed_week
    from questions
  `)[0];
  return { pending: row?.pending ?? 0, approved: row?.approved ?? 0, sentWeek: row?.sent_week ?? 0, failedWeek: row?.failed_week ?? 0 };
}

export type AudienceTimelinePoint = { date: string; accountAdds: number; accountRemovals: number; totalAccounts: number; notificationAdds: number; notificationRemovals: number; totalNotifications: number };

// This intentionally returns only aggregate counts. Push endpoints and account
// identifiers never leave this server-only module.
export async function audienceAnalytics(currentTotalAccounts: number, days = 14) {
  const sql = await dbReady();
  const safeDays = Math.max(7, Math.min(31, Math.floor(days)));
  const startDate = addDays(pacificParts().localDate, -(safeDays - 1));
  const [subscriptionRows, removalRows, notificationRemovalRows, events] = await Promise.all([
    sql<{ count: number }[]>`select count(*)::int as count from push_subscriptions`,
    sql<{ count: number }[]>`select count(*)::int as count from activity_log where action = 'delete_account' and success`,
    sql<{ count: number }[]>`select count(*)::int as count from activity_log where action = 'disable_notifications' and success`,
    sql<{ date: string; action: "create_account" | "delete_account" | "enable_notifications" | "disable_notifications"; count: number }[]>`
      select to_char(created_at at time zone 'America/Los_Angeles', 'YYYY-MM-DD') as date, action, count(*)::int as count
      from activity_log
      where success and action in ('create_account', 'delete_account', 'enable_notifications', 'disable_notifications') and created_at >= (${startDate}::date at time zone 'America/Los_Angeles')
      group by 1, 2`,
  ]);
  const eventCounts = new Map(events.map((row) => [`${row.date}:${row.action}`, Number(row.count)]));
  const timeline: AudienceTimelinePoint[] = Array.from({ length: safeDays }, (_, index) => {
    const date = addDays(startDate, index);
    return { date, accountAdds: eventCounts.get(`${date}:create_account`) || 0, accountRemovals: eventCounts.get(`${date}:delete_account`) || 0, totalAccounts: 0, notificationAdds: eventCounts.get(`${date}:enable_notifications`) || 0, notificationRemovals: eventCounts.get(`${date}:disable_notifications`) || 0, totalNotifications: 0 };
  });
  let total = currentTotalAccounts;
  let notifications = Number(subscriptionRows[0]?.count || 0);
  for (let index = timeline.length - 1; index >= 0; index--) {
    timeline[index].totalAccounts = total;
    timeline[index].totalNotifications = notifications;
    total -= timeline[index].accountAdds - timeline[index].accountRemovals;
    notifications -= timeline[index].notificationAdds - timeline[index].notificationRemovals;
  }
  return { notificationSubscriptions: Number(subscriptionRows[0]?.count || 0), accountRemovals: Number(removalRows[0]?.count || 0), notificationRemovals: Number(notificationRemovalRows[0]?.count || 0), timeline };
}
