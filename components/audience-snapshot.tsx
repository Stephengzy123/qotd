import type { AudienceTimelinePoint } from "@/lib/admin-data";

function dayLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}

export function AudienceSnapshot({ totalAccounts, passwordReadyAccounts, notificationSubscriptions, accountRemovals, notificationRemovals, timeline }: { totalAccounts: number; passwordReadyAccounts: number; notificationSubscriptions: number; accountRemovals: number; notificationRemovals: number; timeline: AudienceTimelinePoint[] }) {
  const maximum = Math.max(1, ...timeline.map((point) => point.totalAccounts));
  const midpoint = Math.ceil(maximum / 2);
  const additions = timeline.reduce((sum, point) => sum + point.accountAdds, 0);
  const removals = timeline.reduce((sum, point) => sum + point.accountRemovals, 0);
  const description = timeline.map((point) => `${dayLabel(point.date)}: ${point.totalAccounts} total accounts, ${point.accountAdds} added, ${point.accountRemovals} removed`).join(". ");
  return <section className="section-block audience-section">
    <div className="section-title"><div><h2>Audience analytics</h2><p className="hint">Private, aggregate-only usage numbers. No names, browser endpoints, or personal details are shown.</p></div></div>
    <div className="stats audience-stats" aria-label="Audience summary">
      <div><span>Total accounts</span><strong>{totalAccounts}</strong></div>
      <div><span>Accounts ready to sign in</span><strong>{passwordReadyAccounts}</strong></div>
      <div><span>Notification-enabled browsers</span><strong>{notificationSubscriptions}</strong></div>
      <div><span>Account removals</span><strong>{accountRemovals}</strong></div>
      <div><span>Notification opt-outs</span><strong>{notificationRemovals}</strong></div>
    </div>
    <div className="panel audience-chart-panel">
      <div className="audience-chart-heading"><div><h3>Total accounts over time</h3><p>Last {timeline.length} days · y-axis is total accounts</p></div><div className="audience-legend" aria-hidden="true"><span><i className="accounts" />Total accounts</span><span><i className="removals" />Removal that day</span></div></div>
      <div className="audience-plot"><div className="audience-y-axis" aria-hidden="true"><span>{maximum}</span><span>{midpoint}</span><span>0</span><b>Accounts</b></div><div className="audience-chart" role="img" aria-label={description}>
        {timeline.map((point, index) => <div className="audience-chart-day" key={point.date} title={`${dayLabel(point.date)}: ${point.totalAccounts} total accounts · ${point.accountAdds} added · ${point.accountRemovals} removed`}>
          <div className="audience-chart-bars"><i className="accounts" style={{ height: `${(point.totalAccounts / maximum) * 100}%` }} />{point.accountRemovals > 0 && <i className="removals" />}</div>
          {(index === 0 || index === timeline.length - 1 || index % 4 === 0) && <time>{dayLabel(point.date)}</time>}
        </div>)}</div></div>
      <p className="hint audience-chart-note">Over this period: {additions} {additions === 1 ? "account added" : "accounts added"} · {removals} {removals === 1 ? "account removed" : "accounts removed"}. Notification count is browser subscriptions, not a people count; opt-outs begin tracking with this update.</p>
    </div>
  </section>;
}
