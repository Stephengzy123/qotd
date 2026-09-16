"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { DiscordMarkdown } from "@/components/discord-preview";
import { setLiveMessageHidden } from "@/app/live/actions";
import { LiveNotifications } from "@/components/live-notifications";
import { LiveInstall } from "@/components/live-install";
import { QuickAnnouncement } from "@/components/quick-announcement";

type Message = { id: string; message: string; type: string | null; sentAt: string; cursor: string; hidden: boolean; senderName?: string | null; senderAvatarUrl?: string | null };
type Page = { messages: Message[]; hasMore: boolean };
function timestamp(value: string) {
  const date = new Date(value), today = new Date(), yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const day = date.toDateString() === today.toDateString() ? "Today" : date.toDateString() === yesterday.toDateString() ? "Yesterday" : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  return `${day} at ${date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

export function LiveFeed({ isAdmin = false, botName = "Announcements", avatarUrl = null, roleId = null }: { isAdmin?: boolean; botName?: string; avatarUrl?: string | null; roleId?: string | null }) {
  const [showHidden, setShowHidden] = useState(false), [changing, setChanging] = useState<string | null>(null);
  const [filter, setFilter] = useState("all"), [theme, setTheme] = useState("system");
  const [messages, setMessages] = useState<Message[]>([]), [hasOlder, setHasOlder] = useState(false);
  const [loading, setLoading] = useState(true), [error, setError] = useState(""), [newMessages, setNewMessages] = useState(false);
  const viewport = useRef<HTMLDivElement>(null), content = useRef<HTMLDivElement>(null);
  const records = useRef<Message[]>([]), busy = useRef(false), generation = useRef(0), stickBottom = useRef(true);
  const scrollChange = useRef<{ height: number; top: number } | "bottom" | null>(null);
  const retryDirection = useRef<"initial" | "older" | "newer">("initial");

  useEffect(() => { try { const saved = localStorage.getItem("announcement-live-theme"); if (saved && ["system", "light", "dark"].includes(saved)) setTheme(saved); } catch {} }, []);
  const load = useCallback(async (direction: "initial" | "older" | "newer") => {
    if (busy.current) return;
    busy.current = true;
    const version = generation.current;
    if (direction !== "newer") setLoading(true);
    try {
      const params = new URLSearchParams({ type: filter });
      if (isAdmin && showHidden) params.set("hidden", "true");
      const existing = records.current;
      if (direction === "older" && existing.length) params.set("before", existing[0].cursor);
      if (direction === "newer" && existing.length) params.set("after", existing[existing.length - 1].cursor);
      const response = await fetch(`/api/live?${params}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load messages. Please try again.");
      const page: Page = await response.json();
      if (version !== generation.current) return;
      setError("");
      if (direction === "initial" || direction === "older" || !existing.length) setHasOlder(page.hasMore);
      if (direction === "initial") scrollChange.current = "bottom";
      else if (direction === "older" && viewport.current) scrollChange.current = { height: viewport.current.scrollHeight, top: viewport.current.scrollTop };
      else if (page.messages.length) {
        if (stickBottom.current) scrollChange.current = "bottom";
        else setNewMessages(true);
      }
      const combined = direction === "initial" ? page.messages : direction === "older" ? [...page.messages, ...records.current] : [...records.current, ...page.messages];
      records.current = [...new Map(combined.map(message => [message.id, message])).values()];
      setMessages(records.current);
    } catch (err) { if (version === generation.current) { retryDirection.current = direction; setError(err instanceof Error ? err.message : "Could not load messages."); } }
    finally { if (version === generation.current) { busy.current = false; setLoading(false); } }
  }, [filter, isAdmin, showHidden]);

  useEffect(() => {
    generation.current++;
    busy.current = false; records.current = []; stickBottom.current = true;
    setMessages([]); setHasOlder(false); setNewMessages(false);
    void load("initial");
    const timer = window.setInterval(() => { if (!document.hidden) void load("newer"); }, 15000);
    return () => { generation.current++; window.clearInterval(timer); };
  }, [load]);
  useLayoutEffect(() => {
    const el = viewport.current, change = scrollChange.current;
    if (el && change) el.scrollTop = change === "bottom" ? el.scrollHeight : change.top + el.scrollHeight - change.height;
    scrollChange.current = null;
  }, [messages]);
  useEffect(() => {
    if (!content.current) return;
    const observer = new ResizeObserver(() => { if (stickBottom.current && viewport.current) viewport.current.scrollTop = viewport.current.scrollHeight; });
    observer.observe(content.current);
    return () => observer.disconnect();
  }, []);

  return <main className="live-shell" data-theme={theme}>
    <header className="live-header"><h1># announcements</h1>
      <div className="live-controls"><label>Show<select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All messages</option><option value="announcement">Day announcements</option><option value="event">Events</option></select></label>
        <label>Appearance<select value={theme} onChange={event => { setTheme(event.target.value); try { localStorage.setItem("announcement-live-theme", event.target.value); } catch {} }}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
        {isAdmin && <label>Visibility<select value={showHidden ? "hidden" : "visible"} onChange={event => setShowHidden(event.target.value === "hidden")}><option value="visible">Visible</option><option value="hidden">Hidden</option></select></label>}</div>
      <LiveNotifications />
      <LiveInstall />
    </header>
    <div ref={viewport} className="live-scroll" tabIndex={0} aria-label="Sent messages, oldest first" onScroll={() => {
      const el = viewport.current!; stickBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      if (stickBottom.current) setNewMessages(false);
      if (el.scrollTop < 100 && hasOlder && !busy.current) void load("older");
    }}><div ref={content} className="live-content">
      {hasOlder && <button type="button" className="live-load" disabled={loading} onClick={() => void load("older")}>Load older messages</button>}
      {loading && <p className="live-status" role="status">Loading messages…</p>}
      {error && <p className="live-status" role="alert">{error} <button type="button" onClick={() => void load(retryDirection.current)}>Retry</button></p>}
      {!loading && !error && !messages.length && <p className="live-status">No sent messages in this category yet.</p>}
      {messages.map(message => <article className="live-message" key={message.id}>
        {(message.senderAvatarUrl || avatarUrl) ? <img className="live-avatar" src={message.senderAvatarUrl || avatarUrl!} alt="" width={38} height={38} referrerPolicy="no-referrer" /> : <div className="live-avatar" aria-hidden="true">{(message.senderName || botName).slice(0, 1).toUpperCase()}</div>}<div className="live-message-body"><div className="live-message-meta"><strong>{message.senderName || botName}</strong>{message.senderName ? null : <span className="live-bot">BOT</span>}<time dateTime={message.sentAt} title={new Date(message.sentAt).toLocaleString()}>{timestamp(message.sentAt)}</time>
          {isAdmin && <button type="button" disabled={changing !== null} onClick={async () => {
            setChanging(message.id);
            try { await setLiveMessageHidden(message.id, !message.hidden); records.current = records.current.filter(item => item.id !== message.id); setMessages(records.current); }
            catch { setError("Could not change message visibility. Please try again."); }
            finally { setChanging(null); }
          }}>{changing === message.id ? "Saving…" : message.hidden ? "Restore" : "Hide"}</button>}</div>
          <div className="discord-preview"><DiscordMarkdown value={message.message} /></div></div>
      </article>)}
    </div></div>
    {newMessages && <button type="button" className="live-jump" onClick={() => { stickBottom.current = true; if (viewport.current) viewport.current.scrollTop = viewport.current.scrollHeight; setNewMessages(false); }}>New messages ↓</button>}
    {isAdmin && <QuickAnnouncement compact roleId={roleId} avatarUrl={avatarUrl} onSent={() => { setFilter("all"); setShowHidden(false); stickBottom.current = true; if (filter === "all" && !showHidden) void load("newer"); }} />}
  </main>;
}
