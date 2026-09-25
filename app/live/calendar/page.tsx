import type { Metadata } from "next";
import { AdminCalendar } from "@/components/admin-calendar";
import { PublicCalendarWithTimetable } from "@/components/public-calendar-with-timetable";
import { CalendarSubscriptions } from "@/components/calendar-subscriptions";
import { loadPublicCalendar } from "@/lib/admin-calendar";
import { pacificParts } from "@/lib/qotd";
import { dbReady } from "@/lib/db";
import { normalizeTimetable, rotationForDate, scheduleForDate } from "@/lib/timetable";
import "./calendar.css";

export const metadata: Metadata = { title: "School Calendar | Live Announcements" };
export const dynamic = "force-dynamic";

export default async function PublicCalendarPage({ searchParams }: { searchParams: Promise<{ embed?: string }> }) {
  const embedded = (await searchParams).embed === "1";
  const today = pacificParts().localDate;
  const year = Number(today.slice(0, 4)) - (Number(today.slice(5, 7)) < 8 ? 1 : 0);
  const start = `${year}-08-01`, end = `${year + 1}-07-31`;
  const events = await loadPublicCalendar(start, end);
  let timetable: Record<string, ReturnType<typeof scheduleForDate>> = {};
  if (!embedded) {
    const sql = await dbReady();
    const settings = (await sql`select timetable_config from settings where singleton = true`)[0];
    const config = normalizeTimetable(settings?.timetable_config);
    const imported = events.filter(event => event.kind === "imported");
    timetable = Object.fromEntries([...new Set(imported.map(event => event.date))].map(date => [date, scheduleForDate(config, date, rotationForDate(imported, date)?.letters || null)]));
  }
  return <main className={`public-calendar-page${embedded ? " public-calendar-embed" : ""}`}>
    {!embedded && <header className="public-calendar-heading"><div><h1>School calendar</h1><p>Block rotations, upcoming events, and Senior School lunch menus. Use Day view for your class schedule.</p></div><div className="public-calendar-actions"><a className="secondary" href="/live/timetable">My timetable</a><a className="secondary" href="/live">Back to live announcements</a></div></header>}
    {embedded ? <AdminCalendar events={events} today={today} rangeStart={start} rangeEnd={end} /> : <PublicCalendarWithTimetable events={events} today={today} rangeStart={start} rangeEnd={end} timetable={timetable} />}
    {!embedded && <p className="row-buttons"><a href="/live/report?category=calendar">Report a calendar issue</a><a href="/live/suggest">Suggest a feature</a></p>}
    {!embedded && <CalendarSubscriptions />}
  </main>;
}
