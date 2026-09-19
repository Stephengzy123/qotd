export type Mode = "admin" | "contributor" | "leader" | "assistant" | "live";

const MODES: Record<Mode, { label: string; className: string }> = {
  admin: { label: "Admin", className: "mode-admin" },
  contributor: { label: "Contributor", className: "mode-contributor" },
  leader: { label: "Club manager", className: "mode-leader" },
  assistant: { label: "Posting disabled", className: "mode-assistant" },
  live: { label: "Live", className: "mode-live" },
};

// "Announcements" plus a colored badge naming which side of the app this is.
export function ModeBrand({ mode, detail, href = "/" }: { mode: Mode; detail?: string; href?: string }) {
  const item = MODES[mode];
  return (
    <a href={href} className="mode-brand">
      <span className="mode-brand-mark" aria-hidden="true">A</span>
      <span className="mode-brand-text"><strong>Announcements</strong><span className={`mode-badge ${item.className}`}>{item.label}</span>{detail && <span className="mode-detail">{detail}</span>}</span>
    </a>
  );
}

export function ModeBadge({ mode }: { mode: Mode }) {
  const item = MODES[mode];
  return <span className={`mode-badge ${item.className}`}>{item.label}</span>;
}
