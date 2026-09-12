"use client";

import { useState } from "react";
import { AnnouncementPreview } from "@/components/announcement-preview";

export function AnnouncementComposer({ announcementMinimumDate, eventMinimumDate, announcementTemplate, eventTemplate }: { announcementMinimumDate: string; eventMinimumDate: string; announcementTemplate: string; eventTemplate: string }) {
  const [type, setType] = useState<"announcement" | "event">("announcement");
  const [announcement, setAnnouncement] = useState("");
  const [eventTitle, setEventTitle] = useState("");
  const [scheduledDate, setScheduledDate] = useState(announcementMinimumDate);
  const minimumDate = type === "event" ? eventMinimumDate : announcementMinimumDate;

  return (
    <>
      <div>
        <label htmlFor="type">Type</label>
        <select id="type" name="type" value={type} onChange={(event) => { const nextType = event.target.value === "event" ? "event" : "announcement"; const nextMinimum = nextType === "event" ? eventMinimumDate : announcementMinimumDate; setType(nextType); if (scheduledDate < nextMinimum) setScheduledDate(nextMinimum); }}>
          <option value="announcement">Announcement</option>
          <option value="event">Event</option>
        </select>
      </div>
      {type === "event" && <div>
        <label htmlFor="eventTitle">Event title</label>
        <input id="eventTitle" name="eventTitle" maxLength={200} required value={eventTitle} onChange={(event) => setEventTitle(event.target.value)} />
      </div>}
      <div>
        <label htmlFor="scheduledDate">{type === "event" ? "Event publish date" : "Announcement date"}</label>
        <input id="scheduledDate" name="scheduledDate" type="date" min={minimumDate} required value={scheduledDate} onChange={(event) => setScheduledDate(event.target.value)} />
        <p className="hint">{type === "event"
          ? "This is when the event announcement will be published during the 6 PM Pacific hour. It does not need to be the date of the event."
          : "This is the date the announcement is for. It will be published the previous day during the 6 PM Pacific hour."}</p>
      </div>
      <div className="template-grid">
        <div>
          <div className="field-heading"><label htmlFor="announcement">Announcement</label><span>8–1,500 characters</span></div>
          <textarea id="announcement" name="announcement" rows={10} minLength={8} maxLength={1500} required value={announcement} onChange={(event) => setAnnouncement(event.target.value)} />
          <details className="format-help">
            <summary>Discord formatting</summary>
            <p><code>#</code> heading · <code>##</code> smaller heading · <code>###</code> smallest heading · <code>-#</code> subtext</p>
            <p><code>**bold**</code> · <code>*italic*</code> · <code>__underline__</code> · <code>~~strikethrough~~</code> · <code>||spoiler||</code></p>
            <p><code>[text](https://example.com)</code> link · <code>&gt;</code> quote · <code>-</code> list · <code>1.</code> numbered list</p>
            <p><code>&gt;&gt;&gt;</code> multiline quote · <code>`code`</code> · <code>```md code block ```</code> · formatting can be combined</p>
            <p>Discord mentions, custom emoji, slash commands, channels, timestamps, and regular URLs are also previewed.</p>
            <p>Use a backslash to cancel formatting. Press Enter for a newline.</p>
          </details>
        </div>
        <AnnouncementPreview type={type} announcement={announcement} eventTitle={eventTitle} scheduledDate={scheduledDate} announcementTemplate={announcementTemplate} eventTemplate={eventTemplate} />
      </div>
    </>
  );
}
