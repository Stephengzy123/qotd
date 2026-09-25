"use client";

import { useEffect, useState } from "react";
import { personalTimetableAction } from "@/app/admin/calendar/export/actions";
import { publicTimetableAction } from "@/app/live/timetable/actions";

const emptyClasses = () => Object.fromEntries([..."ABCDEFGH"].map(letter => [letter, ""]));
export const PUBLIC_TIMETABLE_STORAGE_KEY = "personal-timetable:public:v1";

function newToken() { return [...crypto.getRandomValues(new Uint8Array(32))].map(value => value.toString(16).padStart(2, "0")).join(""); }

export function PersonalTimetableExport({ storageKey, publicMode = false }: { storageKey: string; publicMode?: boolean }) {
  const [classes, setClasses] = useState(emptyClasses);
  const [token, setToken] = useState("");
  const [editToken, setEditToken] = useState("");
  const [origin, setOrigin] = useState("");
  const [busy, setBusy] = useState(true);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setOrigin(window.location.origin);
    (async () => {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored) {
          const keys = publicMode ? JSON.parse(stored) as { readToken: string; editToken: string } : { readToken: stored, editToken: "" };
          if (active) { setToken(keys.readToken); setEditToken(keys.editToken); }
          const result = publicMode ? await publicTimetableAction("load", keys.readToken, keys.editToken) : await personalTimetableAction("load", stored);
          if (!active) return;
          setToken(keys.readToken); setEditToken(keys.editToken);
          if (result.classes) { setClasses(result.classes); setSaved(true); }
          if (result.error) { setMessage(result.error); setLoadFailed(true); }
        }
      } catch { if (active) { setMessage("Browser storage or the server is unavailable. Try reloading before saving."); setLoadFailed(true); } }
      finally { if (active) setBusy(false); }
    })();
    return () => { active = false; };
  }, [storageKey, publicMode]);
  const link = saved && token ? `${origin}/api/calendar/timetable/${token}.ics` : "";
  async function save() {
    if (loadFailed) return;
    setBusy(true); setMessage("");
    try {
      // Persist before sending so a retry cannot create a second subscription.
      const nextToken = token || newToken();
      const nextEditToken = publicMode ? editToken || newToken() : "";
      localStorage.setItem(storageKey, publicMode ? JSON.stringify({ readToken: nextToken, editToken: nextEditToken }) : nextToken);
      setToken(nextToken); setEditToken(nextEditToken);
      const result = publicMode ? await publicTimetableAction("save", nextToken, nextEditToken, classes) : await personalTimetableAction("save", nextToken, classes);
      if (result.error) setMessage(result.error);
      else { setSaved(true); setMessage("Saved. Your subscription link stays the same; calendar apps refresh on their own schedule."); }
    } catch { setMessage("Could not save. Enable browser storage and try again."); }
    finally { setBusy(false); }
  }
  async function reset() {
    if (!window.confirm(token ? "Revoke this subscription? Existing subscribers will stop receiving updates. You will need to subscribe to the new link after saving again." : "Forget this browser's invalid link? If an older subscription still exists, this will not revoke it.")) return;
    setBusy(true);
    try {
      const result = token ? publicMode ? await publicTimetableAction("revoke", token, editToken) : await personalTimetableAction("revoke", token) : {};
      if (result.error) { setMessage(result.error); return; }
      localStorage.removeItem(storageKey); setToken(""); setEditToken(""); setSaved(false); setLoadFailed(false); setMessage("Old link revoked. Save to create a new one.");
    } catch { setMessage("Could not reset. Please try again."); }
    finally { setBusy(false); }
  }
  return <div className="panel personal-timetable-export">
    <form onSubmit={event => { event.preventDefault(); void save(); }}>
      <fieldset disabled={busy}><legend>Classes by block</legend><div className="personal-class-grid">{[..."ABCDEFGH"].map(letter => <div className="personal-class-fields" key={letter}><label>Block {letter}<input maxLength={100} value={classes[letter]} placeholder={`Class for ${letter} (optional)`} onChange={event => setClasses(previous => ({ ...previous, [letter]: event.target.value }))} /></label><label>Room for {letter} (optional)<input maxLength={60} value={classes[`room:${letter}`] || ""} placeholder="e.g. T215" onChange={event => setClasses(previous => ({ ...previous, [`room:${letter}`]: event.target.value }))} /></label></div>)}</div>
        <p className="hint">Rooms appear as “Course (Room)” and in the calendar event’s location. Existing course names are kept as entered; an identical room suffix will not be added twice.</p>
        <p className="hint">Blank classes appear as “Block A”, etc. One remembered timetable per browser{publicMode ? "" : " and admin account"}. Clearing browser storage loses the remembered link, but does not revoke existing subscriptions.</p>
        {publicMode && <p className="hint">This is not an official school calendar. It reflects normal school days and imported rotations for one semester at a time, not both semesters together. School schedule changes may not appear here.</p>}
        <button type="submit" className="primary" disabled={loadFailed}>{busy ? "Working…" : saved ? "Save changes" : "Create subscription link"}</button> <button type="button" className="secondary" onClick={reset} disabled={!token && !loadFailed}>Revoke / reset link</button>
      </fieldset>
    </form>
    {message && <p role="status">{message}</p>}
    {link && <div className="personal-export-link"><label>Personal subscription link<input readOnly value={link} onFocus={event => event.target.select()} /></label><div className="form-actions"><button type="button" className="secondary" onClick={async () => { try { await navigator.clipboard.writeText(link); setMessage("Link copied."); } catch { setMessage("Select the link above and copy it manually."); } }}>Copy link</button><a className="secondary" href={link.replace(/^https?:/, "webcal:")}>Subscribe</a><a className="secondary" href={link} download="my-timetable.ics">Download .ics</a></div>
      <p className="hint">Anyone with this secret link can read your class names and timetable. Subscribe by URL for automatic updates; downloading is only a snapshot. Class names are stored on the server to keep the subscription working when your browser is closed.</p></div>}
  </div>;
}
