import { AdminShell } from "@/components/admin-shell";
import { PendingButton } from "@/components/pending-button";
import { requireRole } from "@/lib/auth";
import { dbReady } from "@/lib/db";
import { updateIssue } from "@/app/report/actions";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string; type?: string }> }) {
  const session = await requireRole("admin");
  const params = await searchParams;
  const status = params.status === "resolved" ? "resolved" : "open";
  const suggestions = params.type === "suggestions";
  const type = suggestions ? "suggestions" : "issues";
  const page = Math.max(1, Math.min(10000, Number.parseInt(params.page || "1", 10) || 1));
  const sql = await dbReady();
  const reports = await sql`select id, category, context, description, created_at, resolved_by from issue_reports where status = ${status} and (category = 'suggestion') = ${suggestions} order by created_at desc, id desc limit 51 offset ${(page - 1) * 50}`;
  return <AdminShell page="reports" username={session.username} title="Inbox" description="Issue reports and feature suggestions from visitors.">
    <nav className="row-buttons" aria-label="Inbox type"><a className={suggestions ? "secondary" : "primary"} href="/admin/reports?type=issues" aria-current={!suggestions ? "page" : undefined}>Issue reports</a><a className={suggestions ? "primary" : "secondary"} href="/admin/reports?type=suggestions" aria-current={suggestions ? "page" : undefined}>Suggestions</a></nav>
    <nav className="row-buttons" aria-label="Inbox status" style={{ marginTop: ".75rem" }}><a className="secondary" href={`/admin/reports?type=${type}`} aria-current={status === "open" ? "page" : undefined}>Open</a><a className="secondary" href={`/admin/reports?type=${type}&status=resolved`} aria-current={status === "resolved" ? "page" : undefined}>Resolved</a></nav>
    {reports.slice(0, 50).map(report => <article key={report.id} className="panel" style={{ padding: "1rem", marginTop: "1rem" }}><strong>{report.category}</strong><p className="hint">{new Date(report.created_at).toLocaleString("en-CA", { timeZone: "America/Vancouver" })} Pacific</p>{report.context && <p style={{ overflowWrap: "anywhere" }}>Reported item: {report.context}</p>}<p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{report.description}</p>{report.resolved_by && <p>Resolved by {report.resolved_by}</p>}<form action={updateIssue}><input type="hidden" name="id" value={report.id} /><input type="hidden" name="status" value={status === "open" ? "resolved" : "open"} /><PendingButton className="secondary" pendingText="Saving…">{status === "open" ? "Mark resolved" : "Reopen"}</PendingButton></form></article>)}
    {!reports.length && <p>No {status} {suggestions ? "suggestions" : "reports"}.</p>}
    <nav className="row-buttons">{page > 1 && <a href={`/admin/reports?type=${type}&status=${status}&page=${page - 1}`}>Previous</a>}{reports.length > 50 && <a href={`/admin/reports?type=${type}&status=${status}&page=${page + 1}`}>Next</a>}</nav>
  </AdminShell>;
}
