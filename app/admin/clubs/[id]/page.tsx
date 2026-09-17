import { Suspense } from "react";
import { notFound } from "next/navigation";
import { deleteClubAction, postAsClubAction, renameClubAction, reviewClubPostAdminAction, saveClubWebhookAction, setMemberRoleAction } from "@/app/admin/clubs/actions";
import { requireRole } from "@/lib/auth";
import { CLUB_ROLE_LABELS, getClub, listClubMembers, listClubPosts } from "@/lib/clubs";
import { getWebhookDetails } from "@/lib/webhook-details";
import { AdminShell } from "@/components/admin-shell";
import { ClubComposer } from "@/components/club-composer";
import { ClubPostList } from "@/components/club-post-list";
import { ComposerDialog } from "@/components/composer-dialog";
import { PendingButton } from "@/components/pending-button";
import { WebhookProfile } from "@/components/webhook-profile";

export default async function ClubAdminPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const session = await requireRole("admin");
  const { id } = await params;
  const query = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const club = await getClub(id);
  if (!club) notFound();
  const [members, pending, history, profile] = await Promise.all([listClubMembers(club.id), listClubPosts(club.id, { status: "pending", limit: 50 }), listClubPosts(club.id, { limit: 30 }), getWebhookDetails(club.webhook_url_encrypted)]);
  const connected = Boolean(club.webhook_url_encrypted);
  const recent = history.filter((post) => post.status !== "pending");
  const hasLeader = members.some((member) => member.club_role === "leader");

  return (
    <AdminShell page="clubs" username={session.username} title={club.name} notice={query}
      description={<><span className={`status ${connected ? "ready" : "pending"}`}>{connected ? "Channel connected" : "Channel not connected"}</span> · {members.length} {members.length === 1 ? "member" : "members"}{!hasLeader && " · no leader yet"}</>}
      actions={<><a href="/admin/clubs" className="secondary">← All clubs</a>
        <ComposerDialog buttonLabel={`Post as ${club.name}`} title={`Post to ${club.name}’s channel`} description="Sends immediately as the club’s webhook, logged under your name." className="primary">
          <form action={postAsClubAction} className="composer-form"><input type="hidden" name="id" value={club.id} /><ClubComposer connected={connected} mode="post" clubName={club.name} channelName={profile.status === "connected" ? profile.name : null} /></form>
        </ComposerDialog></>}>

      {pending.length > 0 && <section className="section-block"><div className="section-title"><h2>Awaiting a leader’s approval</h2><span className="count-badge attention">{pending.length}</span></div>
        <p className="hint">Normally the club leader handles these. You can step in.</p>
        <ClubPostList posts={pending} empty="" controls={(post) => <form action={reviewClubPostAdminAction} className="row-buttons"><input type="hidden" name="clubId" value={club.id} /><input type="hidden" name="postId" value={post.id} /><PendingButton name="decision" value="reject" className="danger" pendingText="Rejecting…">Reject</PendingButton><PendingButton name="decision" value="approve" className="primary" pendingText="Posting…">Approve & post</PendingButton></form>} />
      </section>}

      <div className="two-col">
        <section className="section-block"><div className="section-title"><h2>Channel</h2><span className={`status ${connected ? "ready" : "pending"}`}>{connected ? "Connected" : "Setup needed"}</span></div>
          <form action={saveClubWebhookAction} className="panel settings-form"><input type="hidden" name="id" value={club.id} />
            <p className="hint">Every post from this club goes through this webhook, so it only ever reaches one channel. In Discord: channel settings → Integrations → Webhooks → New webhook → Copy URL.</p>
            <div><label htmlFor="webhook">Webhook URL</label><input id="webhook" name="webhook" type="password" placeholder={connected ? "Saved securely — paste a new URL to replace it" : "https://discord.com/api/webhooks/…"} autoComplete="off" required /></div>
            <Suspense fallback={<p className="hint" role="status">Checking the saved webhook…</p>}><WebhookProfile encryptedUrl={club.webhook_url_encrypted} /></Suspense>
            <div className="align-right"><PendingButton className="primary" pendingText="Saving…">{connected ? "Replace webhook" : "Connect channel"}</PendingButton></div>
          </form>
        </section>

        <section className="section-block"><div className="section-title"><h2>Members</h2><a href="/admin/accounts" className="secondary small">Add from Accounts</a></div>
          {members.length ? <div className="activity-list">{members.map((member) => <div key={member.account_id}><span className={`activity-dot ${member.has_password ? "success" : "pending"}`} /><div><strong><a href={`/admin/accounts/${member.account_id}`} className="plain-link">{member.username}</a></strong><p>{CLUB_ROLE_LABELS[member.club_role]}{member.has_password ? "" : " · awaiting password setup"}</p></div>
            <form action={setMemberRoleAction} className="row-buttons"><input type="hidden" name="clubId" value={club.id} /><input type="hidden" name="accountId" value={member.account_id} />
              <label className="sr-only" htmlFor={`role-${member.account_id}`}>Permission</label><select id={`role-${member.account_id}`} name="clubRole" defaultValue={member.club_role} className="compact-select"><option value="leader">Leader</option><option value="assistant">Assistant</option></select>
              <PendingButton className="secondary" pendingText="Saving…">Save</PendingButton><PendingButton name="intent" value="remove" className="danger" pendingText="Removing…" confirmMessage={`Remove ${member.username} from ${club.name}?`}>Remove</PendingButton>
            </form></div>)}</div> : <div className="empty-state compact"><p>No members yet. Create a club leader account and pick this club.</p></div>}
          <p className="hint">Leaders post directly and approve assistants’ drafts. An assistant needs at least one leader in the club.</p>
        </section>
      </div>

      <section className="section-block"><div className="section-title"><h2>History</h2><span className="count-badge">{recent.length}</span></div>
        <ClubPostList posts={recent} empty="Nothing posted to this club yet." />
      </section>

      <section className="section-block"><div className="section-title"><h2>Manage</h2></div>
        <div className="panel settings-form">
          <form action={renameClubAction} className="row-buttons"><input type="hidden" name="id" value={club.id} /><label htmlFor="club-name" className="sr-only">Club name</label><input id="club-name" name="name" defaultValue={club.name} minLength={2} maxLength={80} required /><PendingButton className="secondary" pendingText="Saving…">Rename</PendingButton></form>
          <hr />
          <form action={deleteClubAction} className="form-footer"><input type="hidden" name="id" value={club.id} /><p>Deleting removes the channel connection and memberships. Member accounts and post history stay.</p><PendingButton className="danger" pendingText="Deleting…" confirmMessage={`Delete “${club.name}”? This can’t be undone.`}>Delete club</PendingButton></form>
        </div>
      </section>
    </AdminShell>
  );
}
