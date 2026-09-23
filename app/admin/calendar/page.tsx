import { AdminShell } from "@/components/admin-shell";
import { AdminCalendar } from "@/components/admin-calendar";
import { CalendarEmbedCopy } from "@/components/calendar-embed-copy";
import { PendingButton } from "@/components/pending-button";
import { requireRole } from "@/lib/auth";
import { dbReady } from "@/lib/db";
import { normalizeTimetable, rotationForDate, scheduleForDate } from "@/lib/timetable";
import { loadAdminCalendar } from "@/lib/admin-calendar";
import { lunchSyncStatus } from "@/lib/lunch-menu";
import { displayScheduledDate, pacificParts } from "@/lib/qotd";
import { createCalendarEventAction, deleteCalendarEventAction, markEventAsReminderAction, refreshLunchMenusAction, updateEventOccurrenceDateAction } from "@/app/admin/calendar/actions";

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

function validSkipped(value?: string) {
  return (value || "").split(",").filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 50);
}

type CalendarSearch = { ok?: string; error?: string; backfill?: string; event?: string; skipped?: string; add?: string };

export default async function AdminCalendarPage({ searchParams }: { searchParams: Promise<CalendarSearch> }) {
  const session = await requireRole("admin");
  const params = await searchParams;
  const today = pacificParts().localDate;
  const range = schoolYearRange(today);
  const [{ events, editableEvents, manualEvents }, syncStatus] = await Promise.all([loadAdminCalendar(range.start, range.end), lunchSyncStatus()]);
  const sql = await dbReady();
  const settings = (await sql`select timetable_config from settings where singleton = true`)[0];
  const config = normalizeTimetable(settings?.timetable_config);
  const timetable: Record<string, ReturnType<typeof scheduleForDate>> = {};
  const imported = events.filter(event => event.kind === "imported");
  for (const date of new Set(imported.map(event => event.date))) {
    timetable[date] = scheduleForDate(config, date, rotationForDate(imported, date)?.letters || null);
  }
  const allMissingEvents = editableEvents.filter((event) => !event.occurrenceDate);
  const skippedIds = validSkipped(params.skipped);
  const skippedSet = new Set(skippedIds);
  const missingEvents = allMissingEvents.filter((event) => !skippedSet.has(event.id));
  const requestedIndex = missingEvents.findIndex((event) => event.id === params.event);
  const backfillIndex = requestedIndex >= 0 ? requestedIndex : 0;
  const backfillEvent = params.backfill === "1" ? missingEvents[backfillIndex] : undefined;
  const nextBackfillEvent = missingEvents.find((event) => event.id !== backfillEvent?.id);
  const skipIds = backfillEvent ? [...skippedIds, backfillEvent.id].slice(0, 50) : skippedIds;
  const skipQuery = skipIds.join(",");
  const actions = <>
    <CalendarEmbedCopy />
    <a className="secondary" href="/admin/timetable">Edit timetable</a>
    <a className="secondary" href="/admin/calendar/export">Test calendar exports</a>
    <a className="secondary" href="/admin/calendar?add=1">＋ Add event</a>
    {allMissingEvents.length ? <a className="secondary" href={`/admin/calendar?backfill=1&event=${allMissingEvents[0].id}`}>Complete missing dates <span className="count-badge">{allMissingEvents.length}</span></a> : <span className="status ready">Event dates complete</span>}
    <form action={refreshLunchMenusAction}><PendingButton className="primary" pendingText="Refreshing…">Refresh lunch menus</PendingButton></form>
  </>;

  return <AdminShell page="calendar" username={session.username} title="Calendar" description="Admin preview of imported events, announcement occurrence dates, calendar-only events, and Senior School lunch menus." notice={params} actions={actions}>
    <section className="section-block">
      <div className="calendar-status-row"><span><strong>Lunch menu sync</strong> · Last successful {displayTimestamp(syncStatus.last_success_at)}</span>{syncStatus.last_error ? <span className="status failed">{syncStatus.last_error}</span> : <span className="status ready">Ready</span>}</div>
      <AdminCalendar events={events} today={today} rangeStart={range.start} rangeEnd={range.end} timetable={timetable} />
    </section>
    <section className="section-block">
      <div className="section-title"><div><h2>Calendar-only events</h2><p className="hint">Use these for items that need a calendar entry but do not need their own announcement.</p></div><span className="count-badge">{manualEvents.length}</span></div>
      {manualEvents.length ? <div className="event-date-list panel">{manualEvents.map((event) => <div key={event.id} className="event-date-row manual-event-row">
        <div><strong>{event.title}</strong><span>{displayScheduledDate(event.date)}{event.endDate !== event.date ? ` – ${displayScheduledDate(event.endDate)}` : " · single day"}</span>{event.details ? <span>{event.details}</span> : null}</div>
        <form action={deleteCalendarEventAction}><input type="hidden" name="id" value={event.id} /><PendingButton className="danger" pendingText="Deleting…">Delete</PendingButton></form>
      </div>)}</div> : <div className="empty-state compact">No calendar-only events yet.</div>}
    </section>
    <section className="section-block">
      <div className="section-title"><div><h2>Announcement event dates</h2><p className="hint">Backfill or correct occurrence dates for approved and already-sent event announcements.</p></div><span className={`count-badge${allMissingEvents.length ? " attention" : ""}`}>{allMissingEvents.length} incomplete</span></div>
      {editableEvents.length ? <div className="event-date-list panel">{editableEvents.map((event) => <form key={event.id} action={updateEventOccurrenceDateAction} className="event-date-row">
        <input type="hidden" name="id" value={event.id} />
        <div><strong>{event.title}</strong><span>{event.status === "sent" ? "Sent" : "Approved"} · published {event.publishDate}</span></div>
        <label><span>Start date</span><input name="occurrenceDate" type="date" defaultValue={event.occurrenceDate || ""} required /></label>
        <label><span>End date <span className="hint">(optional)</span></span><input name="occurrenceEndDate" type="date" min={event.occurrenceDate || undefined} defaultValue={event.occurrenceEndDate || ""} /><small className="hint">Leave blank for one day.</small></label>
        <div className="event-date-actions"><PendingButton className="secondary" pendingText="Saving…">Save dates</PendingButton><PendingButton formAction={markEventAsReminderAction} formNoValidate className="text-button" pendingText="Moving…" confirmMessage="Move this event to Reminders? It will be permanently removed from calendar date backfill.">Make reminder</PendingButton></div>
      </form>)}</div> : <div className="empty-state compact">No event announcements are available yet.</div>}
    </section>

    {params.add === "1" ? <div className="calendar-detail-backdrop"><section className="calendar-detail event-backfill panel" role="dialog" aria-modal="true" aria-labelledby="add-event-title">
      <div className="calendar-detail-heading"><div><span className="status manual">Calendar only</span><h2 id="add-event-title">Add an event</h2><p>This creates a calendar entry without sending an announcement.</p></div><a href="/admin/calendar" className="secondary" aria-label="Close">×</a></div>
      <form action={createCalendarEventAction} className="event-backfill-form">
        <label htmlFor="calendar-event-title">Title</label><input id="calendar-event-title" name="title" maxLength={200} required autoFocus />
        <label htmlFor="calendar-event-start">Start date</label><input id="calendar-event-start" name="eventDate" type="date" required />
        <label htmlFor="calendar-event-end">End date <span className="hint">(optional)</span></label><input id="calendar-event-end" name="endDate" type="date" /><p className="hint">Leave blank for a single-day event. Set an end date only for a multi-day event.</p>
        <label htmlFor="calendar-event-details">Details <span className="hint">(optional)</span></label><textarea id="calendar-event-details" name="details" maxLength={1500} rows={5} />
        <div className="event-backfill-actions"><a className="text-button" href="/admin/calendar">Cancel</a><PendingButton className="primary" pendingText="Adding…">Add event</PendingButton></div>
      </form>
    </section></div> : null}

    {params.backfill === "1" ? <div className="calendar-detail-backdrop">
      {backfillEvent ? <section className="calendar-detail event-backfill panel" role="dialog" aria-modal="true" aria-labelledby="backfill-title">
        <div className="calendar-detail-heading"><div><span className="status pending">{missingEvents.length} left this pass</span><h2 id="backfill-title">{backfillEvent.title}</h2><p>Published {backfillEvent.publishDate} · {backfillEvent.status === "sent" ? "Already sent" : "Approved"}</p></div><a href="/admin/calendar" className="secondary" aria-label="Close">×</a></div>
        <div className="event-backfill-copy"><strong>Announcement</strong><p>{backfillEvent.details}</p></div>
        <form action={updateEventOccurrenceDateAction} className="event-backfill-form">
          <input type="hidden" name="id" value={backfillEvent.id} /><input type="hidden" name="continueBackfill" value="yes" /><input type="hidden" name="skippedEvents" value={skippedIds.join(",")} />
          <label htmlFor="backfill-occurrence-date">Event start date</label><input id="backfill-occurrence-date" name="occurrenceDate" type="date" required autoFocus />
          <label htmlFor="backfill-occurrence-end-date">Event end date <span className="hint">(optional)</span></label><input id="backfill-occurrence-end-date" name="occurrenceEndDate" type="date" /><p className="hint">Leave blank for a single-day event. Set an end date only for a multi-day event.</p>
          <div className="event-backfill-actions"><a className="text-button" href={nextBackfillEvent ? `/admin/calendar?backfill=1&event=${nextBackfillEvent.id}&skipped=${encodeURIComponent(skipQuery)}` : `/admin/calendar?backfill=1&skipped=${encodeURIComponent(skipQuery)}`}>Skip for now</a><div className="row-buttons"><PendingButton formAction={markEventAsReminderAction} formNoValidate className="secondary" pendingText="Moving…" confirmMessage="Move this event to Reminders? It will be permanently removed from calendar date backfill.">Make reminder</PendingButton><PendingButton className="primary" pendingText="Saving…">Save and continue</PendingButton></div></div>
        </form>
      </section> : <section className="calendar-detail event-backfill panel" role="dialog" aria-modal="true" aria-labelledby="backfill-complete-title"><div className="calendar-detail-heading"><div><span className="status ready">Pass complete</span><h2 id="backfill-complete-title">{allMissingEvents.length ? `${allMissingEvents.length} skipped for now` : "Every event has a date"}</h2><p>{allMissingEvents.length ? "Skipped events will stay out of this pass instead of immediately appearing again." : "There are no incomplete approved or sent event announcements."}</p></div></div><div className="event-backfill-actions">{allMissingEvents.length ? <a href={`/admin/calendar?backfill=1&event=${allMissingEvents[0].id}`} className="secondary">Review skipped</a> : null}<a href="/admin/calendar" className="primary">Done</a></div></section>}
    </div> : null}
  </AdminShell>;
}
