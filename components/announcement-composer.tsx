"use client";

import { useEffect, useRef, useState } from "react";
import { AnnouncementPreview } from "@/components/announcement-preview";
import { MarkdownEditor } from "@/components/markdown-editor";
import { PendingButton } from "@/components/pending-button";

type ComposerProps = { announcementMinimumDate: string; eventMinimumDate: string; announcementTemplate: string; eventTemplate: string };

const MIN_LENGTH = 8;
const MAX_LENGTH = 1500;

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function longDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "the selected date";
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}

export function AnnouncementComposer({ announcementMinimumDate, eventMinimumDate, announcementTemplate, eventTemplate }: ComposerProps) {
  const [type, setType] = useState<"announcement" | "event">("announcement");
  const [announcement, setAnnouncement] = useState("");
  const [eventTitle, setEventTitle] = useState("");
  const [scheduledDate, setScheduledDate] = useState(announcementMinimumDate);
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);
  const minimumDate = type === "event" ? eventMinimumDate : announcementMinimumDate;
  const length = announcement.length;
  const tooShort = length < MIN_LENGTH;
  const sendDate = type === "event" ? scheduledDate : /^\d{4}-\d{2}-\d{2}$/.test(scheduledDate) ? shiftDate(scheduledDate, -1) : "";
  const ready = !tooShort && length <= MAX_LENGTH && confirmed && (type !== "event" || eventTitle.trim().length > 0) && /^\d{4}-\d{2}-\d{2}$/.test(scheduledDate);

  function chooseType(next: "announcement" | "event") {
    const nextMinimum = next === "event" ? eventMinimumDate : announcementMinimumDate;
    setType(next);
    if (scheduledDate < nextMinimum) setScheduledDate(nextMinimum);
  }

  useEffect(() => {
    // ⌘/Ctrl+Enter submits from anywhere in the composer.
    const root = formRef.current;
    if (!root) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        root.closest("form")?.requestSubmit();
      }
    };
    root.addEventListener("keydown", onKeyDown);
    return () => root.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="composer" ref={formRef}>
      <div className="composer-main">
        <div className="composer-row">
          <div className="segmented" role="radiogroup" aria-label="Type">
            <label className={type === "announcement" ? "active" : undefined}><input type="radio" name="type" value="announcement" checked={type === "announcement"} onChange={() => chooseType("announcement")} />Announcement</label>
            <label className={type === "event" ? "active" : undefined}><input type="radio" name="type" value="event" checked={type === "event"} onChange={() => chooseType("event")} />Event</label>
          </div>
          <div className="composer-date">
            <label htmlFor="scheduledDate">{type === "event" ? "Publish on" : "Announcement date"}</label>
            <input id="scheduledDate" name="scheduledDate" type="date" min={minimumDate} required value={scheduledDate} onChange={(event) => setScheduledDate(event.target.value)} />
          </div>
        </div>
        <p className="composer-caption" role="status">
          {type === "event"
            ? <>Publishes {sendDate ? <strong>{longDate(sendDate)}</strong> : "on the chosen date"} during the 6 PM Pacific hour. This doesn't need to be the day of the event.</>
            : <>For <strong>{longDate(scheduledDate)}</strong> · goes out the evening before, {sendDate ? <strong>{longDate(sendDate)}</strong> : "the previous day"} at 6 PM Pacific.</>}
        </p>
        {type === "event" && <div>
          <label htmlFor="eventTitle">Event title</label>
          <input id="eventTitle" name="eventTitle" maxLength={200} required value={eventTitle} onChange={(event) => setEventTitle(event.target.value)} placeholder="What's the event called?" autoFocus />
        </div>}
        <MarkdownEditor id="announcement" name="announcement" value={announcement} onChange={setAnnouncement} minLength={MIN_LENGTH} maxLength={MAX_LENGTH} required rows={12} heading={<div className="field-heading"><label htmlFor="announcement">Message</label><span className={length > MAX_LENGTH ? "count over" : tooShort && length > 0 ? "count under" : "count"}>{length.toLocaleString()} / {MAX_LENGTH.toLocaleString()}</span></div>} />
        {showNote
          ? <div><label htmlFor="note">Note for the reviewer <span className="muted">(optional)</span></label><textarea id="note" name="note" rows={2} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Context the admin should know before approving" autoFocus /></div>
          : <button type="button" className="text-button composer-add-note" onClick={() => setShowNote(true)}>+ Add a note for the reviewer</button>}
      </div>

      <aside className="composer-preview">
        <AnnouncementPreview type={type} announcement={announcement} eventTitle={eventTitle} scheduledDate={scheduledDate} announcementTemplate={announcementTemplate} eventTemplate={eventTemplate} />
      </aside>

      <div className="form-footer composer-footer">
        <label className="duplicate-confirmation"><input type="checkbox" name="checkedAnnouncements" value="yes" required checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>I checked the scheduled and recently sent announcements on this page — this doesn't repeat them.</span></label>
        <div className="composer-submit">
          <span className="hint">{ready ? "⌘/Ctrl+Enter to submit" : tooShort ? `Write at least ${MIN_LENGTH} characters` : !confirmed ? "Confirm it isn't a repeat" : type === "event" && !eventTitle.trim() ? "Add an event title" : "Check the date"}</span>
          <PendingButton type="submit" className="primary" pendingText="Submitting…" disabled={!ready}>Submit for review</PendingButton>
        </div>
      </div>
    </div>
  );
}
