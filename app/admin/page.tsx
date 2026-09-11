import { addApprovedQuestionAction, logoutAction, reviewQuestionAction, saveSettingsAction, sendQuestionAction } from "@/app/actions";
import { requireRole } from "@/lib/auth";
import { dbReady } from "@/lib/db";
import { addDays, DEFAULT_ANNOUNCEMENT_TEMPLATE, DEFAULT_EVENT_TEMPLATE, displayScheduledDate, minimumAnnouncementDate, pacificParts, scheduledDateValue } from "@/lib/qotd";
import { Notice } from "@/components/notice";
import { ApprovedQuestionActions } from "@/components/approved-question-actions";
import { AnnouncementTemplateEditor } from "@/components/announcement-template-editor";
import { PendingButton } from "@/components/pending-button";
import { AdminEntryFields } from "@/components/admin-entry-fields";

type Announcement = { id: string; question: string; contributor_note: string | null; status: string; created_at: Date; scheduled_date: string | Date | null; question_type: "announcement" | "event"; event_title: string | null };
type Dispatch = { id: string; message: string; success: boolean; mode: string; created_at: Date; error: string | null };

function relativeDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" }).format(date);
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const session = await requireRole("admin");
  const params = await searchParams;
  const sql = await dbReady();
  const [pending, approved, sent, settingsRows, dispatches] = await Promise.all([
    sql<Announcement[]>`select id, question, contributor_note, status, created_at, scheduled_date, question_type, event_title from questions where status = 'pending' order by scheduled_date asc nulls last, created_at asc`,
    sql<Announcement[]>`select id, question, contributor_note, status, created_at, scheduled_date, question_type, event_title from questions where status = 'approved' order by scheduled_date asc nulls last, created_at asc`,
    sql<Announcement[]>`select id, question, contributor_note, status, created_at, scheduled_date, question_type, event_title from questions where status = 'sent' order by sent_at desc limit 8`,
    sql`select message_template, event_message_template, mention_role_id, webhook_url_encrypted is not null as has_webhook,
      notification_user_id, notification_webhook_url_encrypted is not null as has_notification_webhook
      from settings where singleton = true`,
    sql<Dispatch[]>`select id, message, success, mode, created_at, error from dispatches order by created_at desc limit 8`,
  ]);
  const settings = settingsRows[0] || { message_template: DEFAULT_ANNOUNCEMENT_TEMPLATE, event_message_template: DEFAULT_EVENT_TEMPLATE, mention_role_id: null, has_webhook: false, notification_user_id: null, has_notification_webhook: false };
  const eventMinimumDate = addDays(pacificParts().localDate, 1);
  const announcementMinimumDate = minimumAnnouncementDate();

  return (
    <main className="app-shell">
      <header className="topbar"><strong>Announcement admin</strong><nav><a href="#inbox">Pending</a><a href="#approved">Approved</a><a href="#delivery">Settings</a></nav><div className="account"><span>{session.username}</span><form action={logoutAction}><PendingButton className="text-button" pendingText="Signing out…">Sign out</PendingButton></form></div></header>
      <section className="admin-heading"><div><h1>Announcements</h1><p>Daily announcements publish the previous evening; events publish on their selected publish date, during the 6 PM Pacific hour.</p></div></section>
      <Notice ok={params.ok} error={params.error} />
      <section className="stats" aria-label="Queue summary"><div><span>Awaiting review</span><strong>{pending.length}</strong></div><div><span>Scheduled</span><strong>{approved.length}</strong></div><div><span>Sent recently</span><strong>{sent.length}</strong></div></section>

      <section id="inbox" className="section-block"><div className="section-title"><h2>Pending</h2><span className="count-badge">{pending.length}</span></div>
        {pending.length ? <div className="question-list">{pending.map((item) => <form action={reviewQuestionAction} className="question-card" key={item.id}><input type="hidden" name="id" value={item.id} /><div className="question-meta"><span>Submitted {relativeDate(item.created_at)}</span><span className="status pending">{item.question_type === "event" ? "Event" : "Announcement"}</span></div><AdminEntryFields idPrefix={item.id} announcementMinimumDate={announcementMinimumDate} eventMinimumDate={eventMinimumDate} initialType={item.question_type} initialTitle={item.event_title || ""} initialDate={scheduledDateValue(item.scheduled_date) || ""} initialAnnouncement={item.question} />{item.contributor_note && <p className="review-note"><strong>Note:</strong> {item.contributor_note}</p>}<div className="card-actions"><PendingButton name="intent" value="reject" className="danger" formNoValidate pendingText="Rejecting…">Reject</PendingButton><PendingButton name="intent" value="save" className="secondary" pendingText="Saving…">Save</PendingButton><PendingButton name="intent" value="approve" className="primary" pendingText="Approving…">Approve</PendingButton></div></form>)}</div> : <div className="empty-state compact"><p>No pending announcements.</p></div>}
      </section>

      <section id="approved" className="section-block"><div className="section-title"><h2>Approved</h2></div>
        <form action={addApprovedQuestionAction} className="panel quick-add-form"><h3>Add an approved item</h3><AdminEntryFields idPrefix="quick-add" announcementMinimumDate={announcementMinimumDate} eventMinimumDate={eventMinimumDate} /><div className="align-right"><PendingButton className="primary" pendingText="Adding…">Add</PendingButton></div></form>
        {approved.length ? <div className="approved-list">{approved.map((item, index) => <article key={item.id} className="approved-row"><span className="queue-number">{String(index + 1).padStart(2, "0")}</span><div><strong className="scheduled-label">{item.question_type === "event" ? `Event publishes ${displayScheduledDate(item.scheduled_date)}` : `For ${displayScheduledDate(item.scheduled_date)} · publishes the previous evening`}</strong>{item.event_title && <h3 className="approved-title">{item.event_title}</h3>}<p>{item.question}</p></div><ApprovedQuestionActions id={item.id} question={item.question} /></article>)}</div> : <div className="empty-state compact"><p>No approved announcements.</p></div>}
      </section>

      <section id="delivery" className="section-block"><div className="section-title"><h2>Settings</h2><span className={`status ${settings.has_webhook && settings.mention_role_id ? "ready" : "pending"}`}>{settings.has_webhook && settings.mention_role_id ? "Ready" : "Setup needed"}</span></div>
        <form action={saveSettingsAction} className="panel settings-form">
          <div><label htmlFor="webhook">Announcement webhook URL</label><input id="webhook" name="webhook" type="password" placeholder={settings.has_webhook ? "Saved securely — enter a new URL to replace it" : "https://discord.com/api/webhooks/…"} autoComplete="off" /><p className="hint">Leave blank to keep the saved webhook.</p></div>
          <div><label htmlFor="roleId">Role ID mentioned on announcements</label><input id="roleId" name="roleId" inputMode="numeric" pattern="[0-9]{15,22}" defaultValue={settings.mention_role_id || ""} required /></div>
          <AnnouncementTemplateEditor fieldName="announcementTemplate" label="Announcement format" initialTemplate={settings.message_template || DEFAULT_ANNOUNCEMENT_TEMPLATE} defaultTemplate={DEFAULT_ANNOUNCEMENT_TEMPLATE} />
          <AnnouncementTemplateEditor fieldName="eventTemplate" label="Event format" initialTemplate={settings.event_message_template || DEFAULT_EVENT_TEMPLATE} defaultTemplate={DEFAULT_EVENT_TEMPLATE} event />
          <hr />
          <div><label htmlFor="notificationWebhook">Pending notification webhook URL</label><input id="notificationWebhook" name="notificationWebhook" type="password" placeholder={settings.has_notification_webhook ? "Saved securely — enter a new URL to replace it" : "https://discord.com/api/webhooks/…"} autoComplete="off" /><p className="hint">Optional. Sends a notice when a contributor adds a pending announcement.</p></div>
          <div><label htmlFor="notificationUserId">Discord user ID to notify</label><input id="notificationUserId" name="notificationUserId" inputMode="numeric" pattern="[0-9]{15,22}" defaultValue={settings.notification_user_id || ""} placeholder="123456789012345678" /><p className="hint">The notification begins with <code>{"<@user-id>"}</code> so Discord pings you.</p></div>
          <div className="align-right"><PendingButton className="primary" pendingText="Saving…">Save settings</PendingButton></div>
        </form>
      </section>

      <section className="section-block"><div className="section-title"><h2>Recent sends</h2></div>{dispatches.length ? <div className="activity-list">{dispatches.map((item) => <div key={item.id}><span className={`activity-dot ${item.success ? "success" : "failed"}`} /><div><strong>{item.success ? "Sent" : "Failed"} · {item.mode.replaceAll("_", " ")}</strong><p>{item.error || item.message}</p></div><time>{relativeDate(item.created_at)}</time></div>)}</div> : <div className="empty-state compact"><p>No sends yet.</p></div>}</section>
    </main>
  );
}
