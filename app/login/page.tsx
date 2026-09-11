import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { loginAction } from "@/app/actions";
import { Notice } from "@/components/notice";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await getSession();
  if (session) redirect(session.role === "admin" ? "/admin" : "/contribute");
  const params = await searchParams;
  return (
    <main className="login-shell">
      <section className="login-card">
        <h1>Announcement login</h1>
        <Notice error={params.error} />
        <form action={loginAction} className="stack">
          <div><label htmlFor="username">Username</label><input id="username" name="username" autoComplete="username" required /></div>
          <div><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required /></div>
          <button type="submit" className="primary">Sign in</button>
        </form>
      </section>
    </main>
  );
}
