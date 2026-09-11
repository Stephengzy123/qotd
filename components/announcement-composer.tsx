"use client";

import { useEffect, useState } from "react";
import { DiscordMarkdown } from "@/components/discord-preview";

function displayDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "selected date";
  return new Intl.DateTimeFormat("en-US", {
    month: "long", day: "numeric", timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

function applyCalendarToken(template: string, calendar: string) {
  return template.split("\n").flatMap((line) => {
    if (line.trim() === "{calendar}") return calendar ? [line.replace("{calendar}", calendar)] : [];
    return [line.replaceAll("{calendar}", calendar)];
  }).join("\n");
}

export function AnnouncementComposer({ announcementMinimumDate, eventMinimumDate, announcementTemplate, eventTemplate }: { announcementMinimumDate: string; eventMinimumDate: string; announcementTemplate: string; eventTemplate: string }) {
  const [type, setType] = useState<"announcement" | "event">("announcement");
  const [announcement, setAnnouncement] = useState("");
  const [eventTitle, setEventTitle] = useState("");
  const [scheduledDate, setScheduledDate] = useState(announcementMinimumDate);
  const [calendar, setCalendar] = useState("");
  const [calendarStatus, setCalendarStatus] = useState<"idle" | "loading" | "ready" | "unavailable">("idle");
  const minimumDate = type === "event" ? eventMinimumDate : announcementMinimumDate;
  const template = type === "event" ? eventTemplate : announcementTemplate;
  const preview = applyCalendarToken(template, type === "announcement" ? calendar : "")
    .replaceAll("{date}", displayDate(scheduledDate))
    .replaceAll("{announcement}", announcement || "Your announcement will appear here.")
    .replaceAll("{title}", eventTitle || "Event title")
    .replaceAll("{mention-role}", "<@&123456789012345678>");

  useEffect(() => {
    if (type !== "announcement" || !/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) {
      setCalendar("");
      setCalendarStatus("idle");
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setCalendarStatus("loading");
      try {
        const response = await fetch(`/api/calendar-preview?date=${encodeURIComponent(scheduledDate)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Calendar preview failed");
        const result = await response.json() as { calendar?: string };
        setCalendar(result.calendar || "");
        setCalendarStatus("ready");
      } catch (error) {
        if (controller.signal.aborted) return;
        setCalendar("");
        setCalendarStatus("unavailable");
      }
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [scheduledDate, type]);

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
        <div>
          <span className="label">Preview</span>
          <div className="discord-preview"><DiscordMarkdown value={preview} /></div>
          {type === "announcement" && calendarStatus === "loading" && <p className="hint" role="status">Checking the calendar…</p>}
          {type === "announcement" && calendarStatus === "ready" && calendar && <p className="hint" role="status">Calendar information for this date is included above.</p>}
          {type === "announcement" && calendarStatus === "unavailable" && <p className="hint" role="status">Calendar preview is temporarily unavailable. Your submission still works.</p>}
          <p className="hint">The role shown here is a placeholder. The configured role is used when sent. Discord may show a confirmation before opening masked links.</p>
        </div>
      </div>
    </>
  );
}
