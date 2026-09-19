import { postClubMessageAction } from "@/app/club/actions";
import { requireRole } from "@/lib/auth";
import { getMembership, listClubMembers, listClubPosts } from "@/lib/clubs";
import { getWebhookDetails } from "@/lib/webhook-details";
import { AppTopbar } from "@/components/app-topbar";
import { ClubComposer } from "@/components/club-composer";
import { ClubPostList } from "@/components/club-post-list";
import { Notice } from "@/components/notice";
import { webhookOptions } from "@/lib/webhook-destinations";

export default async function ClubPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const session = await requireRole("club_leader");
  const params = await searchParams;
  const membership = session.accountId ? await getMembership(session.accountId) : null;

  if (!membership || membership.club_role !== "leader") {
    return (
      <main className="app-shell">
        <AppTopbar mode="leader" username={session.username} />
        <Notice ok={params.ok} error={params.error} />
        <div className="empty-state tall"><h1>Club posting is unavailable</h1><p>Only club managers and admins can post. Ask an admin to assign you as a manager.</p></div>
      </main>
    );
  }

  const { club } = membership;
  const [members, history, profile] = await Promise.all([
    listClubMembers(club.id),
    listClubPosts(club.id, { limit: 30 }),
    getWebhookDetails(club.webhook_url_encrypted),
  ]);
  const destinations = await webhookOptions(session.accountId!);
  const connected = destinations.length > 0;
  const recent = history.filter((post) => post.status !== "pending");
  const leaders = members.filter((member) => member.club_role === "leader");

  return (
    <main className="app-shell club-shell">
      <AppTopbar mode="leader" detail={club.name} username={session.username} links={[{ href: "/live", label: "Live feed" }]} />
      <Notice ok={params.ok} error={params.error} />

      <section className="club-hero">
        <div className="club-identity">
          {profile.status === "connected" && profile.avatarUrl ? <img className="club-avatar" src={profile.avatarUrl} width={56} height={56} alt="" referrerPolicy="no-referrer" /> : <span className="club-avatar club-avatar-fallback" aria-hidden="true">{club.name.slice(0, 1).toUpperCase()}</span>}
          <div>
            <h1>{club.name}</h1>
            <p className="club-meta">
              <span className={`status ${connected ? "ready" : "pending"}`}>{connected ? (profile.status === "connected" ? `Posting as ${profile.name}` : "Channel connected") : "Channel not connected"}</span>
              <span className="count-badge">{leaders.length} {leaders.length === 1 ? "leader" : "leaders"}</span>
              {profile.status === "connected" && profile.channelUrl && <a href={profile.channelUrl} target="_blank" rel="noreferrer" className="secondary small">Open channel ↗</a>}
            </p>
          </div>
        </div>
        <div className="club-stats">
          <div><strong>{recent.filter((post) => post.status === "sent").length}</strong><span>posted recently</span></div>
        </div>
      </section>

      <section className="section-block">
        <div className="section-title"><h2>New post</h2></div>
        <form action={postClubMessageAction} className="panel club-composer-panel"><ClubComposer connected={connected} mode="post" destinations={destinations} key={history[0]?.id ?? "new"} clubName={club.name} channelName={profile.status === "connected" ? profile.name : null} /></form>
      </section>


      <section className="section-block"><div className="section-title"><h2>History</h2><span className="count-badge">{recent.length}</span></div>
        <ClubPostList posts={recent} empty="Nothing posted yet. Your first post will show up here with its delivery status." />
      </section>
    </main>
  );
}
