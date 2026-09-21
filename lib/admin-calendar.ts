import "server-only";

import { dbReady } from "@/lib/db";
import { getCalendarEvents } from "@/lib/calendar";
import type { LunchMenuItem } from "@/lib/lunch-menu";

export type AdminCalendarEvent = {
  id: string;
  date: string;
  title: string;
  kind: "imported" | "announcement" | "lunch";
  details?: string;
  meta?: string;
  items?: LunchMenuItem[];
};

export type EventDateRow = {
  id: string;
  title: string;
  details: string;
  status: "approved" | "sent";
  publishDate: string;
  occurrenceDate: string | null;
};

export async function loadAdminCalendar(from: string, to: string) {
  const sql = await dbReady();
  const [settingsRows, lunchRows, announcementRows, eventDateRows] = await Promise.all([
    sql<{ calendar_feed_url_encrypted: string | null }[]>`select calendar_feed_url_encrypted from settings where singleton = true`,
    sql<{ menu_date: string; items: LunchMenuItem[]; fetched_at: Date }[]>`
      select menu_date::text, items, fetched_at from lunch_menus
      where menu_date between ${from}::date and ${to}::date order by menu_date
    `,
    sql<{ id: string; occurrence_date: string; title: string; details: string; status: string; scheduled_date: string }[]>`
      select id, event_occurrence_date::text as occurrence_date, event_title as title, question as details,
        status, scheduled_date::text
      from questions
      where question_type = 'event' and status in ('approved', 'sent')
        and event_occurrence_date between ${from}::date and ${to}::date
      order by event_occurrence_date, created_at
    `,
    sql<{ id: string; event_title: string; question: string; status: "approved" | "sent"; scheduled_date: string; event_occurrence_date: string | null }[]>`
      select id, event_title, question, status, scheduled_date::text, event_occurrence_date::text
      from questions
      where question_type = 'event' and status in ('approved', 'sent')
      order by (event_occurrence_date is null) desc,
        case when event_occurrence_date is null then scheduled_date end asc,
        coalesce(event_occurrence_date, scheduled_date) desc, created_at desc
      limit 500
    `,
  ]);
  const imported = await getCalendarEvents(settingsRows[0]?.calendar_feed_url_encrypted, from, to).catch(() => []);
  const events: AdminCalendarEvent[] = [
    ...imported.map((event, index) => ({ id: `imported-${event.date}-${index}`, date: event.date, title: event.title, kind: "imported" as const, meta: "Imported calendar" })),
    ...announcementRows.map((event) => ({ id: `announcement-${event.id}`, date: event.occurrence_date, title: event.title, kind: "announcement" as const, details: event.details, meta: `${event.status === "sent" ? "Sent" : "Approved"} announcement · publishes ${event.scheduled_date}` })),
    ...lunchRows.map((menu) => ({ id: `lunch-${menu.menu_date}`, date: menu.menu_date, title: "Senior School Lunch", kind: "lunch" as const, items: menu.items, meta: `Menu fetched ${new Date(menu.fetched_at).toISOString()}` })),
  ];
  const editableEvents: EventDateRow[] = eventDateRows.map((event) => ({
    id: event.id,
    title: event.event_title,
    details: event.question,
    status: event.status,
    publishDate: event.scheduled_date,
    occurrenceDate: event.event_occurrence_date,
  }));
  return { events, editableEvents };
}
