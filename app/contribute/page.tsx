import { logoutAction, submitQuestionAction } from "@/app/actions";
import { requireRole } from "@/lib/auth";
import { Notice } from "@/components/notice";

export default async function ContributePage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const session = await requireRole("contributor");
  const params = await searchParams;
  return (
    <main className="app-shell narrow">
      <header className="topbar"><strong>QoTD</strong><div className="account"><span>{session.username}</span><form action={logoutAction}><button className="text-button">Sign out</button></form></div></header>
      <section className="page-heading"><h1>Submit a question</h1></section>
      <Notice ok={params.ok} error={params.error} />
      <form action={submitQuestionAction} className="panel contribution-form">
        <div className="field-heading"><label htmlFor="question">Your question</label><span>8–500 characters</span></div>
        <textarea id="question" name="question" rows={6} minLength={8} maxLength={500} required />
        <div><label htmlFor="note">Note <span className="muted">(optional)</span></label><textarea id="note" name="note" rows={3} maxLength={500} /></div>
        <div className="form-footer"><p>Up to 8 submissions per hour.</p><button type="submit" className="primary">Submit</button></div>
      </form>
    </main>
  );
}
