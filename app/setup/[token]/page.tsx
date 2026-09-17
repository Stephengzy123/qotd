import { completeSetupAction } from "@/app/setup/actions";
import { findSetupToken, ROLE_LABELS } from "@/lib/accounts";
import { Notice } from "@/components/notice";
import { PendingButton } from "@/components/pending-button";

export default async function SetupPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params;
  const query = await searchParams;
  const pending = await findSetupToken(token);
  if (!pending) {
    return (
      <main className="login-shell">
        <section className="login-card">
          <h1>This link isn’t valid</h1>
          <p className="hint">It may have expired, already been used, or been replaced by a newer link. Ask your admin to send a new one.</p>
          <p><a href="/login">Go to sign in</a></p>
        </section>
      </main>
    );
  }
  return (
    <main className="login-shell">
      <section className="login-card">
        <h1>Welcome, {pending.username}</h1>
        <p className="hint">Choose the password for your {ROLE_LABELS[pending.role].toLowerCase()} account. You’ll be signed in right after.</p>
        <Notice error={query.error} />
        <form action={completeSetupAction} className="stack">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="username" value={pending.username} autoComplete="username" />
          <div><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={72} required autoFocus /><p className="hint">At least 12 characters.</p></div>
          <div><label htmlFor="confirm">Confirm password</label><input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={12} maxLength={72} required /></div>
          <PendingButton type="submit" className="primary" pendingText="Saving…">Set password and sign in</PendingButton>
        </form>
      </section>
    </main>
  );
}
