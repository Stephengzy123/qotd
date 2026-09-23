import { AdminShell } from "@/components/admin-shell";
import { TimetableEditor } from "@/components/timetable-editor";
import { requireRole } from "@/lib/auth";
import { dbReady } from "@/lib/db";
import { DEFAULT_TIMETABLE, normalizeTimetable, rotationForDate, scheduleForDate, type TimetableConfig } from "@/lib/timetable";
import { getCalendarEvents, type CalendarEvent } from "@/lib/calendar";
import { pacificParts } from "@/lib/qotd";

export default async function TimetablePage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const session = await requireRole("admin");
  const params = await searchParams;
  const sql = await dbReady();
  const settings = (await sql<{ timetable_config: unknown; calendar_feed_url_encrypted: string | null }[]>`select timetable_config, calendar_feed_url_encrypted from settings where singleton = true`)[0];
  const config: TimetableConfig = normalizeTimetable(settings?.timetable_config || DEFAULT_TIMETABLE);
  const today = pacificParts().localDate;
  const [year, month, day] = today.split("-").map(Number);
  const to = new Date(Date.UTC(year, month - 1, day + 6, 12)).toISOString().slice(0, 10);
  let rotationEvents: CalendarEvent[] = [];
  let feedError = settings?.calendar_feed_url_encrypted ? "" : "Add a calendar feed in Settings to preview daily rotations.";
  try { rotationEvents = await getCalendarEvents(settings?.calendar_feed_url_encrypted, today, to); }
  catch { feedError = "The rotation calendar could not be loaded. Try again shortly. Timetable editing is still available."; }
  const preview = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${today}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + index);
    const value = date.toISOString().slice(0, 10); const rotation = rotationForDate(rotationEvents, value);
    return { date: value, rotation, schedule: scheduleForDate(config, value, rotation?.letters || null) };
  });
  return <AdminShell page="timetable" username={session.username} title="Timetable" description="Configure the school-wide periods used to turn block rotation letters into a daily schedule." notice={params} actions={<a className="secondary" href="/admin/calendar">Back to calendar</a>}>
    <section className="section-block"><div className="section-title"><div><h2>School period templates</h2><p className="hint">Each weekday and Flex/XB day has its own period times. Check the starting bell times before saving. Admin preview only.</p></div></div><TimetableEditor initial={config} /></section>
    <section className="section-block"><div className="section-title"><div><h2>Next seven days</h2><p className="hint">Uses saved periods and the imported calendar's letter order. No schedule is generated on weekends, closed days, or dates without an unambiguous rotation.</p></div></div>{feedError && <p role="alert" className="error-text">{feedError}</p>}<div className="timetable-preview panel">{preview.map((day) => <article key={day.date}><h3>{day.date}{day.rotation ? ` · ${day.rotation.title}` : ""}</h3>{!day.schedule.length && <p className="hint">No schedule available for this date.</p>}{day.schedule.map((period, index) => <div className="timetable-preview-row" key={`${day.date}-${index}`}><time>{period.start}–{period.end}</time><strong>{period.letter ? `${period.letter} · ` : ""}{period.label}</strong></div>)}</article>)}</div></section>
  </AdminShell>;
}
