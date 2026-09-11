import { logoutAction, submitQuestionAction } from "@/app/actions";
import { requireRole } from "@/lib/auth";
import { Notice } from "@/components/notice";
import { AnnouncementComposer } from "@/components/announcement-composer";
import { addDays, pacificParts } from "@/lib/qotd";

export default async function ContributePage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const session = await requireRole("contributor");
  const params = await searchParams;
  const minimumDate = addDays(pacificParts().localDate, 1);
  return (
    <main className="app-shell narrow">
      <header className="topbar"><strong>Announcements</strong><div className="account"><span>{session.username}</span><form action={logoutAction}><button className="text-button">Sign out</button></form></div></header>
      <section className="page-heading"><h1>Submit an announcement</h1></section>
      <Notice ok={params.ok} error={params.error} />
      <form action={submitQuestionAction} className="panel contribution-form">
        <AnnouncementComposer minimumDate={minimumDate} />
        <div><label htmlFor="note">Note <span className="muted">(optional)</span></label><textarea id="note" name="note" rows={3} maxLength={500} /></div>
        <div className="form-footer"><p>Up to 8 submissions per network per hour, independent of the shared login.</p><button type="submit" className="primary">Submit</button></div>
      </form>
    </main>
  );
}
