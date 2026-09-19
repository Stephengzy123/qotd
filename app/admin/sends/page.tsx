import { requireRole } from "@/lib/auth";
import { dbReady } from "@/lib/db";
import { relativeDate } from "@/lib/admin-data";
import { AdminShell } from "@/components/admin-shell";
import { DiscordMarkdown } from "@/components/discord-preview";
import { MessagePreview } from "@/components/message-preview";

type Dispatch = { id: string; message: string; success: boolean; mode: string; created_at: Date; error: string | null };

export default async function SendsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const session = await requireRole("admin");
  const params = await searchParams;
  const sql = await dbReady();
  const dispatches = await sql<Dispatch[]>`select id, message, success, case when destination = 'live' then 'live_only' else mode end as mode, created_at, error from dispatches order by created_at desc limit 100`;
  const failed = dispatches.filter((item) => !item.success).length;

  return (
    <AdminShell page="sends" username={session.username} title="Sends" description="Every delivery attempt — scheduled, manual, quick, and /live-only — newest first, with the exact message that went out." notice={params} actions={<span className={`status ${failed ? "pending" : "ready"}`}>{failed ? `${failed} failed in the last ${dispatches.length}` : "No recent failures"}</span>}>
      <section className="section-block">
        {dispatches.length ? <div className="activity-list">{dispatches.map((item) => <div key={item.id}><span className={`activity-dot ${item.success ? "success" : "failed"}`} /><div><strong>{item.success ? "Sent" : "Failed"} · {item.mode.replaceAll("_", " ")}</strong>{item.error && <p className="send-error">{item.error}</p>}<p className="message-excerpt">{item.message}</p></div><div className="recent-actions"><time>{relativeDate(item.created_at)}</time><MessagePreview title={item.success ? "Sent message" : "Attempted message"}><div className="discord-preview"><DiscordMarkdown value={item.message} /></div></MessagePreview></div></div>)}</div> : <div className="empty-state"><p>No sends yet.</p></div>}
      </section>
    </AdminShell>
  );
}
