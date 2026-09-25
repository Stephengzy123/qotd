import type { Metadata } from "next";
import { getSession } from "@/lib/auth";
import { dbReady } from "@/lib/db";
import { DiscordMarkdown } from "@/components/discord-preview";
import { LiveThemeShell } from "@/components/live-theme-shell";
import { PendingButton } from "@/components/pending-button";
import { editHistoryEntry, publishHistoryEntry } from "./actions";
import "../live/live.css";
import "./update-history.css";

export const metadata: Metadata = { title: "Update history | Live Announcements", robots: { index: false, follow: false }, manifest: "/live.webmanifest" };

type HistoryEntry = { id: string; title: string; body: string; published_at: Date; edited_at: Date | null };

export default async function UpdateHistoryPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [session, params, sql] = await Promise.all([getSession(), searchParams, dbReady()]);
  const entries = await sql<HistoryEntry[]>`select id, title, body, published_at, edited_at from update_history_entries order by published_at desc, id desc`;
  const isAdmin = session?.role === "admin";
  return <LiveThemeShell>
    <div className="live-feedback-inner">
      <a className="live-history-back" href="/live">← Live announcements</a>
      <header className="live-history-heading"><span className="live-update-eyebrow">Changes over time</span><h1>Update history</h1><p>What’s changed in Live Announcements and the calendar.</p></header>
      {isAdmin && <section className="panel live-history-editor" aria-labelledby="history-editor-title">
        <h2 id="history-editor-title">Add a history entry</h2>
        <p className="hint">This is separate from the Live pop-up. You can write as much as you need, using Discord Markdown.</p>
        {params.ok && <p className="live-history-success" role="status">{params.ok}</p>}
        {params.error && <p className="live-history-error" role="alert">{params.error}</p>}
        <form action={publishHistoryEntry} className="live-update-form">
          <div><label htmlFor="history-title">Title</label><input id="history-title" name="title" maxLength={120} required placeholder="What changed?" /></div>
          <div><label htmlFor="history-body">Description</label><textarea id="history-body" name="body" rows={8} required placeholder="Write the update in Discord Markdown…" /></div>
          <PendingButton className="primary" pendingText="Publishing…">Add to history</PendingButton>
        </form>
      </section>}
      <div className="live-history-list">
        {entries.length ? entries.map(entry => <article className="panel live-history-entry" key={entry.id}>
          <div className="live-history-dates"><time dateTime={entry.published_at.toISOString()}>{entry.published_at.toLocaleDateString("en-CA", { timeZone: "America/Vancouver", year: "numeric", month: "long", day: "numeric" })}</time>
            {entry.edited_at && <span>Edited {entry.edited_at.toLocaleDateString("en-CA", { timeZone: "America/Vancouver", year: "numeric", month: "long", day: "numeric" })}</span>}
          </div>
          <h2>{entry.title}</h2>
          <div className="discord-preview"><DiscordMarkdown value={entry.body} /></div>
          {isAdmin && <details className="live-history-edit"><summary>Edit entry</summary>
            <form action={editHistoryEntry} className="live-update-form">
              <input type="hidden" name="id" value={entry.id} />
              <div><label htmlFor={`history-title-${entry.id}`}>Title</label><input id={`history-title-${entry.id}`} name="title" defaultValue={entry.title} maxLength={120} required /></div>
              <div><label htmlFor={`history-body-${entry.id}`}>Description</label><textarea id={`history-body-${entry.id}`} name="body" defaultValue={entry.body} rows={8} required /></div>
              <PendingButton className="primary" pendingText="Saving…">Save changes</PendingButton>
            </form>
          </details>}
        </article>) : <div className="panel live-history-empty"><h2>No updates yet</h2><p>Check back later for changes to Live Announcements.</p></div>}
      </div>
    </div>
  </LiveThemeShell>;
}
