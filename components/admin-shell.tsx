import type { ReactNode } from "react";
import { logoutAction } from "@/app/actions";
import { Notice } from "@/components/notice";
import { PendingButton } from "@/components/pending-button";
import { ScheduledDeliveryCheck } from "@/components/scheduled-delivery-check";

export type AdminPage = "overview" | "pending" | "approved" | "sends" | "settings" | "accounts" | "logs";

export const ADMIN_PAGES: { key: AdminPage; href: string; label: string }[] = [
  { key: "overview", href: "/admin", label: "Overview" },
  { key: "pending", href: "/admin/pending", label: "Pending" },
  { key: "approved", href: "/admin/approved", label: "Approved" },
  { key: "sends", href: "/admin/sends", label: "Sends" },
  { key: "settings", href: "/admin/settings", label: "Settings" },
  { key: "accounts", href: "/admin/accounts", label: "Accounts" },
  { key: "logs", href: "/admin/logs", label: "Logs" },
];

type AdminShellProps = {
  page: AdminPage;
  username: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  notice?: { ok?: string; error?: string };
  children: ReactNode;
};

// Shared chrome for every admin page: nav, heading, notices, delivery check.
export function AdminShell({ page, username, title, description, actions, notice, children }: AdminShellProps) {
  return (
    <main className="app-shell">
      <ScheduledDeliveryCheck />
      <header className="topbar">
        <strong>Announcement admin</strong>
        <nav className="admin-navigation" aria-label="Admin">
          {ADMIN_PAGES.map((item) => <a key={item.key} href={item.href} className="nav-button" aria-current={item.key === page ? "page" : undefined}>{item.label}</a>)}
          <a href="/live" className="nav-button">Live feed</a>
        </nav>
        <div className="account"><span>{username}</span><form action={logoutAction}><PendingButton className="text-button" pendingText="Signing out…">Sign out</PendingButton></form></div>
      </header>
      <section className="admin-heading"><div><h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="heading-actions">{actions}</div>}</section>
      {notice && <Notice ok={notice.ok} error={notice.error} />}
      {children}
    </main>
  );
}
