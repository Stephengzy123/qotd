import { logoutAction, submitQuestionAction } from "@/app/actions";
import { requireRole } from "@/lib/auth";
import { Notice } from "@/components/notice";
import { AnnouncementComposer } from "@/components/announcement-composer";
import { dbReady } from "@/lib/db";
import { addDays, DEFAULT_ANNOUNCEMENT_TEMPLATE, pacificParts } from "@/lib/qotd";

export default async function ContributePage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const session = await requireRole("contributor");
  const params = await searchParams;
  const minimumDate = addDays(pacificParts().localDate, 1);
  const sql = await dbReady();
  const settings = (await sql`select message_template from settings where singleton = true`)[0];
  const template = (settings?.message_template as string) || DEFAULT_ANNOUNCEMENT_TEMPLATE;
  return (
    <main className="app-shell">
      <header className="topbar"><strong>Announcements</strong><div className="account"><span>{session.username}</span><form action={logoutAction}><button className="text-button">Sign out</button></form></div></header>
      <section className="page-heading"><h1>Submit an announcement</h1></section>
      <Notice ok={params.ok} error={params.error} />
      <form action={submitQuestionAction} className="panel contribution-form">
        <AnnouncementComposer minimumDate={minimumDate} template={template} />
        <div><label htmlFor="note">Note <span className="muted">(optional)</span></label><textarea id="note" name="note" rows={3} maxLength={500} /></div>
        <div className="form-footer"><p>Up to 8 submissions per network per hour, independent of the shared login.</p><button type="submit" className="primary">Submit</button></div>
      </form>
    </main>
  );
}
