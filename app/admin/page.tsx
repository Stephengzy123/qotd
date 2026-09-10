import { logoutAction, reviewQuestionAction, saveSettingsAction, sendQuestionAction } from "@/app/actions";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { DEFAULT_TEMPLATE } from "@/lib/qotd";
import { Notice } from "@/components/notice";
import { TemplateEditor } from "@/components/template-editor";

type Question = { id: string; question: string; contributor_note: string | null; status: string; created_at: Date };
type Dispatch = { id: string; message: string; success: boolean; mode: string; created_at: Date; error: string | null };

function relativeDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" }).format(date);
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const session = await requireRole("admin");
  const params = await searchParams;
  const sql = db();
  const [pending, approved, sent, settingsRows, dispatches] = await Promise.all([
    sql<Question[]>`select id, question, contributor_note, status, created_at from questions where status = 'pending' order by created_at asc`,
    sql<Question[]>`select id, question, contributor_note, status, created_at from questions where status = 'approved' order by created_at asc`,
    sql<Question[]>`select id, question, contributor_note, status, created_at from questions where status = 'sent' order by sent_at desc limit 8`,
    sql`select message_template, webhook_url_encrypted is not null as has_webhook from settings where singleton = true`,
    sql<Dispatch[]>`select id, message, success, mode, created_at, error from dispatches order by created_at desc limit 8`,
  ]);
  const settings = settingsRows[0] || { message_template: DEFAULT_TEMPLATE, has_webhook: false };

  return (
    <main className="app-shell">
      <header className="topbar"><strong>QoTD admin</strong><nav><a href="#inbox">Pending</a><a href="#approved">Approved</a><a href="#delivery">Settings</a></nav><div className="account"><span>{session.username}</span><form action={logoutAction}><button className="text-button">Sign out</button></form></div></header>
      <section className="admin-heading"><div><h1>Questions</h1><p>Automatic send: 5:00 AM Pacific.</p></div></section>
      <Notice ok={params.ok} error={params.error} />
      <section className="stats" aria-label="Queue summary"><div><span>Awaiting review</span><strong>{pending.length}</strong></div><div><span>Ready to send</span><strong>{approved.length}</strong></div><div><span>Sent recently</span><strong>{sent.length}</strong></div></section>

      <section id="inbox" className="section-block"><div className="section-title"><h2>Pending</h2><span className="count-badge">{pending.length}</span></div>
        {pending.length ? <div className="question-list">{pending.map((item) => <form action={reviewQuestionAction} className="question-card" key={item.id}><input type="hidden" name="id" value={item.id} /><div className="question-meta"><span>Submitted {relativeDate(item.created_at)}</span><span className="status pending">Pending</span></div><textarea name="question" defaultValue={item.question} minLength={8} maxLength={500} required rows={3} />{item.contributor_note && <p className="review-note"><strong>Note:</strong> {item.contributor_note}</p>}<div className="card-actions"><button name="intent" value="reject" className="danger">Reject</button><button name="intent" value="save" className="secondary">Save</button><button name="intent" value="approve" className="primary">Approve</button></div></form>)}</div> : <div className="empty-state compact"><p>No pending questions.</p></div>}
      </section>

      <section id="approved" className="section-block"><div className="section-title"><h2>Approved</h2><form action={sendQuestionAction}><button className="secondary" disabled={!approved.length}>Send random</button></form></div>
        {approved.length ? <div className="approved-list">{approved.map((item, index) => <article key={item.id} className="approved-row"><span className="queue-number">{String(index + 1).padStart(2, "0")}</span><p>{item.question}</p><form action={sendQuestionAction}><input type="hidden" name="id" value={item.id} /><button className="send-button" aria-label={`Send: ${item.question}`}>Send now →</button></form></article>)}</div> : <div className="empty-state compact"><p>Approve a question to add it to the daily queue.</p></div>}
      </section>

      <section id="delivery" className="section-block"><div className="section-title"><h2>Settings</h2><span className={`status ${settings.has_webhook ? "ready" : "pending"}`}>{settings.has_webhook ? "Webhook saved" : "Webhook needed"}</span></div>
        <form action={saveSettingsAction} className="panel settings-form"><div><label htmlFor="webhook">Discord webhook URL</label><input id="webhook" name="webhook" type="password" placeholder={settings.has_webhook ? "Saved securely — enter a new URL to replace it" : "https://discord.com/api/webhooks/…"} autoComplete="off" /><p className="hint">Encrypted before it is stored. Leave blank to keep the current webhook.</p></div><TemplateEditor initialValue={settings.message_template || DEFAULT_TEMPLATE} /><div className="align-right"><button className="primary">Save delivery settings</button></div></form>
      </section>

      <section className="section-block"><div className="section-title"><h2>Recent sends</h2></div>{dispatches.length ? <div className="activity-list">{dispatches.map((item) => <div key={item.id}><span className={`activity-dot ${item.success ? "success" : "failed"}`} /><div><strong>{item.success ? "Sent" : "Failed"} · {item.mode.replaceAll("_", " ")}</strong><p>{item.error || item.message}</p></div><time>{relativeDate(item.created_at)}</time></div>)}</div> : <div className="empty-state compact"><p>No sends yet.</p></div>}</section>
    </main>
  );
}
