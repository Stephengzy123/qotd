import { Suspense } from "react";
import { logoutAction } from "@/app/actions";
import { postClubMessageAction } from "@/app/club/actions";
import { requireRole } from "@/lib/auth";
import { getClubChannel, listClubPosts } from "@/lib/clubs";
import { ClubComposer } from "@/components/club-composer";
import { ComposerDialog } from "@/components/composer-dialog";
import { DiscordMarkdown } from "@/components/discord-preview";
import { MessagePreview } from "@/components/message-preview";
import { Notice } from "@/components/notice";
import { PendingButton } from "@/components/pending-button";
import { WebhookProfile } from "@/components/webhook-profile";

function relativeDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles", timeZoneName: "short" }).format(date);
}

export default async function ClubPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const session = await requireRole("club_leader");
  const params = await searchParams;
  const accountId = session.accountId || "";
  const [channel, posts] = await Promise.all([getClubChannel(accountId), listClubPosts(accountId, 25)]);
  const connected = Boolean(channel?.webhook_url_encrypted);
  return (
    <main className="app-shell">
      <header className="topbar"><strong>Club channel</strong><div className="account"><span>{session.username}</span><form action={logoutAction}><PendingButton className="text-button" pendingText="Signing out…">Sign out</PendingButton></form></div></header>
      <section className="page-heading hero">
        <div><h1>Your club channel</h1><p>Whatever you post here lands in your club’s Discord channel right away — nothing else, nowhere else.</p></div>
        <ComposerDialog buttonLabel="＋ New post" title="New post" description="Posts immediately to your club channel." className="primary hero-button">
          <form action={postClubMessageAction} className="composer-form"><ClubComposer connected={connected} /></form>
        </ComposerDialog>
      </section>
      <Notice ok={params.ok} error={params.error} />

      <section className="section-block"><div className="section-title"><h2>Connected channel</h2><span className={`status ${connected ? "ready" : "pending"}`}>{connected ? "Connected" : "Not connected"}</span></div>
        <div className="panel settings-form">
          {connected
            ? <Suspense fallback={<p className="hint" role="status">Checking the channel…</p>}><WebhookProfile encryptedUrl={channel?.webhook_url_encrypted} /></Suspense>
            : <p className="hint">An admin still needs to connect your channel’s webhook. Until then, posts can’t be sent.</p>}
        </div>
      </section>

      <section className="section-block"><div className="section-title"><h2>Your posts</h2><span className="count-badge">{posts.length}</span></div>
        {posts.length ? <div className="activity-list">{posts.map((post) => <div key={post.id}><span className={`activity-dot ${post.success ? "success" : "failed"}`} /><div><strong>{post.success ? "Posted" : "Failed"}</strong>{post.error && <p className="send-error">{post.error}</p>}<p className="message-excerpt">{post.message}</p></div><div className="recent-actions"><time>{relativeDate(post.created_at)}</time><MessagePreview title={post.success ? "Posted message" : "Attempted message"}><div className="discord-preview"><DiscordMarkdown value={post.message} /></div></MessagePreview></div></div>)}</div> : <div className="empty-state compact"><p>You haven’t posted anything yet.</p></div>}
      </section>
    </main>
  );
}
