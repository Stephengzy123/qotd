"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DiscordMarkdown } from "@/components/discord-preview";

type LiveUpdate = { id: string; title: string; body: string; publishedAt: string };
const SEEN_KEY = "announcement-live-update-seen:v1";

export function LiveUpdateNotice() {
  const [update, setUpdate] = useState<LiveUpdate | null>(null);
  const busy = useRef(false);
  const seenThisSession = useRef<string | null>(null);

  const check = useCallback(async () => {
    if (busy.current || document.hidden) return;
    busy.current = true;
    try {
      const response = await fetch("/api/live-update", { cache: "no-store" });
      if (!response.ok) return;
      const data: { update: LiveUpdate | null } = await response.json();
      const next = data.update;
      if (!next) { setUpdate(null); return; }
      let seen = seenThisSession.current;
      try { seen ||= localStorage.getItem(SEEN_KEY); } catch {}
      setUpdate(seen === next.id ? null : next);
    } catch {
      // A failed update check should never interrupt the announcement feed.
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    void check();
    const onVisible = () => { if (!document.hidden) void check(); };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [check]);

  if (!update) return null;
  return <aside className="live-update-notice" role="status" aria-labelledby="live-update-title">
    <div className="live-update-copy">
      <span className="live-update-eyebrow">What’s new</span>
      <h2 id="live-update-title">{update.title}</h2>
      <div className="discord-preview live-update-description"><DiscordMarkdown value={update.body} /></div>
      <a className="live-update-history-link" href="/update-history">See full update history here.</a>
    </div>
    <button type="button" className="live-pill" onClick={() => {
      seenThisSession.current = update.id;
      try { localStorage.setItem(SEEN_KEY, update.id); } catch {}
      setUpdate(null);
    }}>Got it</button>
  </aside>;
}
