import "server-only";
import { dbReady } from "@/lib/db";
import { DEFAULT_ANNOUNCEMENT_TEMPLATE, DEFAULT_EVENT_TEMPLATE } from "@/lib/qotd";

export type Announcement = { delivery_destination: "discord" | "live"; remove_pings: boolean; discord_webhook_ids: string[] | null; id: string; question: string; contributor_note: string | null; status: string; created_at: Date; scheduled_date: string | Date | null; question_type: "announcement" | "event"; event_title: string | null; days_early: number };

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
  return sql<Announcement[]>`select delivery_destination, remove_pings, discord_webhook_ids, id, question, contributor_note, status, created_at, scheduled_date, question_type, event_title, days_early from questions where status = ${status} order by scheduled_date asc nulls last, created_at asc`;
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
