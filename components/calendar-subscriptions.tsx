"use client";
import { useEffect, useState } from "react";

const options = [
  ["events", "Events (announcement and calendar-only events)"],
  ["rotations", "Block rotations"], ["lunch", "Lunch menus (full menu details)"],
] as const;

export function CalendarSubscriptions() {
  const [origin, setOrigin] = useState("");
  const [selected, setSelected] = useState<string[]>(options.map(([key]) => key));
  const [notice, setNotice] = useState("");
  const [fallback, setFallback] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const include = options.filter(([key]) => selected.includes(key)).flatMap(([key]) => key === "events" ? ["announcement", "manual", "imported"] : [key]).join(",");
  const url = `${origin}/api/calendar/custom.ics?include=${encodeURIComponent(include)}`;
  return <details className="panel calendar-subscriptions"><summary>Subscribe in your calendar app</summary>
    <p>Choose what to include in one subscription. In Google Calendar, use Other calendars → From URL and paste the link. Your calendar app controls refresh timing. Unsent announcement details stay private.</p>
    <fieldset><legend>Include in your calendar</legend>{options.map(([key, label]) =>
      <label className="calendar-subscription-row" key={key}><span>{label}</span><input style={{ width: "1.2rem", height: "1.2rem" }} type="checkbox" checked={selected.includes(key)} onChange={event => {
        setSelected(previous => event.target.checked ? [...previous, key] : previous.filter(value => value !== key)); setNotice(""); setFallback("");
      }} /></label>
    )}</fieldset>
    <div className="row-buttons"><button className="secondary" type="button" disabled={!origin || !selected.length} onClick={async () => {
      try { await navigator.clipboard.writeText(url); setFallback(""); setNotice("Subscription link copied."); }
      catch { setFallback(url); setNotice("Select and copy this subscription link."); }
    }}>Copy subscription link</button>{origin && selected.length > 0 && <a className="secondary" href={url.replace(/^https?:/, "webcal:")}>Open calendar app</a>}</div>
    <p className="hint">Changing these choices creates a new link. Replace your old subscription in your calendar app to change its categories.</p>
    <p role="status">{selected.length ? notice : "Select at least one category."}</p>{fallback && <input aria-label="Subscription URL" value={fallback} readOnly onFocus={event => event.currentTarget.select()} />}
  </details>;
}
