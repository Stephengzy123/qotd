"use client";

import { useState } from "react";

export function CalendarEmbedCopy() {
  const [message, setMessage] = useState("");
  const [fallback, setFallback] = useState("");
  async function copy() {
    const url = new URL("/live/calendar?embed=1", window.location.origin).href;
    try {
      await navigator.clipboard.writeText(url);
      setFallback("");
      setMessage("Calendar embed link copied.");
    } catch {
      setFallback(url);
      setMessage("Select and copy the link below.");
    }
  }
  return <div>
    <button type="button" className="secondary" onClick={copy}>Copy calendar embed link</button>
    <span role="status" className="hint">{message}</span>
    {fallback && <input aria-label="Calendar embed link" readOnly value={fallback} onFocus={event => event.currentTarget.select()} />}
  </div>;
}
