import type { AudienceTimelinePoint } from "@/lib/admin-data";

type TrendPoint = { date: string; total: number; additions: number; removals: number };

function dayLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}

function TrendChart({ title, axis, series, additionsLabel, removalsLabel, timeline, trackingNote }: { title: string; axis: string; series: "accounts" | "notifications"; additionsLabel: string; removalsLabel: string; timeline: TrendPoint[]; trackingNote?: string }) {
  const maximum = Math.max(1, ...timeline.map((point) => point.total));
  const midpoint = Math.ceil(maximum / 2);
  const additions = timeline.reduce((sum, point) => sum + point.additions, 0);
  const removals = timeline.reduce((sum, point) => sum + point.removals, 0);
  const description = timeline.map((point) => `${dayLabel(point.date)}: ${point.total} total, ${point.additions} added, ${point.removals} removed`).join(". ");
  return <div className="panel audience-chart-panel">
    <div className="audience-chart-heading"><div><h3>{title}</h3><p>Last {timeline.length} days · y-axis is total {axis.toLowerCase()}</p></div><div className="audience-legend" aria-hidden="true"><span><i className={series} />Total</span><span><i className="removals" />Removal that day</span></div></div>
    <div className="audience-plot"><div className="audience-y-axis" aria-hidden="true"><span>{maximum}</span><span>{midpoint}</span><span>0</span><b>{axis}</b></div><div className="audience-chart" role="img" aria-label={description}>
      {timeline.map((point, index) => <div className="audience-chart-day" key={point.date} title={`${dayLabel(point.date)}: ${point.total} total · ${point.additions} ${additionsLabel} · ${point.removals} ${removalsLabel}`}>
        <div className="audience-chart-bars"><i className={series} style={{ height: `${(point.total / maximum) * 100}%` }} />{point.removals > 0 && <i className="removals" />}</div>
        {(index === 0 || index === timeline.length - 1 || index % 4 === 0) && <time>{dayLabel(point.date)}</time>}
      </div>)}</div></div>
    <p className="hint audience-chart-note">Over this period: {additions} {additionsLabel} · {removals} {removalsLabel}.{trackingNote ? ` ${trackingNote}` : ""}</p>
  </div>;
}

export function AudienceSnapshot({ totalAccounts, passwordReadyAccounts, notificationSubscriptions, accountRemovals, notificationRemovals, timeline }: { totalAccounts: number; passwordReadyAccounts: number; notificationSubscriptions: number; accountRemovals: number; notificationRemovals: number; timeline: AudienceTimelinePoint[] }) {
  const accountTimeline = timeline.map((point) => ({ date: point.date, total: point.totalAccounts, additions: point.accountAdds, removals: point.accountRemovals }));
  const notificationTimeline = timeline.map((point) => ({ date: point.date, total: point.totalNotifications, additions: point.notificationAdds, removals: point.notificationRemovals }));
  return <section className="section-block audience-section">
    <div className="section-title"><div><h2>Audience analytics</h2><p className="hint">Private, aggregate-only usage numbers. No names, browser endpoints, or personal details are shown.</p></div></div>
    <div className="stats audience-stats" aria-label="Audience summary">
      <div><span>Total accounts</span><strong>{totalAccounts}</strong></div>
      <div><span>Accounts ready to sign in</span><strong>{passwordReadyAccounts}</strong></div>
      <div><span>Notification-enabled browsers</span><strong>{notificationSubscriptions}</strong></div>
      <div><span>Account removals</span><strong>{accountRemovals}</strong></div>
      <div><span>Notification opt-outs</span><strong>{notificationRemovals}</strong></div>
    </div>
    <div className="audience-chart-grid">
      <TrendChart title="Total accounts over time" axis="Accounts" series="accounts" additionsLabel="accounts added" removalsLabel="accounts removed" timeline={accountTimeline} />
      <TrendChart title="Notification-enabled browsers over time" axis="Browsers" series="notifications" additionsLabel="opt-ins" removalsLabel="opt-outs" timeline={notificationTimeline} trackingNote="Notification change history begins with this update." />
    </div>
  </section>;
}
