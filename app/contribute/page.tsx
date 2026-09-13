import { logoutAction, submitQuestionAction } from "@/app/actions";
import { requireRole } from "@/lib/auth";
import { ScheduledDeliveryCheck } from "@/components/scheduled-delivery-check";
import { Notice } from "@/components/notice";
import { AnnouncementComposer } from "@/components/announcement-composer";
import { dbReady } from "@/lib/db";
import { addDays, DEFAULT_ANNOUNCEMENT_TEMPLATE, DEFAULT_EVENT_TEMPLATE, minimumAnnouncementDate, pacificParts } from "@/lib/qotd";
import { PendingButton } from "@/components/pending-button";

export default async function ContributePage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const session = await requireRole("contributor");
  const params = await searchParams;
  const eventMinimumDate = addDays(pacificParts().localDate, 1);
  const announcementMinimumDate = minimumAnnouncementDate();
  const sql = await dbReady();
  const settings = (await sql`select message_template, event_message_template from settings where singleton = true`)[0];
  const announcementTemplate = (settings?.message_template as string) || DEFAULT_ANNOUNCEMENT_TEMPLATE;
  const eventTemplate = (settings?.event_message_template as string) || DEFAULT_EVENT_TEMPLATE;
  return (
    <main className="app-shell">
      <ScheduledDeliveryCheck />
      <header className="topbar"><strong>Announcements</strong><div className="account"><span>{session.username}</span><form action={logoutAction}><PendingButton className="text-button" pendingText="Signing out…">Sign out</PendingButton></form></div></header>
      <section className="page-heading"><h1>Submit an announcement</h1></section>
      <Notice ok={params.ok} error={params.error} />
      <form action={submitQuestionAction} className="panel contribution-form">
        <AnnouncementComposer announcementMinimumDate={announcementMinimumDate} eventMinimumDate={eventMinimumDate} announcementTemplate={announcementTemplate} eventTemplate={eventTemplate} />
        <div><label htmlFor="note">Note <span className="muted">(optional)</span></label><textarea id="note" name="note" rows={3} maxLength={500} /></div>
        <div className="form-footer"><p>Up to 8 submissions per network per hour, independent of the shared login.</p><PendingButton type="submit" className="primary" pendingText="Submitting…">Submit</PendingButton></div>
      </form>
    </main>
  );
}
