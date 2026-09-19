import { Suspense } from "react";
import { saveSettingsAction } from "@/app/actions";
import { requireRole } from "@/lib/auth";
import { dbReady } from "@/lib/db";
import { DEFAULT_ANNOUNCEMENT_TEMPLATE, DEFAULT_EVENT_TEMPLATE } from "@/lib/qotd";
import { AdminShell } from "@/components/admin-shell";
import { AnnouncementTemplateEditor } from "@/components/announcement-template-editor";
import { PendingButton } from "@/components/pending-button";
import { WebhookProfile } from "@/components/webhook-profile";

type Settings = { message_template: string | null; event_message_template: string | null; mention_role_id: string | null; webhook_url_encrypted: string | null; notification_webhook_url_encrypted: string | null; has_webhook: boolean; notification_user_id: string | null; has_notification_webhook: boolean; has_calendar_feed: boolean; live_channel_name: string | null };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const session = await requireRole("admin");
  const params = await searchParams;
  const sql = await dbReady();
  const rows = await sql<Settings[]>`select message_template, event_message_template, mention_role_id, webhook_url_encrypted, notification_webhook_url_encrypted, webhook_url_encrypted is not null as has_webhook,
    notification_user_id, notification_webhook_url_encrypted is not null as has_notification_webhook,
    calendar_feed_url_encrypted is not null as has_calendar_feed, live_channel_name
    from settings where singleton = true`;
  const settings: Settings = rows[0] || { message_template: null, event_message_template: null, mention_role_id: null, webhook_url_encrypted: null, notification_webhook_url_encrypted: null, has_webhook: false, notification_user_id: null, has_notification_webhook: false, has_calendar_feed: false, live_channel_name: null };
  const ready = Boolean(settings.has_webhook && settings.mention_role_id);

  return (
    <AdminShell page="settings" username={session.username} title="Settings" description="Where announcements go, who gets mentioned, and how each message is formatted." notice={params} actions={<span className={`status ${ready ? "ready" : "pending"}`}>{ready ? "Ready to send" : "Setup needed"}</span>}>
      <form action={saveSettingsAction} className="settings-pages">
        <section className="section-block"><div className="section-title"><h2>Delivery</h2></div>
          <div className="panel settings-form">
            <div><label htmlFor="webhook">Announcement webhook URL</label><input id="webhook" name="webhook" type="password" placeholder={settings.has_webhook ? "Saved securely — enter a new URL to replace it" : "https://discord.com/api/webhooks/…"} autoComplete="off" /><p className="hint">Leave blank to keep the saved webhook.</p></div>
            <Suspense fallback={<p className="hint" role="status">Loading saved announcement webhook…</p>}><WebhookProfile encryptedUrl={settings.webhook_url_encrypted} /></Suspense>
            <div><label htmlFor="roleId">Role ID mentioned on announcements</label><input id="roleId" name="roleId" inputMode="numeric" pattern="[0-9]{15,22}" defaultValue={settings.mention_role_id || ""} required /></div>
            <div><label htmlFor="calendarFeed">Calendar feed URL</label><input id="calendarFeed" name="calendarFeed" type="password" placeholder={settings.has_calendar_feed ? "Saved securely — enter a new URL to replace it" : "webcal://… or https://…"} autoComplete="off" /><p className="hint">Optional. All-day events for the Announcement date appear through <code>{"{calendar}"}</code>. Leave blank to keep the saved calendar.</p></div>
          </div>
        </section>
        <section className="section-block"><div className="section-title"><h2>Message formats</h2></div>
          <div className="panel settings-form">
            <AnnouncementTemplateEditor fieldName="announcementTemplate" label="Announcement format" initialTemplate={settings.message_template || DEFAULT_ANNOUNCEMENT_TEMPLATE} defaultTemplate={DEFAULT_ANNOUNCEMENT_TEMPLATE} />
            <AnnouncementTemplateEditor fieldName="eventTemplate" label="Event format" initialTemplate={settings.event_message_template || DEFAULT_EVENT_TEMPLATE} defaultTemplate={DEFAULT_EVENT_TEMPLATE} event />
          </div>
        </section>
        <section className="section-block"><div className="section-title"><h2>Pending notifications</h2></div>
          <div className="panel settings-form">
            <div><label htmlFor="notificationWebhook">Pending notification webhook URL</label><input id="notificationWebhook" name="notificationWebhook" type="password" placeholder={settings.has_notification_webhook ? "Saved securely — enter a new URL to replace it" : "https://discord.com/api/webhooks/…"} autoComplete="off" /><p className="hint">Optional. Sends a notice when a contributor adds a pending announcement.</p></div>
            <Suspense fallback={<p className="hint" role="status">Loading saved notification webhook…</p>}><WebhookProfile encryptedUrl={settings.notification_webhook_url_encrypted} /></Suspense>
            <div><label htmlFor="notificationUserId">Discord user ID to notify</label><input id="notificationUserId" name="notificationUserId" inputMode="numeric" pattern="[0-9]{15,22}" defaultValue={settings.notification_user_id || ""} placeholder="123456789012345678" /><p className="hint">The notification begins with <code>{"<@user-id>"}</code> so Discord pings you.</p></div>
          </div>
        </section>
        <section className="section-block"><div className="section-title"><h2>Live channel</h2></div>
          <div className="panel settings-form">
            <div><label htmlFor="liveChannelName">Channel name</label><input id="liveChannelName" name="liveChannelName" defaultValue={settings.live_channel_name || "Announcements"} minLength={1} maxLength={60} required /><p className="hint">Shown at the top of <code>/live</code>. It does not change message author names.</p></div>
          </div>
        </section>
        <div className="settings-save"><p className="hint">One save covers all three sections.</p><PendingButton className="primary" pendingText="Saving…">Save settings</PendingButton></div>
      </form>
    </AdminShell>
  );
}
