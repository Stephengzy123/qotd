import { deleteAccountAction } from "@/app/actions";
import { listAccounts, ROLE_LABELS } from "@/lib/accounts";
import { requireRole } from "@/lib/auth";
import { relativeDate } from "@/lib/admin-data";
import { CLUB_ROLE_LABELS, listClubs, type ClubRole } from "@/lib/clubs";
import { dbReady } from "@/lib/db";
import { AdminShell } from "@/components/admin-shell";
import { CreateAccountDialog } from "@/components/create-account-dialog";
import { PendingButton } from "@/components/pending-button";

type MemberRow = { account_id: string; club_id: string; club_name: string; club_role: ClubRole };

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const session = await requireRole("admin");
  const params = await searchParams;
  const sql = await dbReady();
  const [accounts, clubs, memberRows] = await Promise.all([listAccounts(), listClubs(), sql<MemberRow[]>`select m.account_id, m.club_id, c.name as club_name, m.club_role from club_members m join clubs c on c.id = m.club_id`]);
  const membership = new Map(memberRows.map((row) => [row.account_id, row]));
  const envAccounts = [
    { username: process.env.ADMIN_USERNAME, role: "Admin" },
    { username: process.env.CONTRIBUTOR_USERNAME, role: "Contributor" },
  ].filter((item): item is { username: string; role: string } => Boolean(item.username));
  const awaiting = accounts.filter((account) => !account.has_password).length;
  const groups = (["club_leader", "contributor", "admin"] as const).map((role) => ({ role, label: role === "club_leader" ? "Club members" : `${ROLE_LABELS[role]}s`, items: accounts.filter((account) => account.role === role) }));

  return (
    <AdminShell page="accounts" username={session.username} title="Accounts" description="Accounts start without a password. Share the setup link from each account page and the person picks their own — or adds a passkey afterwards." notice={params}
      actions={<CreateAccountDialog clubs={clubs.map((club) => ({ id: club.id, name: club.name, hasLeader: club.leaders > 0 }))} />}>
      <section className="stats" aria-label="Account summary"><div><span>Accounts</span><strong>{accounts.length + envAccounts.length}</strong></div><div className={awaiting ? "tone-pending" : "tone-ok"}><span>Awaiting password setup</span><strong>{awaiting}</strong></div><div><span>Clubs</span><strong>{clubs.length}</strong></div></section>
      {groups.map((group) => <section key={group.role} className="section-block"><div className="section-title"><h2>{group.label}</h2><span className="count-badge">{group.items.length}</span></div>
        {group.items.length ? <div className="activity-list">{group.items.map((account) => { const member = membership.get(account.id); return <div key={account.id} className="account-row"><span className={`activity-dot ${account.has_password ? "success" : "pending"}`} /><div><strong><a href={`/admin/accounts/${account.id}`} className="plain-link">{account.username}</a></strong><p>{member ? <><span className={`mode-badge ${member.club_role === "leader" ? "mode-leader" : "mode-assistant"}`}>{CLUB_ROLE_LABELS[member.club_role]}</span> <a href={`/admin/clubs/${member.club_id}`} className="plain-link">{member.club_name}</a> · </> : group.role === "club_leader" ? <><span className="status pending">No club</span> · </> : null}{account.created_by ? `created by ${account.created_by} · ` : ""}added {relativeDate(account.created_at)}{account.has_password ? "" : " · awaiting password setup"}</p></div>
          <div className="recent-actions"><div className="row-buttons"><a href={`/admin/accounts/${account.id}`} className="secondary">Manage</a><form action={deleteAccountAction}><input type="hidden" name="id" value={account.id} /><PendingButton className="danger" pendingText="Deleting…" confirmMessage={`Delete “${account.username}”?`}>Delete</PendingButton></form></div></div></div>; })}</div> : <div className="empty-state compact"><p>No {group.label.toLowerCase()} yet.</p></div>}
      </section>)}
      <section className="section-block"><div className="section-title"><h2>Built in</h2><span className="count-badge">{envAccounts.length}</span></div>
        <div className="activity-list">{envAccounts.map((account) => <div key={account.username}><span className="activity-dot success" /><div><strong>{account.username}</strong><p>{account.role} · configured in environment variables</p></div><div className="recent-actions"><span className="hint">Cannot be changed here</span></div></div>)}</div>
      </section>
    </AdminShell>
  );
}
