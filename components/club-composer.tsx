"use client";

import { useEffect, useRef, useState } from "react";
import { DiscordMarkdown } from "@/components/discord-preview";
import { MarkdownEditor } from "@/components/markdown-editor";
import { PendingButton } from "@/components/pending-button";
import { WebhookPicker } from "@/components/webhook-picker";
import type { WebhookOption } from "@/lib/webhook-destinations";

const MAX_LENGTH = 2000;

// Free-form Discord-only post to selected assigned channels.
export function ClubComposer({ destinations }: { destinations: WebhookOption[] }) {
  const connected = destinations.length > 0;
  const [requestId, setRequestId] = useState("");
  useEffect(() => { setRequestId(crypto.randomUUID()); }, []);
  const [message, setMessage] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const length = message.length;
  const ready = connected && Boolean(requestId) && message.trim().length > 0 && length <= MAX_LENGTH;

  useEffect(() => {
    // ⌘/Ctrl+Enter posts from anywhere in the composer.
    const element = root.current;
    if (!element) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        element.closest("form")?.requestSubmit();
      }
    };
    element.addEventListener("keydown", onKeyDown);
    return () => element.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="composer" ref={root}>
      <div className="composer-main">
        <input type="hidden" name="requestId" value={requestId} />
        <WebhookPicker options={destinations} />
        <MarkdownEditor id="message" name="message" value={message} onChange={setMessage} maxLength={MAX_LENGTH} required rows={14} heading={<div className="field-heading"><label htmlFor="message">Message</label><span className={length > MAX_LENGTH ? "count over" : "count"}>{length.toLocaleString()} / {MAX_LENGTH.toLocaleString()}</span></div>} />
      </div>
      <aside className="composer-preview">
        <span className="label">Preview</span>
        <div className="discord-preview"><DiscordMarkdown value={message || "Your post will look like this in Discord."} /></div>
        <p className="hint">Posts go out as soon as you hit Post. <code>@user</code> and <code>@role</code> mentions work; <code>@everyone</code> and <code>@here</code> are ignored.</p>
      </aside>
      <div className="form-footer composer-footer">
        <p>{connected ? "Goes only to your selected Discord channels — never /live. Give it a final read." : "Ask an admin to assign a Discord webhook."}</p>
        <div className="composer-submit">
          <span className="hint">{ready ? "⌘/Ctrl+Enter to post" : !connected ? "Channel not connected" : length > MAX_LENGTH ? "Too long for Discord" : "Write something first"}</span>
          <PendingButton type="submit" className="primary" pendingText="Posting…" disabled={!ready}>Post to selected channels</PendingButton>
        </div>
      </div>
    </div>
  );
}
