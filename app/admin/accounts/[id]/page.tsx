import { Suspense } from "react";
import { notFound } from "next/navigation";
import { deleteAccountAction, regenerateSetupLinkAction, saveClubWebhookAction, updateAccountAction } from "@/app/actions";
import { AdminShell } from "@/components/admin-shell";
import { getAccount, getPendingSetupLink, ROLE_LABELS, ROLES } from "@/lib/accounts";
import { requireRole } from "@/lib/auth";
import { getClubChannel, listClubPosts } from "@/lib/clubs";
import { requestOrigin } from "@/lib/request-origin";
import { relativeDate } from "@/lib/admin-data";
import { CopyButton } from "@/components/copy-button";
import { DiscordMarkdown } from "@/components/discord-preview";
import { MessagePreview } from "@/components/message-preview";
import { PendingButton } from "@/components/pending-button";
import { WebhookProfile } from "@/components/webhook-profile";

export default async function AccountPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const session = await requireRole("admin");
  const { id } = await params;
  const query = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const account = await getAccount(id);
  if (!account) notFound();
  const isClub = account.role === "club_leader";
  const [setupLink, origin, channel, posts] = await Promise.all([
    getPendingSetupLink(account.id),
    requestOrigin(),
    isClub ? getClubChannel(account.id) : null,
    isClub ? listClubPosts(account.id, 10) : [],
  ]);
  const setupUrl = setupLink ? `${origin}/setup/${setupLink.token}` : null;
  const connected = Boolean(channel?.webhook_url_encrypted);

  return (
    <AdminShell page="accounts" username={session.username} title={account.username} notice={query}
      description={<><span className="count-badge">{ROLE_LABELS[account.role]}</span> · added {relativeDate(account.created_at)}{account.created_by ? ` by ${account.created_by}` : ""} · <span className={`status ${account.has_password ? "ready" : "pending"}`}>{account.has_password ? "Password set" : "Awaiting password setup"}</span></>}
      actions={<a href="/admin/accounts" className="secondary">← All accounts</a>}>
      {isClub && <section id="channel" className="section-block"><div className="section-title"><h2>Club channel</h2><span className={`status ${connected ? "ready" : "pending"}`}>{connected ? "Connected" : "Setup needed"}</span></div>
        <form action={saveClubWebhookAction} className="panel settings-form"><input type="hidden" name="id" value={account.id} />
          <p className="hint">Everything this club leader posts goes to this webhook, so it only ever reaches this one channel. In Discord: channel settings → Integrations → Webhooks → New webhook → Copy webhook URL.</p>
          <div><label htmlFor="webhook">Channel webhook URL</label><input id="webhook" name="webhook" type="password" placeholder={connected ? "Saved securely — enter a new URL to replace it" : "https://discord.com/api/webhooks/…"} autoComplete="off" required={!connected} /><p className="hint">{connected ? "Leave blank to keep the saved webhook." : "Stored encrypted. Only the admin page can see which channel it points to."}</p></div>
          <Suspense fallback={<p className="hint" role="status">Loading saved webhook…</p>}><WebhookProfile encryptedUrl={channel?.webhook_url_encrypted} /></Suspense>
          <div className="align-right"><PendingButton className="primary" pendingText="Saving…">{connected ? "Replace webhook" : "Connect channel"}</PendingButton></div>
        </form>
      </section>}

      <section id="setup-link" className="section-block"><div className="section-title"><h2>Password setup link</h2>{setupLink && <span className="status pending">Active · expires {relativeDate(setupLink.expires_at)}</span>}</div>
        <div className="panel settings-form">
          {setupUrl ? <>
            <p className="hint">Send this link to {account.username} privately. Whoever opens it chooses the password for this account, and the link stops working once it’s used.</p>
            <div className="setup-link-row"><input readOnly value={setupUrl} aria-label="Setup link" /><CopyButton value={setupUrl} /></div>
          </> : <p className="hint">{account.has_password ? "This account has a password. Generate a new link to let them reset it — their current password keeps working until the link is used." : "No active setup link. Generate one and send it to them."}</p>}
          <form action={regenerateSetupLinkAction} className="align-right"><input type="hidden" name="id" value={account.id} /><PendingButton className="secondary" pendingText="Generating…" confirmMessage={setupUrl ? "Generate a new link? The current one will stop working." : undefined}>{setupUrl ? "Generate a new link" : account.has_password ? "Generate reset link" : "Generate setup link"}</PendingButton></form>
        </div>
      </section>

      {isClub && <section id="posts" className="section-block"><div className="section-title"><h2>Recent posts</h2><span className="count-badge">{posts.length}</span></div>
        {posts.length ? <div className="activity-list">{posts.map((post) => <div key={post.id}><span className={`activity-dot ${post.success ? "success" : "failed"}`} /><div><strong>{post.success ? "Posted" : "Failed"}</strong>{post.error && <p className="send-error">{post.error}</p>}<p className="message-excerpt">{post.message}</p></div><div className="recent-actions"><time>{relativeDate(post.created_at)}</time><MessagePreview title={post.success ? "Posted message" : "Attempted message"}><div className="discord-preview"><DiscordMarkdown value={post.message} /></div></MessagePreview></div></div>)}</div> : <div className="empty-state compact"><p>Nothing posted yet.</p></div>}
      </section>}

      <section id="manage" className="section-block"><div className="section-title"><h2>Manage</h2></div>
        <div className="panel settings-form">
          <form action={updateAccountAction} className="account-manage"><input type="hidden" name="id" value={account.id} />
            <label htmlFor="role">Account type</label><select id="role" name="role" defaultValue={account.role}>{ROLES.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}</select>
            <PendingButton className="secondary" pendingText="Saving…">Save</PendingButton>
          </form>
          {isClub && <p className="hint">Changing the type away from club leader keeps the saved webhook but hides the club posting page.</p>}
          <hr />
          <form action={deleteAccountAction} className="form-footer"><input type="hidden" name="id" value={account.id} /><p>Deleting removes the account, its setup links, and its channel connection. Past posts stay in the log.</p><PendingButton className="danger" pendingText="Deleting…" confirmMessage={`Delete “${account.username}”? This can’t be undone.`}>Delete account</PendingButton></form>
        </div>
      </section>
    </AdminShell>
  );
}
