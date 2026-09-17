import type { ReactNode } from "react";
import { logoutAction } from "@/app/actions";
import { queueCounts } from "@/lib/admin-data";
import { countPendingClubPosts } from "@/lib/clubs";
import { AdminRail } from "@/components/admin-rail";
import { Notice } from "@/components/notice";
import { PendingButton } from "@/components/pending-button";
import { ScheduledDeliveryCheck } from "@/components/scheduled-delivery-check";

export type AdminPage = "overview" | "pending" | "approved" | "sends" | "clubs" | "settings" | "accounts" | "logs";

export const ADMIN_PAGES: { key: AdminPage; href: string; label: string }[] = [
  { key: "overview", href: "/admin", label: "Overview" },
  { key: "pending", href: "/admin/pending", label: "Pending" },
  { key: "approved", href: "/admin/approved", label: "Approved" },
  { key: "sends", href: "/admin/sends", label: "Sends" },
  { key: "clubs", href: "/admin/clubs", label: "Clubs" },
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

// Shared chrome for every admin page: rail navigation with live queue counts,
// page heading, notices, and the scheduled-delivery check.
export async function AdminShell({ page, username, title, description, actions, notice, children }: AdminShellProps) {
  const [counts, clubPending] = await Promise.all([queueCounts(), countPendingClubPosts()]);
  const badges: Partial<Record<AdminPage, { count: number; attention?: boolean }>> = {
    pending: { count: counts.pending, attention: counts.pending > 0 },
    approved: { count: counts.approved },
    sends: { count: counts.failedWeek, attention: counts.failedWeek > 0 },
    clubs: { count: clubPending, attention: clubPending > 0 },
  };
  return (
    <div className="admin-frame">
      <AdminRail>
        <nav className="rail-nav" aria-label="Admin">
          {ADMIN_PAGES.map((item) => {
            const badge = badges[item.key];
            const show = badge && (badge.count > 0 || (item.key !== "sends" && item.key !== "clubs"));
            return <a key={item.key} href={item.href} className={`rail-link${badge?.attention ? " rail-attention" : ""}`} aria-current={item.key === page ? "page" : undefined}>{item.label}{show && <span className="count-badge">{badge.count}</span>}</a>;
          })}
        </nav>
        <div className="rail-section">
          <a href="/live" className="rail-link">Live feed</a>
          <a href="/account" className="rail-link">Your account</a>
        </div>
        <div className="rail-account"><span title={username}>{username}</span><form action={logoutAction}><PendingButton className="text-button" pendingText="…">Sign out</PendingButton></form></div>
      </AdminRail>
      <main className="admin-main">
        <ScheduledDeliveryCheck />
        <section className="admin-heading"><div><h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="heading-actions">{actions}</div>}</section>
        {notice && <Notice ok={notice.ok} error={notice.error} />}
        {children}
      </main>
    </div>
  );
}
