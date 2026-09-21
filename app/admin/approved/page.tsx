import { webhookOptions } from "@/lib/webhook-destinations";
import { DeliverySettingsFields } from "@/components/delivery-settings-fields";
import { addApprovedQuestionAction } from "@/app/actions";
import { requireRole } from "@/lib/auth";
import { listAnnouncements, loadTemplates, type Announcement } from "@/lib/admin-data";
import { addDays, displayPacificDateTime, displayScheduledDate, minimumAnnouncementDate, pacificDateTimeInput, pacificParts, scheduledDateValue } from "@/lib/qotd";
import { AdminShell } from "@/components/admin-shell";
import { AdminEntryFields } from "@/components/admin-entry-fields";
import { AnnouncementPreview } from "@/components/announcement-preview";
import { ApprovedQuestionActions } from "@/components/approved-question-actions";
import { ComposerDialog } from "@/components/composer-dialog";
import { MessagePreview } from "@/components/message-preview";
import { PendingButton } from "@/components/pending-button";

function scheduleLabel(item: Announcement) {
  if (item.send_schedule_mode === "disabled") return "Automatic send disabled";
  if (item.send_schedule_mode === "exact") return `Sends ${displayPacificDateTime(item.send_at)} · exact override`;
  const scheduled = scheduledDateValue(item.scheduled_date);
  if (item.question_type === "event") {
    const start = scheduledDateValue(item.event_occurrence_date);
    const end = scheduledDateValue(item.event_occurrence_end_date);
    const range = start ? `${displayScheduledDate(start)}${end && end !== start ? ` – ${displayScheduledDate(end)}` : ""}` : "an unset date";
    return `Occurs ${range} · publishes ${displayScheduledDate(item.scheduled_date)} at 6 PM Pacific`;
  }
  if (item.question_type === "reminder") return `Reminder publishes ${displayScheduledDate(item.scheduled_date)} at 6 PM Pacific · no calendar entry`;
  const daysEarly = Number(item.days_early) || 0;
  return `For ${displayScheduledDate(item.scheduled_date)} · sends ${scheduled ? displayScheduledDate(addDays(scheduled, -(daysEarly + 1))) : "Date unavailable"} at 6 PM Pacific${daysEarly ? ` · ${daysEarly} day${daysEarly === 1 ? "" : "s"} early` : ""}`;
}

export default async function ApprovedPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const session = await requireRole("admin");
  const params = await searchParams;
  const [approved, templates] = await Promise.all([listAnnouncements("approved"), loadTemplates()]);
  const destinations = await webhookOptions();
  const eventMinimumDate = addDays(pacificParts().localDate, 1);
  const announcementMinimumDate = minimumAnnouncementDate();
  const addDialog = <ComposerDialog buttonLabel="＋ Add approved item" title="Add an approved item" description="Goes straight to the Approved queue and sends on its calculated date." className="primary">
    <form action={addApprovedQuestionAction} className="contribution-form"><AdminEntryFields idPrefix="quick-add" announcementMinimumDate={announcementMinimumDate} eventMinimumDate={eventMinimumDate} announcementTemplate={templates.announcementTemplate} eventTemplate={templates.eventTemplate} /><DeliverySettingsFields destinations={destinations} /><div className="form-footer"><p>Skips contributor review.</p><PendingButton className="primary" pendingText="Adding…">Add to Approved</PendingButton></div></form>
  </ComposerDialog>;

  return <AdminShell page="approved" username={session.username} title="Approved" description="Everything scheduled to go out, in send order. Send early, unapprove, or delete from here." notice={params} actions={addDialog}>
    <section className="section-block">
      {approved.length ? <div className="approved-list">{approved.map((item, index) => {
        const scheduled = scheduledDateValue(item.scheduled_date);
        return <article key={item.id} className="approved-row">
          <span className="queue-number">{String(index + 1).padStart(2, "0")}</span>
          <div><strong className={`scheduled-label${item.send_schedule_mode === "disabled" ? " schedule-disabled" : ""}`}>{scheduleLabel(item)}</strong>{item.event_title && <h3 className="approved-title">{item.event_title}</h3>}<p className="message-excerpt">{item.question}</p><p className="hint">{item.delivery_destination === "live" ? "/live only · no pings" : `Discord + /live · ${item.remove_pings ? "no pings" : "role ping"} · ${(item.discord_webhook_ids ?? ["primary"]).map(id => destinations.find(destination => destination.id === id)?.name || "Unavailable destination").join(", ")}`}</p></div>
          <div className="queued-actions"><MessagePreview title="Scheduled message"><AnnouncementPreview type={item.question_type} announcement={item.question} eventTitle={item.event_title || ""} scheduledDate={scheduled || ""} announcementTemplate={templates.announcementTemplate} eventTemplate={templates.eventTemplate} /></MessagePreview><ApprovedQuestionActions id={item.id} question={item.question} destinations={destinations} initialDestination={item.delivery_destination} initialRemovePings={item.remove_pings} selected={item.discord_webhook_ids ?? undefined} initialScheduleMode={item.send_schedule_mode} initialSendAt={pacificDateTimeInput(item.send_at)} /></div>
        </article>;
      })}</div> : <div className="empty-state"><p>Nothing scheduled. Approve a pending submission or add an item directly.</p><a href="/admin/pending" className="secondary">Review pending →</a></div>}
    </section>
  </AdminShell>;
}
