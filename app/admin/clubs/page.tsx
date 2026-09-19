import { createClubAction } from "@/app/admin/clubs/actions";
import { requireRole } from "@/lib/auth";
import { listClubs } from "@/lib/clubs";
import { AdminShell } from "@/components/admin-shell";
import { PendingButton } from "@/components/pending-button";

export default async function ClubsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const session = await requireRole("admin");
  const params = await searchParams;
  const clubs = await listClubs();
  const unconnected = clubs.filter((club) => !club.webhook_url_encrypted).length;

  return (
    <AdminShell page="clubs" username={session.username} title="Clubs" description="Only club managers and admins can post." notice={params}
      actions={<form action={createClubAction} className="inline-create"><label htmlFor="new-club" className="sr-only">New club name</label><input id="new-club" name="name" placeholder="New club name" minLength={2} maxLength={80} required /><PendingButton className="primary" pendingText="Creating…">＋ Create club</PendingButton></form>}>
      <section className="stats" aria-label="Club summary"><div><span>Clubs</span><strong>{clubs.length}</strong></div><div className={unconnected ? "tone-pending" : "tone-ok"}><span>Channels not connected</span><strong>{unconnected}</strong></div></section>
      <section className="section-block">
        {clubs.length ? <div className="feature-grid club-grid">{clubs.map((club) => <a key={club.id} href={`/admin/clubs/${club.id}`} className="feature-card">
          <div className="feature-card-top"><h3>{club.name}</h3></div>
          <p>{club.leaders} {club.leaders === 1 ? "leader" : "leaders"} · {club.sent_week} posted this week</p>
          <span className={`status ${club.webhook_url_encrypted ? "ready" : "pending"}`}>{club.webhook_url_encrypted ? "Channel connected" : "Connect channel"}</span>
          <span className="feature-card-cta">Open club →</span>
        </a>)}</div> : <div className="empty-state"><p>No clubs yet. Create one above, then add a leader from Accounts.</p></div>}
      </section>
    </AdminShell>
  );
}
