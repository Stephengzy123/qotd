import { submitQuestionAction } from "@/app/actions";
import { AppTopbar } from "@/components/app-topbar";
import { requireRole } from "@/lib/auth";
import { ScheduledDeliveryCheck } from "@/components/scheduled-delivery-check";
import { Notice } from "@/components/notice";
import { AnnouncementComposer } from "@/components/announcement-composer";
import { dbReady } from "@/lib/db";
import { addDays, DEFAULT_ANNOUNCEMENT_TEMPLATE, DEFAULT_EVENT_TEMPLATE, minimumAnnouncementDate, pacificParts } from "@/lib/qotd";
import { PendingButton } from "@/components/pending-button";
import { ContributorAnnouncements } from "@/components/contributor-announcements";
import { ComposerDialog } from "@/components/composer-dialog";

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
      <AppTopbar mode="contributor" username={session.username} links={[{ href: "/live", label: "Live feed" }]} />
      <section className="page-heading hero">
        <div><h1>Announcements</h1><p>Write it once, see exactly how it lands in Discord, and send it for review.</p></div>
        <ComposerDialog buttonLabel="＋ New announcement" title="New announcement" description="Daily announcements publish the previous evening; events publish on their chosen date, during the 6 PM Pacific hour." className="primary hero-button">
          <form action={submitQuestionAction} className="contribution-form">
            <AnnouncementComposer announcementMinimumDate={announcementMinimumDate} eventMinimumDate={eventMinimumDate} announcementTemplate={announcementTemplate} eventTemplate={eventTemplate} />
            <div><label htmlFor="note">Note for the reviewer <span className="muted">(optional)</span></label><textarea id="note" name="note" rows={2} maxLength={500} placeholder="Anything the admin should know before approving?" /></div>
            <label className="duplicate-confirmation"><input type="checkbox" name="checkedAnnouncements" value="yes" required /><span>I checked the to-be-sent and recently sent announcements listed on this page and confirm that my submission does not repeat what is already covered.</span></label>
            <div className="form-footer"><p>Up to 8 submissions per network per hour, independent of the shared login.</p><PendingButton type="submit" className="primary" pendingText="Submitting…">Submit for review</PendingButton></div>
          </form>
        </ComposerDialog>
      </section>
      <Notice ok={params.ok} error={params.error} />
      <ContributorAnnouncements announcementTemplate={announcementTemplate} eventTemplate={eventTemplate} />
    </main>
  );
}
