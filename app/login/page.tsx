import { getSession, homePath } from "@/lib/auth";
import { redirect } from "next/navigation";
import { loginAction } from "@/app/actions";
import { Notice } from "@/components/notice";
import { PendingButton } from "@/components/pending-button";
import { PasskeyLogin } from "@/components/passkey-login";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await getSession();
  if (session) redirect(homePath(session.role));
  const params = await searchParams;
  return (
    <main className="login-shell">
      <section className="login-card">
        <h1>Sign in</h1><p>Announcements for the server — review, schedule, and post.</p>
        <Notice error={params.error} />
        <PasskeyLogin />
        <form action={loginAction} className="stack">
          <div><label htmlFor="username">Username</label><input id="username" name="username" autoComplete="username" required /></div>
          <div><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required /></div>
          <PendingButton type="submit" className="primary" pendingText="Signing in…">Sign in with password</PendingButton>
        </form>
        <p className="login-foot"><a href="/live" className="secondary">Just here to read? Open the live feed</a></p>
      </section>
    </main>
  );
}
