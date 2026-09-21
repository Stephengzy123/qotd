"use client";

import { useState } from "react";
import { AnnouncementPreview } from "@/components/announcement-preview";
import { MarkdownEditor } from "@/components/markdown-editor";

export function AnnouncementComposer({ announcementMinimumDate, eventMinimumDate, announcementTemplate, eventTemplate }: { announcementMinimumDate: string; eventMinimumDate: string; announcementTemplate: string; eventTemplate: string }) {
  const [type, setType] = useState<"announcement" | "event" | "reminder">("announcement");
  const [announcement, setAnnouncement] = useState("");
  const [eventTitle, setEventTitle] = useState("");
  const [scheduledDate, setScheduledDate] = useState(announcementMinimumDate);
  const [occurrenceDate, setOccurrenceDate] = useState(eventMinimumDate);
  const [occurrenceEndDate, setOccurrenceEndDate] = useState("");
  const minimumDate = type === "announcement" ? announcementMinimumDate : eventMinimumDate;
  const titled = type !== "announcement";

  return (
    <>
      <div>
        <label htmlFor="type">Type</label>
        <select id="type" name="type" value={type} onChange={(event) => { const nextType = event.target.value === "event" ? "event" : event.target.value === "reminder" ? "reminder" : "announcement"; const nextMinimum = nextType === "announcement" ? announcementMinimumDate : eventMinimumDate; setType(nextType); if (scheduledDate < nextMinimum) setScheduledDate(nextMinimum); if (nextType === "event" && occurrenceDate < nextMinimum) setOccurrenceDate(nextMinimum); }}>
          <option value="announcement">Announcement</option>
          <option value="event">Event</option>
          <option value="reminder">Reminder</option>
        </select>
      </div>
      {titled && <div>
        <label htmlFor="eventTitle">{type === "event" ? "Event" : "Reminder"} title</label>
        <input id="eventTitle" name="eventTitle" maxLength={200} required value={eventTitle} onChange={(event) => setEventTitle(event.target.value)} />
        {type === "reminder" ? <p className="hint">Reminders use the event-style message format but never create a calendar entry.</p> : null}
      </div>}
      {type === "event" && <div>
        <label htmlFor="occurrenceDate">Event start date</label>
        <input id="occurrenceDate" name="occurrenceDate" type="date" min={scheduledDate || eventMinimumDate} required value={occurrenceDate} onChange={(event) => { const value = event.target.value; setOccurrenceDate(value); if (occurrenceEndDate && occurrenceEndDate < value) setOccurrenceEndDate(value); }} />
        <p className="hint">The event appears on the admin calendar starting on this date.</p>
      </div>}
      {type === "event" && <div>
        <label htmlFor="occurrenceEndDate">Event end date <span className="hint">(optional)</span></label>
        <input id="occurrenceEndDate" name="occurrenceEndDate" type="date" min={occurrenceDate} value={occurrenceEndDate} onChange={(event) => setOccurrenceEndDate(event.target.value)} />
        <p className="hint">Leave blank for a single-day event. Set an end date only for a multi-day event.</p>
      </div>}
      <div>
        <label htmlFor="scheduledDate">{titled ? `${type === "event" ? "Event" : "Reminder"} publish date` : "Announcement date"}</label>
        <input id="scheduledDate" name="scheduledDate" type="date" min={minimumDate} required value={scheduledDate} onChange={(event) => { const value = event.target.value; setScheduledDate(value); if (type === "event" && occurrenceDate < value) { setOccurrenceDate(value); if (occurrenceEndDate && occurrenceEndDate < value) setOccurrenceEndDate(value); } }} />
        <p className="hint">{titled
          ? `This is when the ${type} will be published during the 6 PM Pacific hour.${type === "event" ? " It does not need to be the date of the event." : " It will not be added to the calendar."}`
          : "This is the date the announcement is for. It will be published the previous day during the 6 PM Pacific hour."}</p>
      </div>
      <div className="template-grid">
        <MarkdownEditor id="announcement" name="announcement" value={announcement} onChange={setAnnouncement} minLength={8} maxLength={1500} required heading={<div className="field-heading"><label htmlFor="announcement">Announcement</label><span>8–1,500 characters</span></div>} />
        <AnnouncementPreview type={type} announcement={announcement} eventTitle={eventTitle} scheduledDate={scheduledDate} announcementTemplate={announcementTemplate} eventTemplate={eventTemplate} />
      </div>
    </>
  );
}
