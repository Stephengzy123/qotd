"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
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
  const [searchOpen, setSearchOpen] = useState(false), [searchInput, setSearchInput] = useState(""), [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Message[]>([]), [searchHasMore, setSearchHasMore] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false), [searchError, setSearchError] = useState("");
  const [loading, setLoading] = useState(true), [error, setError] = useState(""), [newMessages, setNewMessages] = useState(false);
  const [replyingTo, setReplyingTo] = useState<QuickReplyTarget | null>(null), [highlighted, setHighlighted] = useState<string | null>(null);
  const viewport = useRef<HTMLDivElement>(null), content = useRef<HTMLDivElement>(null), searchField = useRef<HTMLInputElement>(null), searchToggle = useRef<HTMLButtonElement>(null);
  const records = useRef<Message[]>([]), busy = useRef(false), generation = useRef(0), stickBottom = useRef(true);
  const searchRecords = useRef<Message[]>([]), searchBusy = useRef(false), searchGeneration = useRef(0);
  const scrollChange = useRef<{ height: number; top: number } | "bottom" | null>(null);
  const revealAfterRender = useRef<string | null>(null);
  const retryDirection = useRef<"initial" | "older" | "newer">("initial");
  const moreMenu = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (moreMenu.current && !moreMenu.current.contains(event.target as Node)) moreMenu.current.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && moreMenu.current?.open) {
        moreMenu.current.open = false;
        moreMenu.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); };
  }, []);

  useEffect(() => { try { const saved = localStorage.getItem("announcement-live-theme"); if (saved && ["system", "light", "dark"].includes(saved)) setTheme(saved); } catch {} }, []);
  useEffect(() => { if (searchOpen) searchField.current?.focus(); }, [searchOpen]);
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
  const loadSearch = useCallback(async (older = false) => {
    if (!searchQuery || searchBusy.current) return;
    searchBusy.current = true;
    const version = searchGeneration.current;
    setSearchLoading(true);
    try {
      const params = new URLSearchParams({ type: filter, search: searchQuery });
      if (isAdmin && showHidden) params.set("hidden", "true");
      if (older && searchRecords.current.length) params.set("before", searchRecords.current[searchRecords.current.length - 1].cursor);
      const response = await fetch(`/api/live?${params}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Search is unavailable. Please try again.");
      const page: Page = await response.json();
      if (version !== searchGeneration.current) return;
      searchRecords.current = older ? [...searchRecords.current, ...page.messages] : page.messages;
      setSearchResults(searchRecords.current);
      setSearchHasMore(page.hasMore);
      setSearchError("");
    } catch (err) {
      if (version === searchGeneration.current) setSearchError(err instanceof Error ? err.message : "Search is unavailable.");
    } finally {
      if (version === searchGeneration.current) { searchBusy.current = false; setSearchLoading(false); }
    }
  }, [filter, isAdmin, searchQuery, showHidden]);
  useEffect(() => {
    searchGeneration.current++;
    searchBusy.current = false;
    searchRecords.current = [];
    setSearchResults([]);
    setSearchHasMore(false);
    setSearchError("");
    if (searchQuery) {
      stickBottom.current = false;
      scrollChange.current = null;
      if (viewport.current) viewport.current.scrollTop = 0;
      void loadSearch();
    }
    return () => { searchGeneration.current++; };
  }, [loadSearch, searchQuery]);
  useLayoutEffect(() => {
    if (searchQuery) return;
    const el = viewport.current, change = scrollChange.current;
    if (el && change) el.scrollTop = change === "bottom" ? el.scrollHeight : change.top + el.scrollHeight - change.height;
    scrollChange.current = null;
  }, [messages, searchQuery]);
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
    const observer = new ResizeObserver(() => { if (!searchQuery && stickBottom.current && viewport.current) viewport.current.scrollTop = viewport.current.scrollHeight; });
    observer.observe(content.current);
    return () => observer.disconnect();
  }, [searchQuery]);

  const searching = Boolean(searchQuery);
  const visibleMessages = searching ? searchResults : messages;
  const todayCount = messages.filter(message => dayOf(message.sentAt) === "Today").length;
  const groups = visibleMessages.reduce<{ day: string; items: Message[] }[]>((list, message) => {
    const day = dayOf(message.sentAt);
    const last = list[list.length - 1];
    if (last && last.day === day) last.items.push(message); else list.push({ day, items: [message] });
    return list;
  }, []);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = searchInput.trim();
    if (query === searchQuery && query) { searchGeneration.current++; searchBusy.current = false; searchRecords.current = []; setSearchResults([]); void loadSearch(); }
    else setSearchQuery(query);
  }
  function closeSearch() {
    setSearchOpen(false);
    setSearchInput("");
    setSearchQuery("");
    searchToggle.current?.focus();
  }

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
      if (searchQuery) { setSearchInput(""); setSearchQuery(""); }
    } catch { setError("The original announcement could not be opened."); }
  }, [searchQuery]);

  return <main className="live-shell" data-theme={resolvedTheme}>
    {canRunScheduledBackup && <ScheduledDeliveryCheck intervalMs={15_000} showError={false} />}
    <header className="live-header">
      <div className="live-header-row">
        <div className="live-identity">
          {avatarUrl ? <img className="live-avatar live-avatar-lg" src={avatarUrl} alt="" width={44} height={44} referrerPolicy="no-referrer" /> : <div className="live-avatar live-avatar-lg" aria-hidden="true">{botName.slice(0, 1).toUpperCase()}</div>}
          <div><LiveChannelName initialName={channelName} editable={isAdmin} /><p className="live-sub"><span className="live-dot" aria-hidden="true" />Live · {loading && !messages.length ? "loading" : `${messages.length} loaded${todayCount ? ` · ${todayCount} today` : ""}`}</p></div>
        </div>
        <button type="button" className="live-pill live-theme-cycle" title="Cycle appearance: Auto → Light → Dark" aria-label={`Appearance: ${THEMES.find(item => item.value === theme)?.label}. Switch to ${THEMES[(THEMES.findIndex(item => item.value === theme) + 1) % THEMES.length].label}`} onClick={() => {
          const next = THEMES[(THEMES.findIndex(item => item.value === theme) + 1) % THEMES.length].value;
          setTheme(next); try { localStorage.setItem("announcement-live-theme", next); } catch {}
        }}><span aria-hidden="true">{theme === "system" ? "◐" : theme === "light" ? "☀" : "☾"}</span>{THEMES.find(item => item.value === theme)?.label}</button>
      </div>
      <div className="live-header-row live-toolbar">
        <select className="live-filter-select" aria-label="Filter messages" value={filter} onChange={event => setFilter(event.target.value)}>
          {FILTERS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <div className="live-segmented live-filter-tabs" role="radiogroup" aria-label="Show">
          {FILTERS.map(item => <button key={item.value} type="button" role="radio" aria-checked={filter === item.value} className={filter === item.value ? "active" : undefined} onClick={() => setFilter(item.value)}>{item.label}</button>)}
        </div>
        <div className="live-toolbar-right">
          <button ref={searchToggle} type="button" className={`live-pill live-search-toggle${searchOpen ? " active" : ""}`} title={searchOpen ? "Close search" : "Search announcements"} aria-label={searchOpen ? "Close search" : "Search announcements"} aria-expanded={searchOpen} aria-controls={searchOpen ? "live-search-form" : undefined} onClick={() => searchOpen ? closeSearch() : setSearchOpen(true)}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5" /></svg></button>
          <a href="/live/calendar" className="live-pill live-pill-link">Calendar</a>
          <details className="live-more" ref={moreMenu}>
            <summary className="live-pill">More <span aria-hidden="true">▾</span></summary>
            <div className="live-more-panel">
              <LiveNotifications />
              <LiveInstall />
              <a href="/live/report" className="live-pill">Report an issue</a>
              <a href="/live/suggest" className="live-pill">Suggest a feature</a>
              {isAdmin && <a href="/admin" className="live-pill">Admin</a>}
            </div>
          </details>
          {isAdmin && <div className="live-segmented" role="radiogroup" aria-label="Visibility">
            <button type="button" role="radio" aria-checked={!showHidden} className={!showHidden ? "active" : undefined} onClick={() => setShowHidden(false)}>Visible</button>
            <button type="button" role="radio" aria-checked={showHidden} className={showHidden ? "active" : undefined} onClick={() => setShowHidden(true)}>Hidden</button>
          </div>}
        </div>
      </div>
      {searchOpen && <form id="live-search-form" className="live-search" role="search" onSubmit={submitSearch} onKeyDown={event => { if (event.key === "Escape") closeSearch(); }}>
        <input ref={searchField} id="live-search-input" aria-label="Search announcements" type="search" value={searchInput} maxLength={100} placeholder="Search announcements" onChange={event => setSearchInput(event.target.value)} />
        <button type="submit" className="live-pill">Search</button>
        {searching && <button type="button" className="live-pill" onClick={() => { setSearchInput(""); setSearchQuery(""); }}>Clear</button>}
      </form>}
    </header>
    <div ref={viewport} className="live-scroll" tabIndex={0} aria-label={searching ? "Announcement search results" : "Sent messages, oldest first"} onScroll={() => {
      const el = viewport.current!; stickBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      if (stickBottom.current) setNewMessages(false);
      if (!searching && el.scrollTop < 100 && hasOlder && !busy.current) void load("older");
    }}><div ref={content} className="live-content">
      {!searching && hasOlder && <button type="button" className="live-load live-pill" disabled={loading} onClick={() => void load("older")}>Load older messages</button>}
      {searching && !searchError && <p className="live-search-summary" role="status">{searchLoading && !searchResults.length ? "Searching…" : `${searchResults.length} ${searchResults.length === 1 ? "result" : "results"}${searchHasMore ? " so far" : ""} for “${searchQuery}”`}</p>}
      {!searching && loading && !messages.length && <div className="live-skeleton" role="status" aria-label="Loading messages">{[0, 1, 2].map(index => <div key={index}><span /><div><i /><i /><i /></div></div>)}</div>}
      {searching ? searchError && <p className="live-status" role="alert">{searchError} <button type="button" className="live-pill" onClick={() => void loadSearch(Boolean(searchResults.length))}>Retry</button></p> : error && <p className="live-status" role="alert">{error} <button type="button" className="live-pill" onClick={() => void load(retryDirection.current)}>Retry</button></p>}
      {searching ? !searchLoading && !searchError && !searchResults.length && <div className="live-empty"><strong>No matches found</strong><p>Try a different word or choose Everything.</p></div> : !loading && !error && !messages.length && <div className="live-empty"><strong>Nothing here yet</strong><p>{filter === "all" ? "Announcements appear the moment they’re sent." : "No messages in this category yet. Try Everything."}</p></div>}
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
            <div className="discord-preview"><DiscordMarkdown value={message.message} highlight={searching ? searchQuery : ""} /></div>
            <a className="live-report-flag" title="Report an issue" aria-label="Report an issue with this message" href={`/live/report?category=announcement&context=${encodeURIComponent(`Announcement ${message.id}: ${message.message.slice(0, 300)}`)}`}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 21V3m0 1c5-4 9 4 14 0v10c-5 4-9-4-14 0" /></svg></a>
            {message.calendarDate && <div className="live-calendar-cta"><a className="live-pill live-pill-link" href="/live/calendar">View Whole Calendar</a></div>}
          </div>
        </article>)}
      </section>)}
      {searching && searchHasMore && <button type="button" className="live-load live-pill" disabled={searchLoading} onClick={() => void loadSearch(true)}>{searchLoading ? "Loading…" : "More results"}</button>}
    </div></div>
    {!searching && newMessages && <button type="button" className="live-jump" onClick={() => { stickBottom.current = true; if (viewport.current) viewport.current.scrollTop = viewport.current.scrollHeight; setNewMessages(false); }}>New messages ↓</button>}
    {isAdmin && <QuickAnnouncement destinations={destinations} compact roleId={roleId} avatarUrl={avatarUrl} replyTo={replyingTo} onCancelReply={() => setReplyingTo(null)} onSent={() => { setReplyingTo(null); setFilter("all"); setShowHidden(false); stickBottom.current = true; if (filter === "all" && !showHidden) void load("newer"); }} />}
  </main>;
}
