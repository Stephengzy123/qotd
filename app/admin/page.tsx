import { addApprovedQuestionAction, deleteAccountAction, logoutAction, reviewQuestionAction, saveSettingsAction, sendQuestionAction } from "@/app/actions";
import { listAccounts, ROLE_LABELS } from "@/lib/accounts";
import { requireRole } from "@/lib/auth";
import { dbReady } from "@/lib/db";
import { addDays, DEFAULT_ANNOUNCEMENT_TEMPLATE, DEFAULT_EVENT_TEMPLATE, displayScheduledDate, minimumAnnouncementDate, pacificParts, scheduledDateValue } from "@/lib/qotd";
import { ScheduledDeliveryCheck } from "@/components/scheduled-delivery-check";
import { Notice } from "@/components/notice";
import { ApprovedQuestionActions } from "@/components/approved-question-actions";
import { AnnouncementTemplateEditor } from "@/components/announcement-template-editor";
import { PendingButton } from "@/components/pending-button";
import { AdminEntryFields } from "@/components/admin-entry-fields";
import { Suspense } from "react";
import { MessagePreview } from "@/components/message-preview";
import { AnnouncementPreview } from "@/components/announcement-preview";
import { DiscordMarkdown } from "@/components/discord-preview";
import { WebhookProfile } from "@/components/webhook-profile";
import { ComposerDialog } from "@/components/composer-dialog";
import { QuickAnnouncement } from "@/components/quick-announcement";
import { getWebhookDetails } from "@/lib/webhook-details";
import { webhookOptions } from "@/lib/webhook-destinations";
import { WebhookPicker } from "@/components/webhook-picker";
import { describeDetails } from "@/lib/log-details";
import { CreateAccountDialog } from "@/components/create-account-dialog";

type Announcement = { discord_webhook_ids: string[] | null; id: string; question: string; contributor_note: string | null; status: string; created_at: Date; scheduled_date: string | Date | null; question_type: "announcement" | "event"; event_title: string | null; days_early: number };
type Dispatch = { id: string; message: string; success: boolean; mode: string; created_at: Date; error: string | null };
type ActivityEntry = { id: string; action: string; actor: string | null; actor_role: string | null; success: boolean; details: Record<string, unknown> | null; created_at: Date };

function relativeDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" }).format(date);
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const session = await requireRole("admin");
  const params = await searchParams;
  const sql = await dbReady();
  const [pending, approved, sent, settingsRows, dispatches, accounts, activity] = await Promise.all([
    sql<Announcement[]>`select discord_webhook_ids, id, question, contributor_note, status, created_at, scheduled_date, question_type, event_title, days_early from questions where status = 'pending' order by scheduled_date asc nulls last, created_at asc`,
    sql<Announcement[]>`select discord_webhook_ids, id, question, contributor_note, status, created_at, scheduled_date, question_type, event_title, days_early from questions where status = 'approved' order by scheduled_date asc nulls last, created_at asc`,
    sql<Announcement[]>`select discord_webhook_ids, id, question, contributor_note, status, created_at, scheduled_date, question_type, event_title, days_early from questions where status = 'sent' order by sent_at desc limit 8`,
    sql`select message_template, event_message_template, mention_role_id, webhook_url_encrypted, notification_webhook_url_encrypted, webhook_url_encrypted is not null as has_webhook,
      notification_user_id, notification_webhook_url_encrypted is not null as has_notification_webhook,
      calendar_feed_url_encrypted is not null as has_calendar_feed
      from settings where singleton = true`,
    sql<Dispatch[]>`select id, message, success, case when destination = 'live' then 'live_only' else mode end as mode, created_at, error from dispatches order by created_at desc limit 8`,
    listAccounts(),
    sql<ActivityEntry[]>`select id, action, actor, actor_role, success, details, created_at from activity_log order by created_at desc limit 50`,
  ]);
  const envAccounts = [
    { username: process.env.ADMIN_USERNAME, role: "admin" },
    { username: process.env.CONTRIBUTOR_USERNAME, role: "contributor" },
  ].filter((item): item is { username: string; role: string } => Boolean(item.username));
  const settings = settingsRows[0] || { message_template: DEFAULT_ANNOUNCEMENT_TEMPLATE, event_message_template: DEFAULT_EVENT_TEMPLATE, mention_role_id: null, has_webhook: false, notification_user_id: null, has_notification_webhook: false, has_calendar_feed: false };
  const eventMinimumDate = addDays(pacificParts().localDate, 1);
  const announcementMinimumDate = minimumAnnouncementDate();
  const destinations = await webhookOptions();
  const quickProfile = await getWebhookDetails(settings.webhook_url_encrypted);

  return (
    <main className="app-shell">
      <ScheduledDeliveryCheck />
      <header className="topbar"><strong>Announcement admin</strong><nav className="admin-navigation" aria-label="Admin"><a href="#inbox">Pending</a><a href="#approved">Approved</a><a href="#delivery">Settings</a><a href="#accounts">Accounts</a><a href="#activity">Activity</a><a href="/live">Live feed</a><a href="/admin/logs">Logs</a><a href="/admin/webhooks">Webhooks</a></nav><div className="account"><span>{session.username}</span><form action={logoutAction}><PendingButton className="text-button" pendingText="Signing out…">Sign out</PendingButton></form></div></header>
      <section className="admin-heading"><div><h1>Announcements</h1><p>Daily announcements publish the previous evening; events publish on their selected publish date, during the 6 PM Pacific hour.</p></div></section>
      <Notice ok={params.ok} error={params.error} />
      <QuickAnnouncement destinations={destinations} roleId={settings.mention_role_id} avatarUrl={quickProfile.status === "connected" ? quickProfile.avatarUrl : null} />
      <section className="stats" aria-label="Queue summary"><div><span>Awaiting review</span><strong>{pending.length}</strong></div><div><span>Scheduled</span><strong>{approved.length}</strong></div><div><span>Sent recently</span><strong>{sent.length}</strong></div></section>

      <section id="inbox" className="section-block"><div className="section-title"><h2>Pending</h2><span className="count-badge">{pending.length}</span></div>
        {pending.length ? <div className="question-list">{pending.map((item) => <form action={reviewQuestionAction} className="question-card" key={item.id}><input type="hidden" name="id" value={item.id} /><div className="question-meta"><span>Submitted {relativeDate(item.created_at)}</span><span className="status pending">{item.question_type === "event" ? "Event" : "Announcement"}</span></div><AdminEntryFields idPrefix={item.id} announcementMinimumDate={announcementMinimumDate} eventMinimumDate={eventMinimumDate} initialType={item.question_type} initialTitle={item.event_title || ""} initialDate={scheduledDateValue(item.scheduled_date) || ""} initialAnnouncement={item.question} initialDaysEarly={Number(item.days_early) || 0} announcementTemplate={settings.message_template || DEFAULT_ANNOUNCEMENT_TEMPLATE} eventTemplate={settings.event_message_template || DEFAULT_EVENT_TEMPLATE} /><WebhookPicker options={destinations} selected={item.discord_webhook_ids ?? undefined} />{item.contributor_note && <p className="review-note"><strong>Note:</strong> {item.contributor_note}</p>}<div className="card-actions"><PendingButton name="intent" value="reject" className="danger" formNoValidate pendingText="Rejecting…">Reject</PendingButton><PendingButton name="intent" value="save" className="secondary" pendingText="Saving…">Save</PendingButton><PendingButton name="intent" value="approve" className="primary" pendingText="Approving…">Approve</PendingButton></div></form>)}</div> : <div className="empty-state compact"><p>No pending announcements.</p></div>}
      </section>

      <section id="approved" className="section-block"><div className="section-title"><h2>Approved</h2>
        <ComposerDialog buttonLabel="＋ Add approved item" title="Add an approved item" description="Goes straight to the Approved queue and sends on its calculated date." className="secondary">
          <form action={addApprovedQuestionAction} className="contribution-form"><AdminEntryFields idPrefix="quick-add" announcementMinimumDate={announcementMinimumDate} eventMinimumDate={eventMinimumDate} announcementTemplate={settings.message_template || DEFAULT_ANNOUNCEMENT_TEMPLATE} eventTemplate={settings.event_message_template || DEFAULT_EVENT_TEMPLATE} /><WebhookPicker options={destinations} /><div className="form-footer"><p>Skips contributor review.</p><PendingButton className="primary" pendingText="Adding…">Add to Approved</PendingButton></div></form>
        </ComposerDialog></div>
        {approved.length ? <div className="approved-list">{approved.map((item, index) => { const date = scheduledDateValue(item.scheduled_date); const daysEarly = Number(item.days_early) || 0; return <article key={item.id} className="approved-row"><span className="queue-number">{String(index + 1).padStart(2, "0")}</span><div><strong className="scheduled-label">{item.question_type === "event" ? `Event publishes ${displayScheduledDate(item.scheduled_date)}` : `For ${displayScheduledDate(item.scheduled_date)} · sends ${date ? displayScheduledDate(addDays(date, -(daysEarly + 1))) : "Date unavailable"} at 6 PM Pacific${daysEarly ? ` · ${daysEarly} day${daysEarly === 1 ? "" : "s"} early` : ""}`}</strong>{item.event_title && <h3 className="approved-title">{item.event_title}</h3>}<p className="message-excerpt">{item.question}</p></div><div className="queued-actions"><MessagePreview title="Scheduled message"><AnnouncementPreview type={item.question_type === "event" ? "event" : "announcement"} announcement={item.question} eventTitle={item.event_title || ""} scheduledDate={date || ""} announcementTemplate={settings.message_template || DEFAULT_ANNOUNCEMENT_TEMPLATE} eventTemplate={settings.event_message_template || DEFAULT_EVENT_TEMPLATE} /></MessagePreview><ApprovedQuestionActions id={item.id} question={item.question} destinations={destinations} selected={item.discord_webhook_ids ?? undefined} /></div></article>; })}</div> : <div className="empty-state compact"><p>No approved announcements.</p></div>}
      </section>

      <section id="delivery" className="section-block"><div className="section-title"><h2>Settings</h2><span className={`status ${settings.has_webhook && settings.mention_role_id ? "ready" : "pending"}`}>{settings.has_webhook && settings.mention_role_id ? "Ready" : "Setup needed"}</span></div>
        <form action={saveSettingsAction} className="panel settings-form">
          <div><label htmlFor="webhook">Announcement webhook URL</label><input id="webhook" name="webhook" type="password" placeholder={settings.has_webhook ? "Saved securely — enter a new URL to replace it" : "https://discord.com/api/webhooks/…"} autoComplete="off" /><p className="hint">Leave blank to keep the saved webhook.</p></div>
          <Suspense fallback={<p className="hint" role="status">Loading saved announcement webhook…</p>}><WebhookProfile encryptedUrl={settings.webhook_url_encrypted} /></Suspense>
          <div><label htmlFor="roleId">Role ID mentioned on announcements</label><input id="roleId" name="roleId" inputMode="numeric" pattern="[0-9]{15,22}" defaultValue={settings.mention_role_id || ""} required /></div>
          <div><label htmlFor="calendarFeed">Calendar feed URL</label><input id="calendarFeed" name="calendarFeed" type="password" placeholder={settings.has_calendar_feed ? "Saved securely — enter a new URL to replace it" : "webcal://… or https://…"} autoComplete="off" /><p className="hint">Optional. All-day events for the Announcement date appear through <code>{"{calendar}"}</code>. Leave blank to keep the saved calendar.</p></div>
          <AnnouncementTemplateEditor fieldName="announcementTemplate" label="Announcement format" initialTemplate={settings.message_template || DEFAULT_ANNOUNCEMENT_TEMPLATE} defaultTemplate={DEFAULT_ANNOUNCEMENT_TEMPLATE} />
          <AnnouncementTemplateEditor fieldName="eventTemplate" label="Event format" initialTemplate={settings.event_message_template || DEFAULT_EVENT_TEMPLATE} defaultTemplate={DEFAULT_EVENT_TEMPLATE} event />
          <hr />
          <div><label htmlFor="notificationWebhook">Pending notification webhook URL</label><input id="notificationWebhook" name="notificationWebhook" type="password" placeholder={settings.has_notification_webhook ? "Saved securely — enter a new URL to replace it" : "https://discord.com/api/webhooks/…"} autoComplete="off" /><p className="hint">Optional. Sends a notice when a contributor adds a pending announcement.</p></div>
          <Suspense fallback={<p className="hint" role="status">Loading saved notification webhook…</p>}><WebhookProfile encryptedUrl={settings.notification_webhook_url_encrypted} /></Suspense>
          <div><label htmlFor="notificationUserId">Discord user ID to notify</label><input id="notificationUserId" name="notificationUserId" inputMode="numeric" pattern="[0-9]{15,22}" defaultValue={settings.notification_user_id || ""} placeholder="123456789012345678" /><p className="hint">The notification begins with <code>{"<@user-id>"}</code> so Discord pings you.</p></div>
          <div className="align-right"><PendingButton className="primary" pendingText="Saving…">Save settings</PendingButton></div>
        </form>
      </section>

      <section id="accounts" className="section-block"><div className="section-title"><h2>Accounts</h2><CreateAccountDialog /></div>
        <p className="hint">Accounts are created without a password. Each one gets a setup link to share; the person picks their password there. Club leaders also need their channel webhook connected on their account page.</p>
        <div className="activity-list">
          {envAccounts.map((account) => <div key={`env-${account.username}`}><span className="activity-dot success" /><div><strong>{account.username}</strong><p>{account.role} · configured in environment variables</p></div><div className="recent-actions"><span className="hint">Built in</span></div></div>)}
          {accounts.map((account) => <div key={account.id} className="account-row"><span className={`activity-dot ${account.has_password ? "success" : "pending"}`} /><div><strong><a href={`/admin/accounts/${account.id}`}>{account.username}</a></strong><p>{ROLE_LABELS[account.role]}{account.created_by ? ` · created by ${account.created_by}` : ""} · added {relativeDate(account.created_at)}{account.has_password ? "" : " · awaiting password setup"}</p></div>
            <div className="recent-actions"><a href={`/admin/accounts/${account.id}`} className="secondary">{account.role === "club_leader" ? "Manage & channel" : "Manage"}</a><form action={deleteAccountAction}><input type="hidden" name="id" value={account.id} /><PendingButton className="danger" pendingText="Deleting…" confirmMessage={`Delete “${account.username}”?`}>Delete</PendingButton></form></div></div>)}
        </div>
      </section>

      <section className="section-block"><div className="section-title"><h2>Recent sends</h2></div>{dispatches.length ? <div className="activity-list">{dispatches.map((item) => <div key={item.id}><span className={`activity-dot ${item.success ? "success" : "failed"}`} /><div><strong>{item.success ? "Sent" : "Failed"} · {item.mode.replaceAll("_", " ")}</strong>{item.error && <p className="send-error">{item.error}</p>}<p className="message-excerpt">{item.message}</p></div><div className="recent-actions"><time>{relativeDate(item.created_at)}</time><MessagePreview title={item.success ? "Sent message" : "Attempted message"}><div className="discord-preview"><DiscordMarkdown value={item.message} /></div></MessagePreview></div></div>)}</div> : <div className="empty-state compact"><p>No sends yet.</p></div>}</section>

      <section id="activity" className="section-block"><div className="section-title"><h2>Activity log</h2><a href="/admin/logs" className="secondary">View all logs →</a></div><p className="hint">Latest 50 events. The full log is searchable and filterable.</p>
        {activity.length ? <div className="activity-list">{activity.map((entry) => <div key={entry.id}><span className={`activity-dot ${entry.success ? "success" : "failed"}`} /><div><strong>{entry.action.replaceAll("_", " ")}{entry.actor ? ` · ${entry.actor}` : ""}{entry.actor_role ? ` (${entry.actor_role})` : ""}</strong>{entry.details && <p className={entry.success ? undefined : "send-error"}>{describeDetails(entry.details)}</p>}</div><div className="recent-actions"><time>{relativeDate(entry.created_at)}</time></div></div>)}</div> : <div className="empty-state compact"><p>Nothing logged yet.</p></div>}
      </section>
    </main>
  );
}
