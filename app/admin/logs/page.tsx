import { requireRole } from "@/lib/auth";
import { dbReady } from "@/lib/db";
import { describeDetails } from "@/lib/log-details";
import { labelAction, logKind } from "@/lib/log-kinds";
import { AdminShell } from "@/components/admin-shell";

type ActivityEntry = { id: string; action: string; actor: string | null; actor_role: string | null; success: boolean; details: Record<string, unknown> | null; created_at: Date };
type Filters = { action?: string; actor?: string; status?: string; page?: string };

const PAGE_SIZE = 100;
const ZONE = "America/Los_Angeles";

function dayKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
function dayLabel(date: Date) {
  const key = dayKey(date), today = dayKey(new Date()), yesterday = dayKey(new Date(Date.now() - 86_400_000));
  const long = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, weekday: "long", month: "long", day: "numeric" }).format(date);
  return key === today ? `Today · ${long}` : key === yesterday ? `Yesterday · ${long}` : long;
}
function timeLabel(date: Date) {
  return new Intl.DateTimeFormat("en-US", { timeZone: ZONE, hour: "numeric", minute: "2-digit", second: "2-digit" }).format(date);
}

function pageUrl(filters: Filters, page: number, overrides: Partial<Filters> = {}) {
  const merged = { ...filters, ...overrides };
  const params = new URLSearchParams();
  if (merged.action) params.set("action", merged.action);
  if (merged.actor) params.set("actor", merged.actor);
  if (merged.status) params.set("status", merged.status);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return `/admin/logs${query ? `?${query}` : ""}`;
}

// Turns the details blob into labelled chips; the failure reason is called out.
function DetailChips({ details, success }: { details: Record<string, unknown> | null; success: boolean }) {
  const text = describeDetails(details);
  if (!text) return null;
  const parts = text.split(" · ").filter(Boolean);
  return <div className="log-details">{parts.map((part, index) => {
    const split = part.indexOf(": ");
    const key = split > 0 ? part.slice(0, split) : null;
    const value = split > 0 ? part.slice(split + 2) : part;
    const reason = key === "reason" || key === "error";
    return <span key={index} className={reason && !success ? "reason" : undefined}>{key && <b>{key} </b>}{value}</span>;
  })}</div>;
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
  const [entries, countRows, actionRows, overviewRows] = await Promise.all([
    sql<ActivityEntry[]>`select id, action, actor, actor_role, success, details, created_at from activity_log ${where} order by created_at desc limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}`,
    sql<{ count: number }[]>`select count(*)::int as count from activity_log ${where}`,
    sql<{ action: string; count: number }[]>`select action, count(*)::int as count from activity_log where created_at > now() - interval '7 days' group by action order by count desc, action asc`,
    sql<{ today: number; failed_today: number; actors_week: number; total: number }[]>`
      select
        count(*) filter (where created_at > now() - interval '24 hours')::int as today,
        count(*) filter (where created_at > now() - interval '24 hours' and not success)::int as failed_today,
        count(distinct actor) filter (where created_at > now() - interval '7 days' and actor is not null)::int as actors_week,
        count(*)::int as total
      from activity_log
    `,
  ]);
  const overview = overviewRows[0] || { today: 0, failed_today: 0, actors_week: 0, total: 0 };
  const total = Number(countRows[0]?.count || 0);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current: Filters = { action, actor, status };
  const filtered = Boolean(action || actor || status);
  const days = entries.reduce<{ key: string; date: Date; items: ActivityEntry[] }[]>((groups, entry) => {
    const key = dayKey(entry.created_at);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(entry); else groups.push({ key, date: entry.created_at, items: [entry] });
    return groups;
  }, []);
  const topActions = actionRows.slice(0, 8);
  const allActions = actionRows.map((row) => row.action);
  if (action && !allActions.includes(action)) allActions.push(action);

  return (
    <AdminShell page="logs" username={session.username} title="Logs" description="Everything that happened, newest first — sign-ins, edits, approvals, sends, settings and account changes, cron runs." actions={filtered ? <a href="/admin/logs" className="secondary">Clear filters</a> : undefined}>
      <section className="log-overview" aria-label="Activity summary">
        <div><span>Events in the last 24 hours</span><strong>{overview.today.toLocaleString()}</strong></div>
        <div className={overview.failed_today ? "tone-failed" : "tone-ok"}><span>Failed in the last 24 hours</span><strong>{overview.failed_today.toLocaleString()}</strong></div>
        <div><span>Active people this week</span><strong>{overview.actors_week.toLocaleString()}</strong></div>
        <div><span>Events on record</span><strong>{overview.total.toLocaleString()}</strong></div>
      </section>

      <div className="log-chips" aria-label="Most common actions this week">
        <a href={pageUrl(current, 1, { action: "" })} className="log-chip" aria-current={!action ? "true" : undefined}>All actions</a>
        {topActions.map((row) => <a key={row.action} href={pageUrl(current, 1, { action: row.action })} className="log-chip" aria-current={action === row.action ? "true" : undefined}>{labelAction(row.action)}<span className="count-badge">{row.count}</span></a>)}
        <a href={pageUrl(current, 1, { status: status === "failed" ? "" : "failed" })} className="log-chip" aria-current={status === "failed" ? "true" : undefined}>Failures only</a>
      </div>

      <form method="get" className="panel log-filters">
        <div><label htmlFor="filter-action">Action</label><select id="filter-action" name="action" defaultValue={action}><option value="">All actions</option>{allActions.map((name) => <option key={name} value={name}>{labelAction(name)}</option>)}</select></div>
        <div><label htmlFor="filter-actor">Who</label><input id="filter-actor" name="actor" defaultValue={actor} placeholder="username, cron, scheduler…" /></div>
        <div><label htmlFor="filter-status">Result</label><select id="filter-status" name="status" defaultValue={status}><option value="">Any result</option><option value="ok">Succeeded</option><option value="failed">Failed</option></select></div>
        <div className="log-filter-actions"><button type="submit" className="primary">Apply</button></div>
      </form>

      <section className="section-block">
        <div className="section-title"><h2>{total.toLocaleString()} {total === 1 ? "event" : "events"}{filtered ? " match" : ""}</h2><span className="count-badge">Page {page} of {pageCount}</span></div>
        {days.length ? days.map((day) => <div key={day.key} className="log-day">
          <h3 className="log-day-title">{dayLabel(day.date)}<span>{day.items.length} {day.items.length === 1 ? "event" : "events"}</span></h3>
          <div className="activity-list log-list">{day.items.map((entry) => <div key={entry.id}>
            <span className={`activity-dot ${entry.success ? "success" : "failed"}`} />
            <time className="log-time" dateTime={entry.created_at.toISOString()}>{timeLabel(entry.created_at)}</time>
            <div>
              <div className="log-row-title"><span className={`log-action kind-${logKind(entry.action)}${entry.success ? "" : " failed"}`}>{labelAction(entry.action)}</span>{entry.actor && <span className="who">{entry.actor}{entry.actor_role && <small> · {entry.actor_role.replaceAll("_", " ")}</small>}</span>}</div>
              <DetailChips details={entry.details} success={entry.success} />
            </div>
            <div className="recent-actions">{entry.actor && !actor && <a href={pageUrl(current, 1, { actor: entry.actor })} className="secondary small">Only {entry.actor}</a>}</div>
          </div>)}</div>
        </div>) : <div className="empty-state"><p>No events match these filters.</p><a href="/admin/logs" className="secondary">Show everything</a></div>}
        {pageCount > 1 && <nav className="pagination" aria-label="Log pages">
          {page > 1 ? <a href={pageUrl(current, page - 1)} className="secondary">← Newer</a> : <span />}
          <span className="hint">Page {page} of {pageCount}</span>
          {page < pageCount ? <a href={pageUrl(current, page + 1)} className="secondary">Older →</a> : <span />}
        </nav>}
      </section>
    </AdminShell>
  );
}
