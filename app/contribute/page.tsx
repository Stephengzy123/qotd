import { logoutAction, submitQuestionAction } from "@/app/actions";
import { requireRole } from "@/lib/auth";
import { ScheduledDeliveryCheck } from "@/components/scheduled-delivery-check";
import { Notice } from "@/components/notice";
import { AnnouncementComposer } from "@/components/announcement-composer";
import { dbReady } from "@/lib/db";
import { addDays, DEFAULT_ANNOUNCEMENT_TEMPLATE, DEFAULT_EVENT_TEMPLATE, minimumAnnouncementDate, pacificParts } from "@/lib/qotd";
import { ContributorAnnouncements } from "@/components/contributor-announcements";
import { ComposerDialog } from "@/components/composer-dialog";
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
      <header className="topbar"><strong>Announcements</strong><a href="/live">Live feed</a><div className="account"><span>{session.username}</span><form action={logoutAction}><PendingButton className="text-button" pendingText="Signing out…">Sign out</PendingButton></form></div></header>
      <section className="page-heading hero">
        <div><h1>Announcements</h1><p>Write it once, see exactly how it lands in Discord, and send it for review.</p></div>
        <ComposerDialog buttonLabel="＋ New announcement" title="New announcement" description="Daily announcements publish the previous evening; events publish on their chosen date, during the 6 PM Pacific hour." className="primary hero-button">
          <form action={submitQuestionAction} className="composer-form">
            <AnnouncementComposer announcementMinimumDate={announcementMinimumDate} eventMinimumDate={eventMinimumDate} announcementTemplate={announcementTemplate} eventTemplate={eventTemplate} />
          </form>
        </ComposerDialog>
      </section>
      <Notice ok={params.ok} error={params.error} />
      <ContributorAnnouncements announcementTemplate={announcementTemplate} eventTemplate={eventTemplate} />
    </main>
  );
}
