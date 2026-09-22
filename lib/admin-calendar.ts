import "server-only";

import { dbReady } from "@/lib/db";
import { getCalendarEvents } from "@/lib/calendar";
import type { LunchMenuItem } from "@/lib/lunch-menu";

export type AdminCalendarEvent = {
  id: string;
  date: string;
  endDate?: string;
  title: string;
  kind: "imported" | "announcement" | "manual" | "lunch";
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
  occurrenceEndDate: string | null;
};

export type ManualCalendarEvent = { id: string; date: string; endDate: string; title: string; details: string | null };

export async function loadAdminCalendar(from: string, to: string, publicView = false) {
  const sql = await dbReady();
  const [settingsRows, lunchRows, announcementRows, eventDateRows, manualRows] = await Promise.all([
    sql<{ calendar_feed_url_encrypted: string | null }[]>`select calendar_feed_url_encrypted from settings where singleton = true`,
    sql<{ menu_date: string; items: LunchMenuItem[]; fetched_at: Date }[]>`
      select menu_date::text, items, fetched_at from lunch_menus
      where menu_date between ${from}::date and ${to}::date order by menu_date
    `,
    sql<{ id: string; occurrence_date: string; occurrence_end_date: string | null; title: string; details: string; status: string; scheduled_date: string }[]>`
      select id, event_occurrence_date::text as occurrence_date, event_occurrence_end_date::text as occurrence_end_date, event_title as title,
        case when not ${publicView} or exists (
          select 1 from dispatches d where d.question_id = questions.id
            and d.success = true and d.hidden_from_live = false
        ) then question else '' end as details,
        status, scheduled_date::text
      from questions
      where question_type = 'event' and status in ('approved', 'sent')
        and event_occurrence_date <= ${to}::date
        and coalesce(event_occurrence_end_date, event_occurrence_date) >= ${from}::date
      order by event_occurrence_date, created_at
    `,
    sql<{ id: string; event_title: string; question: string; status: "approved" | "sent"; scheduled_date: string; event_occurrence_date: string | null; event_occurrence_end_date: string | null }[]>`
      select id, event_title, question, status, scheduled_date::text, event_occurrence_date::text, event_occurrence_end_date::text
      from questions
      where question_type = 'event' and status in ('approved', 'sent')
      order by (event_occurrence_date is null) desc,
        case when event_occurrence_date is null then scheduled_date end asc,
        coalesce(event_occurrence_date, scheduled_date) desc, created_at desc
      limit 500
    `,
    sql<{ id: string; event_date: string; end_date: string; title: string; details: string | null }[]>`
      select id, event_date::text, end_date::text, title, details from calendar_events
      where event_date <= ${to}::date and end_date >= ${from}::date
      order by event_date, created_at
    `,
  ]);
  const imported = await getCalendarEvents(settingsRows[0]?.calendar_feed_url_encrypted, from, to).catch(() => []);
  const events: AdminCalendarEvent[] = [
    ...imported.map((event, index) => ({ id: `imported-${event.date}-${index}`, date: event.date, title: event.title, kind: "imported" as const, meta: "Imported calendar" })),
    ...announcementRows.map((event) => ({ id: `announcement-${event.id}`, date: event.occurrence_date, endDate: event.occurrence_end_date || undefined, title: event.title, kind: "announcement" as const, details: event.details, meta: `${event.status === "sent" ? "Sent" : "Approved"} announcement · ${event.occurrence_end_date ? `${event.occurrence_date}–${event.occurrence_end_date} · ` : ""}publishes ${event.scheduled_date}` })),
    ...manualRows.map((event) => ({ id: `manual-${event.id}`, date: event.event_date, endDate: event.end_date !== event.event_date ? event.end_date : undefined, title: event.title, kind: "manual" as const, details: event.details || undefined, meta: `Calendar-only event${event.end_date !== event.event_date ? ` · ${event.event_date}–${event.end_date}` : ""}` })),
    ...lunchRows.map((menu) => ({ id: `lunch-${menu.menu_date}`, date: menu.menu_date, title: "Senior School Lunch", kind: "lunch" as const, items: menu.items, meta: `Menu fetched ${new Date(menu.fetched_at).toISOString()}` })),
  ];
  const editableEvents: EventDateRow[] = eventDateRows.map((event) => ({
    id: event.id,
    title: event.event_title,
    details: event.question,
    status: event.status,
    publishDate: event.scheduled_date,
    occurrenceDate: event.event_occurrence_date,
    occurrenceEndDate: event.event_occurrence_end_date,
  }));
  const manualEvents: ManualCalendarEvent[] = manualRows.map((event) => ({ id: event.id, date: event.event_date, endDate: event.end_date, title: event.title, details: event.details }));
  return { events, editableEvents, manualEvents };
}

// Only calendar entries cross the public boundary, never backfill records or
// credentials. Approved events are intentionally visible before announcement day.
export async function loadPublicCalendar(from: string, to: string) {
  const { events } = await loadAdminCalendar(from, to, true);
  return events.map(({ meta: _meta, ...event }) => event);
}
