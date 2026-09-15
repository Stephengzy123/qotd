import { requireRole } from "@/lib/auth";
import { dbReady } from "@/lib/db";
import { Notice } from "@/components/notice";
import { PendingButton } from "@/components/pending-button";
import { addUserAction } from "./actions";

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireRole("admin");
  const params = await searchParams;
  const sql = await dbReady();
  const users = await sql<{ id: string; username: string }[]>`select id, username from app_users order by lower(username)`;
  return <main className="app-shell">
    <header className="topbar"><strong>Manage users</strong><a href="/admin">Back to admin</a></header>
    <Notice {...params} />
    <section className="section-block"><h1>Contributor accounts</h1><p>Create individual logins for people who submit announcements. These accounts cannot access admin controls.</p>
      <form action={addUserAction} className="panel contribution-form">
        <div><label htmlFor="new-username">Username</label><input id="new-username" name="username" autoComplete="off" minLength={3} maxLength={40} pattern="[a-zA-Z0-9_.\-]+" required /></div>
        <div><label htmlFor="new-password">Password</label><input id="new-password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={72} required /><p className="hint">At least 12 characters. Passwords are stored as hashes and cannot be viewed later.</p></div>
        <div className="align-right"><PendingButton pendingText="Creating…" className="primary">Add user</PendingButton></div>
      </form>
    </section>
    <section className="section-block"><h2>Created accounts ({users.length})</h2>{users.length ? <ul>{users.map(user => <li key={user.id}>{user.username} <span className="muted">· Contributor</span></li>)}</ul> : <p>No individual accounts created yet.</p>}<p className="hint">Existing configured administrator and shared contributor logins continue to work.</p></section>
  </main>;
}
