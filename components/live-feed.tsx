"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { DiscordMarkdown } from "@/components/discord-preview";
import { setLiveMessageHidden } from "@/app/live/actions";
import { LiveNotifications } from "@/components/live-notifications";
import { LiveInstall } from "@/components/live-install";
import { QuickAnnouncement, type QuickReplyTarget } from "@/components/quick-announcement";
import { ScheduledDeliveryCheck } from "@/components/scheduled-delivery-check";
import { LiveChannelName } from "@/components/live-channel-name";
import type { WebhookOption } from "@/lib/webhook-destinations";
import type { CalendarEvent } from "@/lib/calendar";

type ReplyReference = { id: string; message: string | null; senderName: string | null; sentAt: string | null; unavailable: boolean };
type Message = { id: string; message: string; type: string | null; human: boolean; sentAt: string; cursor: string; hidden: boolean; senderName?: string | null; senderAvatarUrl?: string | null; replyTo: ReplyReference | null; calendarDate?: string | null };
type Page = { messages: Message[]; hasMore: boolean };
function dayOf(value: string) {
  const date = new Date(value), today = new Date(), yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: date.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}
function clock(value: string) {
  return new Date(value).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
const FILTERS = [{ value: "all", label: "Everything" }, { value: "announcement", label: "Daily" }, { value: "event", label: "Events" }, { value: "reminder", label: "Reminders" }, { value: "human", label: "Human posts" }];
const THEMES = [{ value: "system", label: "Auto" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }];
function timestamp(value: string) {
  const date = new Date(value), today = new Date(), yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const day = date.toDateString() === today.toDateString() ? "Today" : date.toDateString() === yesterday.toDateString() ? "Yesterday" : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  return `${day} at ${date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}
function replyExcerpt(value: string) {
  const singleLine = value.replace(/\s+/g, " ").trim();
  return singleLine.length > 170 ? `${singleLine.slice(0, 169)}…` : singleLine;
}

export function LiveFeed({ isAdmin = false, canRunScheduledBackup = false, botName = "Announcements", channelName = "Announcements", avatarUrl = null, roleId = null, destinations = [], calendarEvents = [], calendarToday }: { destinations?: WebhookOption[]; isAdmin?: boolean; canRunScheduledBackup?: boolean; botName?: string; channelName?: string; avatarUrl?: string | null; roleId?: string | null; calendarEvents?: CalendarEvent[]; calendarToday: string }) {
  const [showHidden, setShowHidden] = useState(false), [changing, setChanging] = useState<string | null>(null);
  const [filter, setFilter] = useState("all"), [theme, setTheme] = useState("system"), [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");
  const [messages, setMessages] = useState<Message[]>([]), [hasOlder, setHasOlder] = useState(false);
  const [loading, setLoading] = useState(true), [error, setError] = useState(""), [newMessages, setNewMessages] = useState(false);
  const [replyingTo, setReplyingTo] = useState<QuickReplyTarget | null>(null), [highlighted, setHighlighted] = useState<string | null>(null);
  const viewport = useRef<HTMLDivElement>(null), content = useRef<HTMLDivElement>(null);
  const records = useRef<Message[]>([]), busy = useRef(false), generation = useRef(0), stickBottom = useRef(true);
  const scrollChange = useRef<{ height: number; top: number } | "bottom" | null>(null);
  const revealAfterRender = useRef<string | null>(null);
  const retryDirection = useRef<"initial" | "older" | "newer">("initial");

  useEffect(() => { try { const saved = localStorage.getItem("announcement-live-theme"); if (saved && ["system", "light", "dark"].includes(saved)) setTheme(saved); } catch {} }, []);
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => setResolvedTheme(theme === "system" ? (mediaQuery.matches ? "dark" : "light") : theme as "light" | "dark");
    applyTheme();
    mediaQuery.addEventListener("change", applyTheme);
    return () => mediaQuery.removeEventListener("change", applyTheme);
  }, [theme]);
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
  useLayoutEffect(() => {
    const id = revealAfterRender.current;
    if (!id) return;
    const element = document.getElementById(`live-message-${id}`);
    if (!element) return;
    revealAfterRender.current = null;
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlighted(id);
    window.setTimeout(() => setHighlighted(current => current === id ? null : current), 1800);
  }, [messages]);
  useEffect(() => {
    if (!content.current) return;
    const observer = new ResizeObserver(() => { if (stickBottom.current && viewport.current) viewport.current.scrollTop = viewport.current.scrollHeight; });
    observer.observe(content.current);
    return () => observer.disconnect();
  }, []);

  const todayCount = messages.filter(message => dayOf(message.sentAt) === "Today").length;
  const groups = messages.reduce<{ day: string; items: Message[] }[]>((list, message) => {
    const day = dayOf(message.sentAt);
    const last = list[list.length - 1];
    if (last && last.day === day) last.items.push(message); else list.push({ day, items: [message] });
    return list;
  }, []);

  const revealMessage = useCallback(async (id: string) => {
    const existing = document.getElementById(`live-message-${id}`);
    if (existing) {
      existing.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlighted(id);
      window.setTimeout(() => setHighlighted(current => current === id ? null : current), 1800);
      return;
    }
    try {
      const response = await fetch(`/api/live?target=${encodeURIComponent(id)}`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      const data: { message: Message } = await response.json();
      const combined = [...records.current, data.message].sort((a, b) => a.sentAt.localeCompare(b.sentAt) || a.id.localeCompare(b.id));
      records.current = [...new Map(combined.map(message => [message.id, message])).values()];
      revealAfterRender.current = id;
      setMessages(records.current);
    } catch { setError("The original announcement could not be opened."); }
  }, []);

  return <main className="live-shell" data-theme={resolvedTheme}>
    {canRunScheduledBackup && <ScheduledDeliveryCheck intervalMs={15_000} showError={false} />}
    <header className="live-header">
      <div className="live-header-row">
        <div className="live-identity">
          {avatarUrl ? <img className="live-avatar live-avatar-lg" src={avatarUrl} alt="" width={44} height={44} referrerPolicy="no-referrer" /> : <div className="live-avatar live-avatar-lg" aria-hidden="true">{botName.slice(0, 1).toUpperCase()}</div>}
          <div><LiveChannelName initialName={channelName} editable={isAdmin} /><p className="live-sub"><span className="live-dot" aria-hidden="true" />Live · {loading && !messages.length ? "loading" : `${messages.length} loaded${todayCount ? ` · ${todayCount} today` : ""}`}</p></div>
        </div>
        <div className="live-actions">
          <a href="/live/calendar" className="live-pill live-pill-link">Calendar</a>
          <a href="/report" className="live-pill">Report an issue</a>
          <LiveNotifications />
          <LiveInstall />
          {isAdmin && <a href="/admin" className="live-pill live-pill-link">Admin</a>}
        </div>
      </div>
      <div className="live-header-row live-toolbar">
        <div className="live-segmented" role="radiogroup" aria-label="Show">
          {FILTERS.map(item => <button key={item.value} type="button" role="radio" aria-checked={filter === item.value} className={filter === item.value ? "active" : undefined} onClick={() => setFilter(item.value)}>{item.label}</button>)}
        </div>
        <div className="live-toolbar-right">
          {isAdmin && <div className="live-segmented" role="radiogroup" aria-label="Visibility">
            <button type="button" role="radio" aria-checked={!showHidden} className={!showHidden ? "active" : undefined} onClick={() => setShowHidden(false)}>Visible</button>
            <button type="button" role="radio" aria-checked={showHidden} className={showHidden ? "active" : undefined} onClick={() => setShowHidden(true)}>Hidden</button>
          </div>}
          <div className="live-segmented" role="radiogroup" aria-label="Appearance">
            {THEMES.map(item => <button key={item.value} type="button" role="radio" aria-checked={theme === item.value} className={theme === item.value ? "active" : undefined} onClick={() => { setTheme(item.value); try { localStorage.setItem("announcement-live-theme", item.value); } catch {} }}>{item.label}</button>)}
          </div>
        </div>
      </div>
    </header>
    <div ref={viewport} className="live-scroll" tabIndex={0} aria-label="Sent messages, oldest first" onScroll={() => {
      const el = viewport.current!; stickBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      if (stickBottom.current) setNewMessages(false);
      if (el.scrollTop < 100 && hasOlder && !busy.current) void load("older");
    }}><div ref={content} className="live-content">
      {hasOlder && <button type="button" className="live-load live-pill" disabled={loading} onClick={() => void load("older")}>Load older messages</button>}
      {loading && !messages.length && <div className="live-skeleton" role="status" aria-label="Loading messages">{[0, 1, 2].map(index => <div key={index}><span /><div><i /><i /><i /></div></div>)}</div>}
      {error && <p className="live-status" role="alert">{error} <button type="button" className="live-pill" onClick={() => void load(retryDirection.current)}>Retry</button></p>}
      {!loading && !error && !messages.length && <div className="live-empty"><strong>Nothing here yet</strong><p>{filter === "all" ? "Announcements appear the moment they’re sent." : "No messages in this category yet. Try Everything."}</p></div>}
      {groups.map(group => <section key={group.day} className="live-day">
        <div className="live-day-divider"><span>{group.day}</span></div>
        {group.items.map(message => <article id={`live-message-${message.id}`} className={`live-message${message.hidden ? " is-hidden" : ""}${highlighted === message.id ? " is-highlighted" : ""}`} key={message.id}>
            {message.replyTo && <button type="button" className="live-reply-preview" disabled={message.replyTo.unavailable} onClick={() => void revealMessage(message.replyTo!.id)} aria-label={message.replyTo.unavailable ? "Original announcement unavailable" : `View announcement from ${message.replyTo.senderName || botName}`}>
              <span aria-hidden="true">↪</span><strong>{message.replyTo.senderName || botName}</strong><span>{message.replyTo.message ? replyExcerpt(message.replyTo.message) : "Original announcement unavailable"}</span>
            </button>}
          {(message.senderAvatarUrl || avatarUrl) ? <img className="live-avatar" src={message.senderAvatarUrl || avatarUrl!} alt="" width={40} height={40} referrerPolicy="no-referrer" /> : <div className="live-avatar" aria-hidden="true">{(message.senderName || botName).slice(0, 1).toUpperCase()}</div>}
          <div className="live-message-body">
            <div className="live-message-meta"><strong>{message.senderName || botName}</strong>{message.human ? <span className="live-human">HUMAN</span> : <span className="live-bot">BOT</span>}{message.type && <span className={`live-type live-type-${message.type}`}>{message.type === "event" ? "Event" : message.type === "reminder" ? "Reminder" : "Daily"}</span>}<time dateTime={message.sentAt} title={timestamp(message.sentAt)}>{clock(message.sentAt)}</time>
              {isAdmin && !message.hidden && <button type="button" className="live-message-action" onClick={() => {
                setReplyingTo({ id: message.id, message: message.message, senderName: message.senderName || botName });
                window.requestAnimationFrame(() => document.getElementById("quick-message")?.focus());
              }}>Reply</button>}
              {isAdmin && <button type="button" className="live-pill live-pill-sm" disabled={changing !== null} onClick={async () => {
                setChanging(message.id);
                try { await setLiveMessageHidden(message.id, !message.hidden); records.current = records.current.filter(item => item.id !== message.id); setMessages(records.current); }
                catch { setError("Could not change message visibility. Please try again."); }
                finally { setChanging(null); }
              }}>{changing === message.id ? "Saving…" : message.hidden ? "Restore" : "Hide"}</button>}</div>
            <div className="discord-preview"><DiscordMarkdown value={message.message} /></div>
            <a className="live-report-link" href={`/report?category=announcement&context=${encodeURIComponent(`Announcement ${message.id}: ${message.message.slice(0, 300)}`)}`}>Report an issue</a>
            {message.calendarDate && <div className="live-calendar-cta"><a className="live-pill live-pill-link" href="/live/calendar">View Whole Calendar</a></div>}
          </div>
        </article>)}
      </section>)}
    </div></div>
    {newMessages && <button type="button" className="live-jump" onClick={() => { stickBottom.current = true; if (viewport.current) viewport.current.scrollTop = viewport.current.scrollHeight; setNewMessages(false); }}>New messages ↓</button>}
    {isAdmin && <QuickAnnouncement destinations={destinations} compact roleId={roleId} avatarUrl={avatarUrl} replyTo={replyingTo} onCancelReply={() => setReplyingTo(null)} onSent={() => { setReplyingTo(null); setFilter("all"); setShowHidden(false); stickBottom.current = true; if (filter === "all" && !showHidden) void load("newer"); }} />}
  </main>;
}
