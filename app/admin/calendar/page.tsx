import { AdminShell } from "@/components/admin-shell";
import { AdminCalendar } from "@/components/admin-calendar";
import { PendingButton } from "@/components/pending-button";
import { requireRole } from "@/lib/auth";
import { loadAdminCalendar } from "@/lib/admin-calendar";
import { lunchSyncStatus } from "@/lib/lunch-menu";
import { pacificParts } from "@/lib/qotd";
import { refreshLunchMenusAction, updateEventOccurrenceDateAction } from "@/app/admin/calendar/actions";

function schoolYearRange(today: string) {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const startYear = month >= 8 ? year : year - 1;
  return { start: `${startYear}-08-01`, end: `${startYear + 1}-07-31` };
}

function displayTimestamp(value: Date | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Vancouver", timeZoneName: "short" }).format(new Date(value));
}

export default async function AdminCalendarPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; backfill?: string; event?: string }> }) {
  const session = await requireRole("admin");
  const params = await searchParams;
  const today = pacificParts().localDate;
  const range = schoolYearRange(today);
  const [{ events, editableEvents }, syncStatus] = await Promise.all([loadAdminCalendar(range.start, range.end), lunchSyncStatus()]);
  const missingEvents = editableEvents.filter((event) => !event.occurrenceDate);
  const requestedIndex = missingEvents.findIndex((event) => event.id === params.event);
  const backfillIndex = requestedIndex >= 0 ? requestedIndex : 0;
  const backfillEvent = params.backfill === "1" ? missingEvents[backfillIndex] : undefined;
  const nextBackfillEvent = missingEvents.length > 1 ? missingEvents[(backfillIndex + 1) % missingEvents.length] : undefined;
  const refresh = <>
    {missingEvents.length ? <a className="secondary" href={`/admin/calendar?backfill=1&event=${missingEvents[0].id}`}>Complete missing dates <span className="count-badge">{missingEvents.length}</span></a> : <span className="status ready">Event dates complete</span>}
    <form action={refreshLunchMenusAction}><PendingButton className="primary" pendingText="Refreshing…">Refresh lunch menus</PendingButton></form>
  </>;
  return <AdminShell page="calendar" username={session.username} title="Calendar" description="Admin preview of imported events, announcement occurrence dates, and Senior School lunch menus." notice={params} actions={refresh}>
    <section className="section-block">
      <div className="calendar-status-row"><span><strong>Lunch menu sync</strong> · Last successful {displayTimestamp(syncStatus.last_success_at)}</span>{syncStatus.last_error ? <span className="status failed">{syncStatus.last_error}</span> : <span className="status ready">Ready</span>}</div>
      <AdminCalendar events={events} today={today} rangeStart={range.start} rangeEnd={range.end} />
    </section>
    <section className="section-block">
      <div className="section-title"><div><h2>Event dates</h2><p className="hint">Backfill or correct occurrence dates for approved and already-sent event announcements.</p></div><span className={`count-badge${missingEvents.length ? " attention" : ""}`}>{missingEvents.length} incomplete</span></div>
      {editableEvents.length ? <div className="event-date-list panel">{editableEvents.map((event) => <form key={event.id} action={updateEventOccurrenceDateAction} className="event-date-row">
        <input type="hidden" name="id" value={event.id} />
        <div><strong>{event.title}</strong><span>{event.status === "sent" ? "Sent" : "Approved"} · published {event.publishDate}</span></div>
        <label><span>Occurrence date</span><input name="occurrenceDate" type="date" defaultValue={event.occurrenceDate || ""} required /></label>
        <PendingButton className="secondary" pendingText="Saving…">Save date</PendingButton>
      </form>)}</div> : <div className="empty-state compact">No event announcements are available yet.</div>}
    </section>
    {params.backfill === "1" ? <div className="calendar-detail-backdrop">
      {backfillEvent ? <section className="calendar-detail event-backfill panel" role="dialog" aria-modal="true" aria-labelledby="backfill-title">
        <div className="calendar-detail-heading"><div><span className="status pending">{missingEvents.length} incomplete</span><h2 id="backfill-title">{backfillEvent.title}</h2><p>Published {backfillEvent.publishDate} · {backfillEvent.status === "sent" ? "Already sent" : "Approved"} · Event {backfillIndex + 1} of {missingEvents.length}</p></div><a href="/admin/calendar" className="secondary" aria-label="Close">×</a></div>
        <div className="event-backfill-copy"><strong>Announcement</strong><p>{backfillEvent.details}</p></div>
        <form action={updateEventOccurrenceDateAction} className="event-backfill-form">
          <input type="hidden" name="id" value={backfillEvent.id} />
          <input type="hidden" name="continueBackfill" value="yes" />
          <label htmlFor="backfill-occurrence-date">When did or will this event happen?</label>
          <input id="backfill-occurrence-date" name="occurrenceDate" type="date" required autoFocus />
          <div className="event-backfill-actions">
            <a className="text-button" href={nextBackfillEvent ? `/admin/calendar?backfill=1&event=${nextBackfillEvent.id}` : "/admin/calendar"}>{nextBackfillEvent ? "Skip for now" : "Close"}</a>
            <PendingButton className="primary" pendingText="Saving…">Save and continue</PendingButton>
          </div>
        </form>
      </section> : <section className="calendar-detail event-backfill panel" role="dialog" aria-modal="true" aria-labelledby="backfill-complete-title"><div className="calendar-detail-heading"><div><span className="status ready">Complete</span><h2 id="backfill-complete-title">Every event has a date</h2><p>There are no incomplete approved or sent event announcements.</p></div></div><a href="/admin/calendar" className="primary">Done</a></section>}
    </div> : null}
  </AdminShell>;
}
