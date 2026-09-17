import { getSession, homePath } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getMembership } from "@/lib/clubs";
import { listPasskeys } from "@/lib/passkeys";
import { AppTopbar } from "@/components/app-topbar";
import { ModeBadge, type Mode } from "@/components/mode-badge";
import { Notice } from "@/components/notice";
import { PasskeyManager } from "@/components/passkey-manager";

// Any signed-in person's own page: who they are and their passkeys.
export default async function AccountSettingsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const params = await searchParams;
  const membership = session.accountId && session.role === "club_leader" ? await getMembership(session.accountId) : null;
  const mode: Mode = session.role === "admin" ? "admin" : session.role === "contributor" ? "contributor" : membership?.club_role === "assistant" ? "assistant" : "leader";
  const passkeys = session.accountId ? await listPasskeys(session.accountId) : [];
  const home = homePath(session.role);

  return (
    <main className="app-shell">
      <AppTopbar mode={mode} username={session.username} links={[{ href: home, label: session.role === "admin" ? "Admin" : session.role === "contributor" ? "Announcements" : "Club" }, { href: "/live", label: "Live feed" }, { href: "/account", label: "Your account", current: true }]} />
      <Notice ok={params.ok} error={params.error} />
      <section className="admin-heading"><div><h1>{session.username}</h1><p><ModeBadge mode={mode} />{membership && <> · {membership.club.name}</>}</p></div></section>
      <section className="section-block"><div className="section-title"><h2>Passkeys</h2><span className="count-badge">{passkeys.length}</span></div>
        {session.accountId
          ? <PasskeyManager passkeys={passkeys.map((key) => ({ ...key, created_at: key.created_at.toISOString(), last_used_at: key.last_used_at?.toISOString() ?? null }))} />
          : <div className="panel settings-form"><p className="hint">This is a built-in login configured in environment variables, so passkeys aren’t available for it. Accounts created in the app can add passkeys here.</p></div>}
      </section>
    </main>
  );
}
