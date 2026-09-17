import { requireRole } from "@/lib/auth";
import { dbReady } from "@/lib/db";
import { listAccounts } from "@/lib/accounts";
import { queueCounts } from "@/lib/admin-data";
import { getWebhookDetails } from "@/lib/webhook-details";
import { AdminShell } from "@/components/admin-shell";
import { QuickAnnouncement } from "@/components/quick-announcement";

export default async function AdminOverviewPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const session = await requireRole("admin");
  const params = await searchParams;
  const sql = await dbReady();
  const [counts, settingsRows, accounts] = await Promise.all([
    queueCounts(),
    sql<{ mention_role_id: string | null; webhook_url_encrypted: string | null }[]>`select mention_role_id, webhook_url_encrypted from settings where singleton = true`,
    listAccounts(),
  ]);
  const settings = settingsRows[0] || { mention_role_id: null, webhook_url_encrypted: null };
  const ready = Boolean(settings.webhook_url_encrypted && settings.mention_role_id);
  const awaitingSetup = accounts.filter((account) => !account.has_password).length;
  const quickProfile = await getWebhookDetails(settings.webhook_url_encrypted);

  const cards = [
    { href: "/admin/pending", title: "Pending", count: counts.pending, text: "Contributor submissions waiting for a decision.", tone: counts.pending ? "pending" : "ready", label: counts.pending ? "Needs review" : "Clear" },
    { href: "/admin/approved", title: "Approved", count: counts.approved, text: "Scheduled announcements and events, plus manual sends.", tone: "ready", label: "Scheduled" },
    { href: "/admin/sends", title: "Sends", count: counts.sentWeek, text: "Every Discord and /live delivery, with the exact message.", tone: counts.failedWeek ? "pending" : "ready", label: counts.failedWeek ? `${counts.failedWeek} failed this week` : "Last 7 days" },
    { href: "/admin/settings", title: "Settings", count: null, text: "Webhooks, role mention, calendar feed, and message formats.", tone: ready ? "ready" : "pending", label: ready ? "Ready" : "Setup needed" },
    { href: "/admin/accounts", title: "Accounts", count: accounts.length, text: "Contributors, admins, and club leaders. Create accounts and share setup links.", tone: awaitingSetup ? "pending" : "ready", label: awaitingSetup ? `${awaitingSetup} awaiting setup` : "All set" },
    { href: "/admin/logs", title: "Logs", count: null, text: "Searchable activity log of every sign-in, edit, send, and change.", tone: "ready", label: "Full history" },
  ] as const;

  return (
    <AdminShell page="overview" username={session.username} title="Overview" description="Daily announcements publish the previous evening; events publish on their selected publish date, during the 6 PM Pacific hour." notice={params}>
      <section className="stats" aria-label="Queue summary"><div><span>Awaiting review</span><strong>{counts.pending}</strong></div><div><span>Scheduled</span><strong>{counts.approved}</strong></div><div><span>Sent this week</span><strong>{counts.sentWeek}</strong></div></section>
      <QuickAnnouncement roleId={settings.mention_role_id} avatarUrl={quickProfile.status === "connected" ? quickProfile.avatarUrl : null} />
      <section className="section-block"><div className="section-title"><h2>Go to</h2></div>
        <div className="feature-grid">
          {cards.map((card) => <a key={card.href} href={card.href} className="feature-card"><div className="feature-card-top"><h3>{card.title}</h3>{card.count !== null && <span className="count-badge">{card.count}</span>}</div><p>{card.text}</p><span className={`status ${card.tone}`}>{card.label}</span><span className="feature-card-cta">Open →</span></a>)}
        </div>
      </section>
    </AdminShell>
  );
}
