"use client";

import { useState } from "react";
import { DiscordMarkdown } from "@/components/discord-preview";

function displayDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "selected date";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

export function AnnouncementComposer({ minimumDate }: { minimumDate: string }) {
  const [announcement, setAnnouncement] = useState("");
  const [scheduledDate, setScheduledDate] = useState(minimumDate);
  const preview = `# Announcements for ${displayDate(scheduledDate)}\n\n${announcement || "Your announcement will appear here."}\n\n-# <@&123456789012345678>`;

  return (
    <>
      <div>
        <label htmlFor="scheduledDate">Posting date</label>
        <input id="scheduledDate" name="scheduledDate" type="date" min={minimumDate} required value={scheduledDate} onChange={(event) => setScheduledDate(event.target.value)} />
        <p className="hint">Pacific date. It must be after today.</p>
      </div>
      <div className="template-grid">
        <div>
          <div className="field-heading"><label htmlFor="announcement">Announcement</label><span>8–1,500 characters</span></div>
          <textarea id="announcement" name="announcement" rows={10} minLength={8} maxLength={1500} required value={announcement} onChange={(event) => setAnnouncement(event.target.value)} />
          <details className="format-help">
            <summary>Discord formatting</summary>
            <p><code>#</code> heading · <code>##</code> smaller heading · <code>###</code> smallest heading · <code>-#</code> subtext</p>
            <p><code>**bold**</code> · <code>__underline__</code> · <code>*italic*</code> · <code>||spoiler||</code> · <code>`code`</code> · <code>```md code block ```</code></p>
            <p>Use a backslash to cancel formatting. Press Enter for a newline.</p>
          </details>
        </div>
        <div>
          <span className="label">Preview</span>
          <div className="discord-preview"><DiscordMarkdown value={preview} /></div>
          <p className="hint">The role shown here is a placeholder. The configured role is used when sent.</p>
        </div>
      </div>
    </>
  );
}
