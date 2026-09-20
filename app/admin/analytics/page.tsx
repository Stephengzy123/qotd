import { requireRole } from "@/lib/auth";
import { listAccounts } from "@/lib/accounts";
import { audienceAnalytics } from "@/lib/admin-data";
import { AdminShell } from "@/components/admin-shell";
import { AudienceSnapshot } from "@/components/audience-snapshot";

export default async function AnalyticsPage() {
  const session = await requireRole("admin");
  const accounts = await listAccounts();
  const accountNames = new Set(accounts.map((account) => account.username.toLowerCase()));
  const configuredAccounts = new Set([process.env.ADMIN_USERNAME, process.env.CONTRIBUTOR_USERNAME].filter((username): username is string => Boolean(username)).map((username) => username.toLowerCase()).filter((username) => !accountNames.has(username)));
  const totalAccounts = accounts.length + configuredAccounts.size;
  const passwordReadyAccounts = accounts.filter((account) => account.has_password).length + configuredAccounts.size;
  const analytics = await audienceAnalytics(totalAccounts);
  return <AdminShell page="analytics" username={session.username} title="Analytics" description="Private, aggregate account and notification metrics.">
    <AudienceSnapshot totalAccounts={totalAccounts} passwordReadyAccounts={passwordReadyAccounts} notificationSubscriptions={analytics.notificationSubscriptions} accountRemovals={analytics.accountRemovals} notificationRemovals={analytics.notificationRemovals} timeline={analytics.timeline} />
  </AdminShell>;
}
