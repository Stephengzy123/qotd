"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { quickAnnounceAction } from "@/app/admin/quick-action";
import { DiscordMarkdown } from "@/components/discord-preview";
import { quickMessage } from "@/lib/quick-message";
import { WebhookPicker } from "@/components/webhook-picker";
import type { WebhookOption } from "@/lib/webhook-destinations";

export function QuickAnnouncement({ avatarUrl, compact = false, onSent, destinations = [] }: { destinations?: WebhookOption[]; roleId: string | null; avatarUrl: string | null; compact?: boolean; onSent?: () => void }) {
  const [result, action, pending] = useActionState(quickAnnounceAction, {});
  const [nickname, setNickname] = useState("");
  const [message, setMessage] = useState("");
  const [destination, setDestination] = useState("live");
  const [requestId, setRequestId] = useState("");
  const handled = useRef<object | null>(null);
  useEffect(() => { setRequestId(crypto.randomUUID()); }, []);
  useEffect(() => {
    if (result.success && handled.current !== result) { handled.current = result; setMessage(""); setRequestId(crypto.randomUUID()); onSent?.(); }
    // Keep the same key on errors: retries cannot accidentally duplicate a send.
  }, [result, onSent]);
  const preview = quickMessage(message);
  return <section aria-label="Quick announcement" className={compact ? "quick-announcement live-compose" : "panel quick-announcement"}>{!compact && <h2>Quick announcement</h2>}
    <form action={action} onSubmit={event => {
      if (!window.confirm(destination === "live" ? "Publish now to /live and notify subscribers?" : "Send now to Discord and /live without pings?")) event.preventDefault();
    }}>
      <fieldset disabled={pending}>
        <input type="hidden" name="requestId" value={requestId} />
        <label htmlFor="quick-nickname">Post as</label><input id="quick-nickname" name="nickname" value={nickname} onChange={event => setNickname(event.target.value)} required maxLength={80} placeholder="Nickname" />
        <label htmlFor="quick-destination">Send to</label><select id="quick-destination" name="destination" value={destination} onChange={event => setDestination(event.target.value)}><option value="discord">Discord + /live</option><option value="live">/live only</option></select>
        {destination === "discord" && <WebhookPicker options={destinations} />}
        <label htmlFor="quick-message">Message</label><textarea id="quick-message" name="message" rows={compact ? 2 : 5} required maxLength={2000} value={message} onChange={event => setMessage(event.target.value)} placeholder="Message #announcements — Discord Markdown supported" />
        <details open={compact ? undefined : true}><summary>Preview</summary><div className="discord-preview"><div className="quick-identity">{avatarUrl && <img src={avatarUrl} alt="" width={32} height={32} />}<strong>{nickname.trim() || "Nickname"}</strong></div><DiscordMarkdown value={preview} /></div></details>
        <small>{preview.length} / 2,000 characters · No pings, dates, or announcement template.</small>
        <button type="submit" className="primary" disabled={!requestId || !nickname.trim() || !preview || preview.length > 2000}>{pending ? "Sending…" : "Send now"}</button>
        {result.error && <button type="button" className="secondary" onClick={() => { if (window.confirm("Have you checked Recent sends and Discord? Start a new send attempt?")) setRequestId(crypto.randomUUID()); }}>Start new attempt</button>}
      </fieldset>
      {result.error && <p role="alert">{result.error}</p>}{result.success && <p role="status">{result.success}</p>}
    </form>
  </section>;
}
