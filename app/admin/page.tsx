import { addApprovedQuestionAction, logoutAction, reviewQuestionAction, saveSettingsAction, sendQuestionAction } from "@/app/actions";
import { requireRole } from "@/lib/auth";
import { dbReady } from "@/lib/db";
import { DEFAULT_TEMPLATE } from "@/lib/qotd";
import { Notice } from "@/components/notice";
import { TemplateEditor } from "@/components/template-editor";
import { ApprovedQuestionActions } from "@/components/approved-question-actions";
import { QuestionTypeFields } from "@/components/question-type-fields";

type Question = { id: string; question: string; question_type: string; reactions: string[]; contributor_note: string | null; status: string; created_at: Date };
type Dispatch = { id: string; message: string; success: boolean; mode: string; transport: string; created_at: Date; error: string | null };

function relativeDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" }).format(date);
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const session = await requireRole("admin");
  const params = await searchParams;
  const sql = await dbReady();
  const [pending, approved, sent, settingsRows, dispatches] = await Promise.all([
    sql<Question[]>`select id, question, question_type, reactions, contributor_note, status, created_at from questions where status = 'pending' order by created_at asc`,
    sql<Question[]>`select id, question, question_type, reactions, contributor_note, status, created_at from questions where status = 'approved' order by created_at asc`,
    sql<Question[]>`select id, question, question_type, reactions, contributor_note, status, created_at from questions where status = 'sent' order by sent_at desc limit 8`,
    sql`select open_message_template, reaction_message_template, mention_role_id, next_number,
      bot_application_id, bot_channel_id, automatic_question_type,
      bot_token_encrypted is not null as has_bot_token,
      webhook_url_encrypted is not null as has_webhook
      from settings where singleton = true`,
    sql<Dispatch[]>`select id, message, success, mode, transport, created_at, error from dispatches order by created_at desc limit 8`,
  ]);
  const settings = settingsRows[0] || { open_message_template: DEFAULT_TEMPLATE, reaction_message_template: DEFAULT_TEMPLATE, mention_role_id: null, next_number: 1, bot_application_id: null, bot_channel_id: null, automatic_question_type: "both", has_bot_token: false, has_webhook: false };
  const inviteUrl = settings.bot_application_id ? `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(settings.bot_application_id)}&scope=bot&permissions=68672` : null;

  return (
    <main className="app-shell">
      <header className="topbar"><strong>QoTD admin</strong><nav><a href="#inbox">Pending</a><a href="#approved">Approved</a><a href="#delivery">Settings</a></nav><div className="account"><span>{session.username}</span><form action={logoutAction}><button className="text-button">Sign out</button></form></div></header>
      <section className="admin-heading"><div><h1>Questions</h1><p>Automatic send: 5:00 AM PDT / 4:00 AM PST.</p></div></section>
      <Notice ok={params.ok} error={params.error} />
      <section className="stats" aria-label="Queue summary"><div><span>Awaiting review</span><strong>{pending.length}</strong></div><div><span>Ready to send</span><strong>{approved.length}</strong></div><div><span>Sent recently</span><strong>{sent.length}</strong></div></section>

      <section id="inbox" className="section-block"><div className="section-title"><h2>Pending</h2><span className="count-badge">{pending.length}</span></div>
        {pending.length ? <div className="question-list">{pending.map((item) => <form action={reviewQuestionAction} className="question-card" key={item.id}><input type="hidden" name="id" value={item.id} /><div className="question-meta"><span>Submitted {relativeDate(item.created_at)}</span><span className="status pending">Pending</span></div><textarea name="question" defaultValue={item.question} minLength={8} maxLength={500} required rows={3} /><QuestionTypeFields initialType={item.question_type} initialReactions={item.reactions} />{item.contributor_note && <p className="review-note"><strong>Note:</strong> {item.contributor_note}</p>}<div className="card-actions"><button name="intent" value="reject" className="danger">Reject</button><button name="intent" value="save" className="secondary">Save</button><button name="intent" value="approve" className="primary">Approve</button></div></form>)}</div> : <div className="empty-state compact"><p>No pending questions.</p></div>}
      </section>

      <section id="approved" className="section-block"><div className="section-title"><h2>Approved</h2><div className="random-send-actions"><form action={sendQuestionAction}><input type="hidden" name="transport" value="bot" /><button className="secondary" disabled={!approved.length}>Random via bot</button></form><form action={sendQuestionAction}><input type="hidden" name="transport" value="webhook" /><button className="secondary" disabled={!approved.length}>Random via webhook</button></form></div></div>
        <form action={addApprovedQuestionAction} className="panel quick-add-form"><label htmlFor="admin-question">Add an approved question</label><textarea id="admin-question" name="question" rows={2} minLength={8} maxLength={500} required /><QuestionTypeFields /><div className="align-right"><button className="primary">Add</button></div></form>
        {approved.length ? <div className="approved-list">{approved.map((item, index) => <article key={item.id} className="approved-row"><span className="queue-number">{String(index + 1).padStart(2, "0")}</span><div><p>{item.question}</p><span className="question-kind">{item.question_type === "reaction" ? `Reaction · ${item.reactions.join(" ")}` : "Open answer"}</span></div><ApprovedQuestionActions id={item.id} question={item.question} /></article>)}</div> : <div className="empty-state compact"><p>No approved questions.</p></div>}
      </section>

      <section id="delivery" className="section-block"><div className="section-title"><h2>Settings</h2><div className="settings-status"><span className={`status ${settings.has_bot_token && settings.bot_channel_id ? "ready" : "pending"}`}>{settings.has_bot_token && settings.bot_channel_id ? "Bot configured" : "Bot needed"}</span><span className={`status ${settings.has_webhook ? "ready" : "pending"}`}>{settings.has_webhook ? "Webhook saved" : "Webhook optional"}</span></div></div>
        <form action={saveSettingsAction} className="panel settings-form">
          <div className="settings-group"><h3>Bot</h3><div className="settings-grid"><div><label htmlFor="botToken">Bot token</label><input id="botToken" name="botToken" type="password" placeholder={settings.has_bot_token ? "Saved securely — enter a new token to replace it" : "Bot token"} autoComplete="off" /><p className="hint">Encrypted before storage. Leave blank to keep it.</p></div><div><label htmlFor="botApplicationId">Application ID</label><input id="botApplicationId" name="botApplicationId" inputMode="numeric" pattern="[0-9]{15,22}" defaultValue={settings.bot_application_id || ""} /></div><div><label htmlFor="botChannelId">Channel ID</label><input id="botChannelId" name="botChannelId" inputMode="numeric" pattern="[0-9]{15,22}" defaultValue={settings.bot_channel_id || ""} /></div><div><label htmlFor="automaticQuestionType">Automatic question type</label><select id="automaticQuestionType" name="automaticQuestionType" defaultValue={settings.automatic_question_type || "both"}><option value="both">Both types</option><option value="open">Open answer only</option><option value="reaction">Reaction-based only</option></select></div></div>{inviteUrl && <a className="secondary invite-link" href={inviteUrl} target="_blank" rel="noreferrer">Add bot to a server</a>}</div>
          <div className="settings-group"><h3>Webhook (manual only)</h3><div><label htmlFor="webhook">Discord webhook URL</label><input id="webhook" name="webhook" type="password" placeholder={settings.has_webhook ? "Saved securely — enter a new URL to replace it" : "https://discord.com/api/webhooks/…"} autoComplete="off" /><p className="hint">The daily cron never uses the webhook.</p></div></div>
          <TemplateEditor initialOpenValue={settings.open_message_template || DEFAULT_TEMPLATE} initialReactionValue={settings.reaction_message_template || DEFAULT_TEMPLATE} initialRoleId={settings.mention_role_id || ""} initialNextNumber={Number(settings.next_number) || 1} />
          <details className="bot-setup"><summary>Bot setup instructions</summary><ol><li>Open the Discord Developer Portal and create a New Application.</li><li>Open Bot, create/reset the token, and paste it above. Never share the token.</li><li>Copy the Application ID from General Information and save these settings.</li><li>Click “Add bot to a server,” choose your server, and authorize it.</li><li>In Discord, enable Developer Mode under User Settings → Advanced. Right-click the target channel, choose Copy Channel ID, and paste it above.</li><li>Ensure the bot can View Channel, Send Messages, Read Message History, and Add Reactions in that channel.</li><li>If you use {"{mention-role}"}, make that role mentionable in Discord or separately grant the bot permission to mention roles.</li></ol></details>
          <div className="align-right"><button className="primary">Save settings</button></div>
        </form>
      </section>

      <section className="section-block"><div className="section-title"><h2>Recent sends</h2></div>{dispatches.length ? <div className="activity-list">{dispatches.map((item) => <div key={item.id}><span className={`activity-dot ${item.success ? "success" : "failed"}`} /><div><strong>{item.success ? "Sent" : "Failed"} · {item.transport} · {item.mode.replaceAll("_", " ")}</strong><p>{item.error || item.message}</p></div><time>{relativeDate(item.created_at)}</time></div>)}</div> : <div className="empty-state compact"><p>No sends yet.</p></div>}</section>
    </main>
  );
}
