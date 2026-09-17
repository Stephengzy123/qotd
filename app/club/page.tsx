import { postClubMessageAction, reviewClubPostAction } from "@/app/club/actions";
import { requireRole } from "@/lib/auth";
import { getMembership, listClubMembers, listClubPosts } from "@/lib/clubs";
import { getWebhookDetails } from "@/lib/webhook-details";
import { AppTopbar } from "@/components/app-topbar";
import { ClubComposer } from "@/components/club-composer";
import { ClubPostList } from "@/components/club-post-list";
import { Notice } from "@/components/notice";
import { PendingButton } from "@/components/pending-button";

export default async function ClubPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const session = await requireRole("club_leader");
  const params = await searchParams;
  const membership = session.accountId ? await getMembership(session.accountId) : null;

  if (!membership) {
    return (
      <main className="app-shell">
        <AppTopbar mode="leader" username={session.username} />
        <Notice ok={params.ok} error={params.error} />
        <div className="empty-state tall"><h1>You’re not in a club yet</h1><p>An admin needs to add your account to a club before you can post. Ask them to open Admin → Clubs.</p></div>
      </main>
    );
  }

  const { club, club_role: role } = membership;
  const isLeader = role === "leader";
  const [members, pending, history, profile] = await Promise.all([
    listClubMembers(club.id),
    listClubPosts(club.id, { status: "pending", limit: 50 }),
    listClubPosts(club.id, { limit: 30 }),
    getWebhookDetails(club.webhook_url_encrypted),
  ]);
  const connected = Boolean(club.webhook_url_encrypted);
  const mine = pending.filter((post) => post.username === session.username);
  const recent = history.filter((post) => post.status !== "pending");
  const leaders = members.filter((member) => member.club_role === "leader");
  const assistants = members.filter((member) => member.club_role === "assistant");

  return (
    <main className="app-shell club-shell">
      <AppTopbar mode={isLeader ? "leader" : "assistant"} detail={club.name} username={session.username} links={[{ href: "/live", label: "Live feed" }]} />
      <Notice ok={params.ok} error={params.error} />

      <section className="club-hero">
        <div className="club-identity">
          {profile.status === "connected" && profile.avatarUrl ? <img className="club-avatar" src={profile.avatarUrl} width={56} height={56} alt="" referrerPolicy="no-referrer" /> : <span className="club-avatar club-avatar-fallback" aria-hidden="true">{club.name.slice(0, 1).toUpperCase()}</span>}
          <div>
            <h1>{club.name}</h1>
            <p className="club-meta">
              <span className={`status ${connected ? "ready" : "pending"}`}>{connected ? (profile.status === "connected" ? `Posting as ${profile.name}` : "Channel connected") : "Channel not connected"}</span>
              <span className="count-badge">{leaders.length} {leaders.length === 1 ? "leader" : "leaders"}</span>
              {assistants.length > 0 && <span className="count-badge">{assistants.length} {assistants.length === 1 ? "assistant" : "assistants"}</span>}
              {profile.status === "connected" && profile.channelUrl && <a href={profile.channelUrl} target="_blank" rel="noreferrer" className="secondary small">Open channel ↗</a>}
            </p>
          </div>
        </div>
        <div className="club-stats">
          <div><strong>{recent.filter((post) => post.status === "sent").length}</strong><span>posted recently</span></div>
          <div className={pending.length ? "tone-pending" : ""}><strong>{pending.length}</strong><span>awaiting approval</span></div>
        </div>
      </section>

      <section className="section-block">
        <div className="section-title"><h2>{isLeader ? "New post" : "Draft a post"}</h2>{!isLeader && <span className="hint">Your leader approves before it goes out</span>}</div>
        <form action={postClubMessageAction} className="panel club-composer-panel"><ClubComposer connected={connected} mode={isLeader ? "post" : "submit"} clubName={club.name} channelName={profile.status === "connected" ? profile.name : null} /></form>
      </section>

      {isLeader ? <section className="section-block"><div className="section-title"><h2>Waiting for your approval</h2><span className={`count-badge${pending.length ? " attention" : ""}`}>{pending.length}</span></div>
        <ClubPostList posts={pending} empty="Nothing waiting. Assistant drafts show up here for you to approve." controls={(post) => <form action={reviewClubPostAction} className="row-buttons"><input type="hidden" name="postId" value={post.id} /><PendingButton name="decision" value="reject" className="danger" pendingText="Rejecting…">Reject</PendingButton><PendingButton name="decision" value="approve" className="primary" pendingText="Posting…">Approve & post</PendingButton></form>} />
      </section> : mine.length > 0 && <section className="section-block"><div className="section-title"><h2>Your drafts waiting on a leader</h2><span className="count-badge">{mine.length}</span></div><ClubPostList posts={mine} empty="" /></section>}

      <section className="section-block"><div className="section-title"><h2>History</h2><span className="count-badge">{recent.length}</span></div>
        <ClubPostList posts={recent} empty="Nothing posted yet. Your first post will show up here with its delivery status." />
      </section>
    </main>
  );
}
