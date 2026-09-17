import { deleteAccountAction } from "@/app/actions";
import { listAccounts, ROLE_LABELS } from "@/lib/accounts";
import { requireRole } from "@/lib/auth";
import { relativeDate } from "@/lib/admin-data";
import { AdminShell } from "@/components/admin-shell";
import { CreateAccountDialog } from "@/components/create-account-dialog";
import { PendingButton } from "@/components/pending-button";

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const session = await requireRole("admin");
  const params = await searchParams;
  const accounts = await listAccounts();
  const envAccounts = [
    { username: process.env.ADMIN_USERNAME, role: "Admin" },
    { username: process.env.CONTRIBUTOR_USERNAME, role: "Contributor" },
  ].filter((item): item is { username: string; role: string } => Boolean(item.username));
  const groups = (["club_leader", "contributor", "admin"] as const).map((role) => ({ role, label: ROLE_LABELS[role], items: accounts.filter((account) => account.role === role) }));

  return (
    <AdminShell page="accounts" username={session.username} title="Accounts" description="Accounts are created without a password. Each gets a setup link to share; the person picks their password there. Club leaders also need their channel webhook connected on their account page." notice={params} actions={<CreateAccountDialog />}>
      {groups.map((group) => <section key={group.role} className="section-block"><div className="section-title"><h2>{group.label}s</h2><span className="count-badge">{group.items.length}</span></div>
        {group.items.length ? <div className="activity-list">{group.items.map((account) => <div key={account.id} className="account-row"><span className={`activity-dot ${account.has_password ? "success" : "pending"}`} /><div><strong>{account.username}</strong><p>{account.created_by ? `Created by ${account.created_by} · ` : ""}added {relativeDate(account.created_at)}{account.has_password ? "" : " · awaiting password setup"}</p></div>
          <div className="recent-actions"><a href={`/admin/accounts/${account.id}`} className="secondary">{account.role === "club_leader" ? "Manage & channel" : "Manage"}</a><form action={deleteAccountAction}><input type="hidden" name="id" value={account.id} /><PendingButton className="danger" pendingText="Deleting…" confirmMessage={`Delete “${account.username}”?`}>Delete</PendingButton></form></div></div>)}</div> : <div className="empty-state compact"><p>No {group.label.toLowerCase()} accounts yet.</p></div>}
      </section>)}
      <section className="section-block"><div className="section-title"><h2>Built in</h2><span className="count-badge">{envAccounts.length}</span></div>
        <div className="activity-list">{envAccounts.map((account) => <div key={account.username}><span className="activity-dot success" /><div><strong>{account.username}</strong><p>{account.role} · configured in environment variables</p></div><div className="recent-actions"><span className="hint">Cannot be changed here</span></div></div>)}</div>
      </section>
    </AdminShell>
  );
}
