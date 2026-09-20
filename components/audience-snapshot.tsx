import type { AudienceTimelinePoint } from "@/lib/admin-data";

function dayLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}

export function AudienceSnapshot({ totalAccounts, passwordReadyAccounts, notificationSubscriptions, timeline }: { totalAccounts: number; passwordReadyAccounts: number; notificationSubscriptions: number; timeline: AudienceTimelinePoint[] }) {
  const maximum = Math.max(1, ...timeline.flatMap((point) => [point.accounts, point.subscriptions]));
  const description = timeline.map((point) => `${dayLabel(point.date)}: ${point.accounts} new accounts, ${point.subscriptions} notification subscriptions`).join(". ");
  return <section className="section-block audience-section">
    <div className="section-title"><div><h2>Audience</h2><p className="hint">Private, aggregate-only usage numbers. No names, browser endpoints, or personal details are shown.</p></div></div>
    <div className="stats audience-stats" aria-label="Audience summary">
      <div><span>Total accounts</span><strong>{totalAccounts}</strong></div>
      <div><span>Accounts ready to sign in</span><strong>{passwordReadyAccounts}</strong></div>
      <div><span>Notification-enabled browsers</span><strong>{notificationSubscriptions}</strong></div>
    </div>
    <div className="panel audience-chart-panel">
      <div className="audience-chart-heading"><div><h3>New accounts and notification opt-ins</h3><p>Last {timeline.length} days</p></div><div className="audience-legend" aria-hidden="true"><span><i className="accounts" />Accounts</span><span><i className="subscriptions" />Notifications</span></div></div>
      <div className="audience-chart" role="img" aria-label={description}>
        {timeline.map((point, index) => <div className="audience-chart-day" key={point.date} title={`${dayLabel(point.date)}: ${point.accounts} new accounts · ${point.subscriptions} notification subscriptions`}>
          <div className="audience-chart-bars"><i className="accounts" style={{ height: `${(point.accounts / maximum) * 100}%` }} /><i className="subscriptions" style={{ height: `${(point.subscriptions / maximum) * 100}%` }} /></div>
          {(index === 0 || index === timeline.length - 1 || index % 4 === 0) && <time>{dayLabel(point.date)}</time>}
        </div>)}
      </div>
      <p className="hint audience-chart-note">A browser can have more than one notification subscription, so this is not a people count.</p>
    </div>
  </section>;
}
