import { notFound } from "next/navigation";
import { deleteAccountAction, regenerateSetupLinkAction, updateAccountAction } from "@/app/actions";
import { getAccount, getPendingSetupLink, ROLE_LABELS, ROLES } from "@/lib/accounts";
import { requireRole } from "@/lib/auth";
import { CLUB_ROLE_LABELS, getMembership } from "@/lib/clubs";
import { listPasskeys } from "@/lib/passkeys";
import { relativeDate } from "@/lib/admin-data";
import { requestOrigin } from "@/lib/request-origin";
import { AdminShell } from "@/components/admin-shell";
import { CopyButton } from "@/components/copy-button";
import { PendingButton } from "@/components/pending-button";

export default async function AccountPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const session = await requireRole("admin");
  const { id } = await params;
  const query = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const account = await getAccount(id);
  if (!account) notFound();
  const [setupLink, origin, membership, passkeys] = await Promise.all([getPendingSetupLink(account.id), requestOrigin(), account.role === "club_leader" ? getMembership(account.id) : null, listPasskeys(account.id)]);
  const setupUrl = setupLink ? `${origin}/setup/${setupLink.token}` : null;

  return (
    <AdminShell page="accounts" username={session.username} title={account.username} notice={query}
      description={<><span className="count-badge">{membership ? CLUB_ROLE_LABELS[membership.club_role] : ROLE_LABELS[account.role]}</span>{membership && <> of <a href={`/admin/clubs/${membership.club.id}`} className="plain-link"><strong>{membership.club.name}</strong></a></>} · added {relativeDate(account.created_at)}{account.created_by ? ` by ${account.created_by}` : ""} · <span className={`status ${account.has_password ? "ready" : "pending"}`}>{account.has_password ? "Password set" : "Awaiting password setup"}</span>{passkeys.length > 0 && <> · <span className="status ready">{passkeys.length} {passkeys.length === 1 ? "passkey" : "passkeys"}</span></>}</>}
      actions={<>{membership && <a href={`/admin/clubs/${membership.club.id}`} className="secondary">Open {membership.club.name}</a>}<a href="/admin/accounts" className="secondary">← All accounts</a></>}>

      {account.role === "club_leader" && !membership && <section className="section-block"><div className="panel settings-form"><p className="hint">This account isn’t in a club yet, so it can’t post anywhere. Add it from a club page under <a href="/admin/clubs" className="plain-link">Clubs</a>.</p></div></section>}

      <section id="setup-link" className="section-block"><div className="section-title"><h2>Password setup link</h2>{setupLink && <span className="status pending">Active · expires {relativeDate(setupLink.expires_at)}</span>}</div>
        <div className="panel settings-form">
          {setupUrl ? <>
            <p className="hint">Send this link to {account.username} privately. Whoever opens it chooses the password for this account, and the link stops working once it’s used.</p>
            <div className="setup-link-row"><input readOnly value={setupUrl} aria-label="Setup link" /><CopyButton value={setupUrl} /></div>
          </> : <p className="hint">{account.has_password ? "This account has a password. Generate a new link to let them reset it — their current password keeps working until the link is used." : "No active setup link. Generate one and send it to them."}</p>}
          <form action={regenerateSetupLinkAction} className="align-right"><input type="hidden" name="id" value={account.id} /><PendingButton className="secondary" pendingText="Generating…" confirmMessage={setupUrl ? "Generate a new link? The current one will stop working." : undefined}>{setupUrl ? "Generate a new link" : account.has_password ? "Generate reset link" : "Generate setup link"}</PendingButton></form>
        </div>
      </section>

      <section id="manage" className="section-block"><div className="section-title"><h2>Manage</h2></div>
        <div className="panel settings-form">
          <form action={updateAccountAction} className="row-buttons"><input type="hidden" name="id" value={account.id} />
            <label htmlFor="role">Account type</label><select id="role" name="role" defaultValue={account.role} className="compact-select">{ROLES.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}</select>
            <PendingButton className="secondary" pendingText="Saving…">Save</PendingButton>
          </form>
          {membership && <p className="hint">Changing the type away from club leader removes access to the club page; the club membership stays until you remove it from the club.</p>}
          <hr />
          <form action={deleteAccountAction} className="form-footer"><input type="hidden" name="id" value={account.id} /><p>Deleting removes the account, its setup links, passkeys, and club membership. Past posts stay in the log.</p><PendingButton className="danger" pendingText="Deleting…" confirmMessage={`Delete “${account.username}”? This can’t be undone.`}>Delete account</PendingButton></form>
        </div>
      </section>
    </AdminShell>
  );
}
