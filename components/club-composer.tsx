"use client";

import { useEffect, useRef, useState } from "react";
import { DiscordMarkdown } from "@/components/discord-preview";
import { MarkdownEditor } from "@/components/markdown-editor";
import { PendingButton } from "@/components/pending-button";

const MAX_LENGTH = 2000;

// Free-form post to the club's own channel: no template, no review, no schedule.
export function ClubComposer({ connected }: { connected: boolean }) {
  const [message, setMessage] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const length = message.length;
  const ready = connected && message.trim().length > 0 && length <= MAX_LENGTH;

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
        <MarkdownEditor id="message" name="message" value={message} onChange={setMessage} maxLength={MAX_LENGTH} required rows={14} heading={<div className="field-heading"><label htmlFor="message">Message</label><span className={length > MAX_LENGTH ? "count over" : "count"}>{length.toLocaleString()} / {MAX_LENGTH.toLocaleString()}</span></div>} />
      </div>
      <aside className="composer-preview">
        <span className="label">Preview</span>
        <div className="discord-preview"><DiscordMarkdown value={message || "Your post will look like this in Discord."} /></div>
        <p className="hint">Posts go out as soon as you hit Post. <code>@user</code> and <code>@role</code> mentions work; <code>@everyone</code> and <code>@here</code> are ignored.</p>
      </aside>
      <div className="form-footer composer-footer">
        <p>{connected ? "Goes straight to your club channel — there’s no review step, so give it a final read." : "Your channel isn’t connected yet. Ask an admin to add your webhook."}</p>
        <div className="composer-submit">
          <span className="hint">{ready ? "⌘/Ctrl+Enter to post" : !connected ? "Channel not connected" : length > MAX_LENGTH ? "Too long for Discord" : "Write something first"}</span>
          <PendingButton type="submit" className="primary" pendingText="Posting…" disabled={!ready}>Post to channel</PendingButton>
        </div>
      </div>
    </div>
  );
}
