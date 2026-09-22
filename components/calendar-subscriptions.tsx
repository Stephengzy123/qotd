"use client";
import { useEffect, useState } from "react";

export function CalendarSubscriptions() {
  const [origin, setOrigin] = useState("");
  const [notice, setNotice] = useState("");
  const [fallback, setFallback] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  return <details className="panel calendar-subscriptions"><summary>Subscribe in your calendar app</summary>
    <p>Choose any combination. In Google Calendar, use Other calendars → From URL and paste the copied link. Subscribe rather than importing a file to receive updates. Your calendar app controls refresh timing.</p>
    {[["events", "Events", "Announcement and calendar-only events. Unsent announcement details stay private."], ["rotations", "Block rotations", "Daily block rotation schedules."], ["lunch", "Lunch menus", "Full daily menus, including all options, sides, and source dietary notes."]].map(([key, label, description]) => {
      const url = `${origin}/api/calendar/${key}.ics`;
      return <div className="calendar-subscription-row" key={key}><div><strong>{label}</strong><p>{description}</p></div><div className="row-buttons"><button className="secondary" type="button" disabled={!origin} onClick={async () => {
        try { await navigator.clipboard.writeText(url); setFallback(""); setNotice(`${label} subscription link copied.`); }
        catch { setFallback(url); setNotice("Select and copy this subscription link."); }
      }}>Copy subscription link</button>{origin && <a className="secondary" href={url.replace(/^https?:/, "webcal:")}>Open calendar app</a>}</div></div>;
    })}
    <p role="status">{notice}</p>{fallback && <input aria-label="Subscription URL" value={fallback} readOnly onFocus={event => event.currentTarget.select()} />}
  </details>;
}
