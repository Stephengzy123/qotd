import { webhookOptions } from "@/lib/webhook-destinations";
import { DeliverySettingsFields } from "@/components/delivery-settings-fields";
import { reviewQuestionAction } from "@/app/actions";
import { requireRole } from "@/lib/auth";
import { listAnnouncements, loadTemplates, relativeDate } from "@/lib/admin-data";
import { addDays, minimumAnnouncementDate, pacificParts, scheduledDateValue } from "@/lib/qotd";
import { AdminShell } from "@/components/admin-shell";
import { AdminEntryFields } from "@/components/admin-entry-fields";
import { ComposerDialog } from "@/components/composer-dialog";
import { PendingButton } from "@/components/pending-button";

export default async function PendingPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const session = await requireRole("admin");
  const params = await searchParams;
  const [pending, templates] = await Promise.all([listAnnouncements("pending"), loadTemplates()]);
  const destinations = await webhookOptions();
  const eventMinimumDate = addDays(pacificParts().localDate, 1);
  const announcementMinimumDate = minimumAnnouncementDate();

  return (
    <AdminShell page="pending" username={session.username} title="Pending" description="Contributor submissions waiting for review. Edit anything, then approve, save, or reject." notice={params} actions={<span className="count-badge large">{pending.length} waiting</span>}>
      <section className="section-block">
        {pending.length ? <div className="question-list">{pending.map((item) => <article className="question-card" key={item.id}><div className="question-meta"><span>{item.event_title || (item.question_type === "event" ? "Event" : "Announcement")}</span><span>{relativeDate(item.created_at)}</span></div><p className="announcement-excerpt">{item.question}</p><ComposerDialog buttonLabel="Review" title="Review submission" className="secondary"><form action={reviewQuestionAction} className="composer-form"><input type="hidden" name="id" value={item.id} /><div className="question-meta"><span>Submitted {relativeDate(item.created_at)}</span><span className="status pending">{item.question_type === "event" ? "Event" : "Announcement"}</span></div><AdminEntryFields idPrefix={item.id} announcementMinimumDate={announcementMinimumDate} eventMinimumDate={eventMinimumDate} initialType={item.question_type} initialTitle={item.event_title || ""} initialDate={scheduledDateValue(item.scheduled_date) || ""} initialOccurrenceDate={scheduledDateValue(item.event_occurrence_date) || ""} initialAnnouncement={item.question} initialDaysEarly={Number(item.days_early) || 0} announcementTemplate={templates.announcementTemplate} eventTemplate={templates.eventTemplate} /><DeliverySettingsFields destinations={destinations} initialDestination={item.delivery_destination} initialRemovePings={item.remove_pings} selected={item.discord_webhook_ids ?? undefined} />{item.contributor_note && <p className="review-note"><strong>Note:</strong> {item.contributor_note}</p>}<div className="card-actions"><PendingButton name="intent" value="reject" className="danger" formNoValidate pendingText="Rejecting…">Reject</PendingButton><PendingButton name="intent" value="save" className="secondary" pendingText="Saving…">Save</PendingButton><PendingButton name="intent" value="approve" className="primary" pendingText="Approving…">Approve</PendingButton></div></form></ComposerDialog></article>)}</div> : <div className="empty-state"><p>Nothing to review. New contributor submissions show up here.</p><a href="/admin/approved" className="secondary">See what’s scheduled →</a></div>}
      </section>
    </AdminShell>
  );
}
