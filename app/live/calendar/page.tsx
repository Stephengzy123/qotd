import type { Metadata } from "next";
import { AdminCalendar } from "@/components/admin-calendar";
import { CalendarSubscriptions } from "@/components/calendar-subscriptions";
import { loadPublicCalendar } from "@/lib/admin-calendar";
import { pacificParts } from "@/lib/qotd";
import "./calendar.css";

export const metadata: Metadata = { title: "School Calendar | Live Announcements" };
export const dynamic = "force-dynamic";

export default async function PublicCalendarPage({ searchParams }: { searchParams: Promise<{ embed?: string }> }) {
  const embedded = (await searchParams).embed === "1";
  const today = pacificParts().localDate;
  const year = Number(today.slice(0, 4)) - (Number(today.slice(5, 7)) < 8 ? 1 : 0);
  const start = `${year}-08-01`, end = `${year + 1}-07-31`;
  const events = await loadPublicCalendar(start, end);
  return <main className={`public-calendar-page${embedded ? " public-calendar-embed" : ""}`}>
    {!embedded && <header className="public-calendar-heading"><div><h1>School calendar</h1><p>Block rotations, upcoming events, and Senior School lunch menus. Select an entry for details.</p></div><a className="secondary" href="/live">Back to live announcements</a></header>}
    <AdminCalendar events={events} today={today} rangeStart={start} rangeEnd={end} />
    {!embedded && <p className="row-buttons"><a href="/live/report?category=calendar">Report a calendar issue</a><a href="/live/suggest">Suggest a feature</a></p>}
    {!embedded && <CalendarSubscriptions />}
  </main>;
}
