import { AdminShell } from "@/components/admin-shell";
import { requireRole } from "@/lib/auth";
import { dbReady } from "@/lib/db";
import { describeDetails } from "@/lib/log-details";

type ActivityEntry = { id: string; action: string; actor: string | null; actor_role: string | null; success: boolean; details: Record<string, unknown> | null; created_at: Date };
type Filters = { action?: string; actor?: string; status?: string; page?: string };

const PAGE_SIZE = 100;

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", timeZone: "America/Los_Angeles" }).format(date);
}

function pageUrl(filters: Filters, page: number) {
  const params = new URLSearchParams();
  if (filters.action) params.set("action", filters.action);
  if (filters.actor) params.set("actor", filters.actor);
  if (filters.status) params.set("status", filters.status);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return `/admin/logs${query ? `?${query}` : ""}`;
}

export default async function LogsPage({ searchParams }: { searchParams: Promise<Filters> }) {
  const session = await requireRole("admin");
  const filters = await searchParams;
  const page = Math.max(1, Number(filters.page) || 1);
  const action = (filters.action || "").trim().slice(0, 64);
  const actor = (filters.actor || "").trim().slice(0, 64);
  const status = filters.status === "ok" || filters.status === "failed" ? filters.status : "";
  const sql = await dbReady();
  const where = sql`
    where (${action} = '' or action = ${action})
      and (${actor} = '' or actor ilike ${`%${actor}%`})
      and (${status} = '' or success = ${status === "ok"})
  `;
  const [entries, countRows, actionRows] = await Promise.all([
    sql<ActivityEntry[]>`select id, action, actor, actor_role, success, details, created_at from activity_log ${where} order by created_at desc limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}`,
    sql<{ count: number }[]>`select count(*)::int as count from activity_log ${where}`,
    sql<{ action: string }[]>`select distinct action from activity_log order by action asc`,
  ]);
  const total = Number(countRows[0]?.count || 0);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current: Filters = { action, actor, status };

  return (
    <AdminShell page="logs" username={session.username} title="Logs" description="Every sign-in, submission, review decision, settings change, account change, send, and cron run. Newest first.">

      <form method="get" className="panel log-filters">
        <div><label htmlFor="filter-action">Action</label><select id="filter-action" name="action" defaultValue={action}><option value="">All actions</option>{actionRows.map((row) => <option key={row.action} value={row.action}>{row.action.replaceAll("_", " ")}</option>)}</select></div>
        <div><label htmlFor="filter-actor">Actor</label><input id="filter-actor" name="actor" defaultValue={actor} placeholder="username, cron, scheduler…" /></div>
        <div><label htmlFor="filter-status">Result</label><select id="filter-status" name="status" defaultValue={status}><option value="">All</option><option value="ok">Succeeded</option><option value="failed">Failed</option></select></div>
        <div className="log-filter-actions"><button type="submit" className="primary">Filter</button>{(action || actor || status) && <a href="/admin/logs" className="secondary log-clear">Clear</a>}</div>
      </form>

      <section className="section-block">
        <div className="section-title"><h2>{total.toLocaleString()} {total === 1 ? "entry" : "entries"}</h2><span className="count-badge">Page {page} of {pageCount}</span></div>
        {entries.length ? <div className="activity-list log-list">{entries.map((entry) => <div key={entry.id}><span className={`activity-dot ${entry.success ? "success" : "failed"}`} /><div><strong>{entry.action.replaceAll("_", " ")}{entry.actor ? ` · ${entry.actor}` : ""}{entry.actor_role ? ` (${entry.actor_role})` : ""}</strong>{entry.details && <p className={entry.success ? undefined : "send-error"}>{describeDetails(entry.details)}</p>}</div><div className="recent-actions"><time dateTime={entry.created_at.toISOString()}>{formatDate(entry.created_at)}</time></div></div>)}</div> : <div className="empty-state compact"><p>No log entries match these filters.</p></div>}
        {pageCount > 1 && <nav className="pagination" aria-label="Log pages">
          {page > 1 ? <a href={pageUrl(current, page - 1)} className="secondary">← Newer</a> : <span />}
          <span className="hint">Page {page} of {pageCount}</span>
          {page < pageCount ? <a href={pageUrl(current, page + 1)} className="secondary">Older →</a> : <span />}
        </nav>}
      </section>
    </AdminShell>
  );
}
