"use client";

import { useEffect, useRef, useState } from "react";
import { DiscordMarkdown } from "@/components/discord-preview";
import { MarkdownEditor } from "@/components/markdown-editor";
import { PendingButton } from "@/components/pending-button";

const MAX_LENGTH = 2000;

type Props = { connected: boolean; mode: "post" | "submit"; clubName: string; channelName?: string | null };

// Free-form post to one club channel: no template, no schedule. Leaders and
// admins post directly; assistants submit for the leader to approve.
export function ClubComposer({ connected, mode, clubName, channelName }: Props) {
  const [message, setMessage] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const length = message.length;
  const ready = connected && message.trim().length > 0 && length <= MAX_LENGTH;
  const verb = mode === "submit" ? "Send for approval" : "Post now";

  useEffect(() => {
    // ⌘/Ctrl+Enter posts from anywhere in the composer.
    const element = root.current;
    if (!element) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); element.closest("form")?.requestSubmit(); }
    };
    element.addEventListener("keydown", onKeyDown);
    return () => element.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="composer club-composer" ref={root}>
      <div className="composer-main">
        <MarkdownEditor id="message" name="message" value={message} onChange={setMessage} maxLength={MAX_LENGTH} required rows={10} heading={<div className="field-heading"><label htmlFor="message">Message</label><span className={length > MAX_LENGTH ? "count over" : "count"}>{length.toLocaleString()} / {MAX_LENGTH.toLocaleString()}</span></div>} />
      </div>
      <aside className="composer-preview">
        <span className="label">How it lands in {channelName ? `#${channelName}` : `${clubName}’s channel`}</span>
        <div className="discord-preview"><DiscordMarkdown value={message || "Start typing to see the preview."} /></div>
        <p className="hint"><code>@user</code> and <code>@role</code> mentions work; <code>@everyone</code> and <code>@here</code> are ignored.</p>
      </aside>
      <div className="form-footer composer-footer">
        <p>{!connected ? "The channel isn’t connected yet — an admin needs to add the webhook." : mode === "submit" ? "Your club leader gets to approve this before it posts." : "Goes out the moment you post — there’s no undo in Discord."}</p>
        <div className="composer-submit">
          <span className="hint">{ready ? `⌘/Ctrl+Enter to ${mode === "submit" ? "send" : "post"}` : !connected ? "Channel not connected" : length > MAX_LENGTH ? "Too long for Discord" : "Write something first"}</span>
          <PendingButton type="submit" className="primary" pendingText={mode === "submit" ? "Sending…" : "Posting…"} disabled={!ready}>{verb}</PendingButton>
        </div>
      </div>
    </div>
  );
}
