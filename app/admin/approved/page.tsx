import { addApprovedQuestionAction } from "@/app/actions";
import { requireRole } from "@/lib/auth";
import { listAnnouncements, loadTemplates } from "@/lib/admin-data";
import { addDays, displayScheduledDate, minimumAnnouncementDate, pacificParts, scheduledDateValue } from "@/lib/qotd";
import { AdminShell } from "@/components/admin-shell";
import { AdminEntryFields } from "@/components/admin-entry-fields";
import { AnnouncementPreview } from "@/components/announcement-preview";
import { ApprovedQuestionActions } from "@/components/approved-question-actions";
import { ComposerDialog } from "@/components/composer-dialog";
import { MessagePreview } from "@/components/message-preview";
import { PendingButton } from "@/components/pending-button";

export default async function ApprovedPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const session = await requireRole("admin");
  const params = await searchParams;
  const [approved, templates] = await Promise.all([listAnnouncements("approved"), loadTemplates()]);
  const eventMinimumDate = addDays(pacificParts().localDate, 1);
  const announcementMinimumDate = minimumAnnouncementDate();
  const addDialog = (
    <ComposerDialog buttonLabel="＋ Add approved item" title="Add an approved item" description="Goes straight to the Approved queue and sends on its calculated date." className="primary">
      <form action={addApprovedQuestionAction} className="contribution-form"><AdminEntryFields idPrefix="quick-add" announcementMinimumDate={announcementMinimumDate} eventMinimumDate={eventMinimumDate} announcementTemplate={templates.announcementTemplate} eventTemplate={templates.eventTemplate} /><div className="form-footer"><p>Skips contributor review.</p><PendingButton className="primary" pendingText="Adding…">Add to Approved</PendingButton></div></form>
    </ComposerDialog>
  );

  return (
    <AdminShell page="approved" username={session.username} title="Approved" description="Everything scheduled to go out, in send order. Send early, unapprove, or delete from here." notice={params} actions={addDialog}>
      <section className="section-block">
        {approved.length ? <div className="approved-list">{approved.map((item, index) => { const date = scheduledDateValue(item.scheduled_date); const daysEarly = Number(item.days_early) || 0; return <article key={item.id} className="approved-row"><span className="queue-number">{String(index + 1).padStart(2, "0")}</span><div><strong className="scheduled-label">{item.question_type === "event" ? `Event publishes ${displayScheduledDate(item.scheduled_date)}` : `For ${displayScheduledDate(item.scheduled_date)} · sends ${date ? displayScheduledDate(addDays(date, -(daysEarly + 1))) : "Date unavailable"} at 6 PM Pacific${daysEarly ? ` · ${daysEarly} day${daysEarly === 1 ? "" : "s"} early` : ""}`}</strong>{item.event_title && <h3 className="approved-title">{item.event_title}</h3>}<p className="message-excerpt">{item.question}</p></div><div className="queued-actions"><MessagePreview title="Scheduled message"><AnnouncementPreview type={item.question_type === "event" ? "event" : "announcement"} announcement={item.question} eventTitle={item.event_title || ""} scheduledDate={date || ""} announcementTemplate={templates.announcementTemplate} eventTemplate={templates.eventTemplate} /></MessagePreview><ApprovedQuestionActions id={item.id} question={item.question} /></div></article>; })}</div> : <div className="empty-state"><p>Nothing scheduled. Approve a pending submission or add an item directly.</p><a href="/admin/pending" className="secondary">Review pending →</a></div>}
      </section>
    </AdminShell>
  );
}
