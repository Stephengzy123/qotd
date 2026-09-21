"use client";

import { useState } from "react";
import { AnnouncementPreview } from "@/components/announcement-preview";
import { MarkdownEditor } from "@/components/markdown-editor";
import type { AnnouncementType } from "@/lib/qotd";

type AdminEntryFieldsProps = {
  idPrefix: string;
  announcementMinimumDate: string;
  eventMinimumDate: string;
  initialType?: AnnouncementType;
  initialTitle?: string;
  initialDate?: string;
  initialOccurrenceDate?: string;
  initialOccurrenceEndDate?: string;
  initialAnnouncement?: string;
  initialDaysEarly?: number;
  announcementTemplate: string;
  eventTemplate: string;
};

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function displayDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}

export function AdminEntryFields({ idPrefix, announcementMinimumDate, eventMinimumDate, initialType = "announcement", initialTitle = "", initialDate, initialOccurrenceDate, initialOccurrenceEndDate = "", initialAnnouncement = "", initialDaysEarly = 0, announcementTemplate, eventTemplate }: AdminEntryFieldsProps) {
  const [announcement, setAnnouncement] = useState(initialAnnouncement);
  const [eventTitle, setEventTitle] = useState(initialTitle);
  const [type, setType] = useState<AnnouncementType>(initialType);
  const [scheduledDate, setScheduledDate] = useState(initialDate || (initialType === "announcement" ? announcementMinimumDate : eventMinimumDate));
  const [occurrenceDate, setOccurrenceDate] = useState(initialOccurrenceDate || initialDate || eventMinimumDate);
  const [occurrenceEndDate, setOccurrenceEndDate] = useState(initialOccurrenceEndDate);
  const [daysEarly, setDaysEarly] = useState(initialDaysEarly);
  const minimumDate = type === "announcement" ? shiftDate(announcementMinimumDate, daysEarly) : eventMinimumDate;
  const titled = type !== "announcement";
  const publishDate = scheduledDate && type === "announcement" ? shiftDate(scheduledDate, -(daysEarly + 1)) : "";
  return (
    <div className="entry-fields">
      <div><label htmlFor={`${idPrefix}-type`}>Type</label><select id={`${idPrefix}-type`} name="type" value={type} onChange={(event) => { const nextType: AnnouncementType = event.target.value === "event" ? "event" : event.target.value === "reminder" ? "reminder" : "announcement"; const nextMinimum = nextType === "announcement" ? announcementMinimumDate : eventMinimumDate; setType(nextType); if (scheduledDate < nextMinimum) setScheduledDate(nextMinimum); if (nextType === "event" && occurrenceDate < nextMinimum) setOccurrenceDate(nextMinimum); }}><option value="announcement">Announcement</option><option value="event">Event</option><option value="reminder">Reminder</option></select></div>
      {titled && <div><label htmlFor={`${idPrefix}-title`}>{type === "event" ? "Event" : "Reminder"} title</label><input id={`${idPrefix}-title`} name="eventTitle" value={eventTitle} onChange={(event) => setEventTitle(event.target.value)} maxLength={200} required />{type === "reminder" ? <p className="hint">Uses the event-style message format but never creates a calendar entry.</p> : null}</div>}
      {type === "event" && <div><label htmlFor={`${idPrefix}-occurrence-date`}>Event start date</label><input id={`${idPrefix}-occurrence-date`} name="occurrenceDate" type="date" min={scheduledDate || eventMinimumDate} value={occurrenceDate} onChange={(event) => { const value = event.target.value; setOccurrenceDate(value); if (occurrenceEndDate && occurrenceEndDate < value) setOccurrenceEndDate(value); }} required /><p className="hint">The event appears on the admin calendar starting on this date.</p></div>}
      {type === "event" && <div><label htmlFor={`${idPrefix}-occurrence-end-date`}>Event end date <span className="hint">(optional)</span></label><input id={`${idPrefix}-occurrence-end-date`} name="occurrenceEndDate" type="date" min={occurrenceDate} value={occurrenceEndDate} onChange={(event) => setOccurrenceEndDate(event.target.value)} /><p className="hint">Leave blank for a single-day event. Set an end date only for a multi-day event.</p></div>}
      {type === "announcement" && <div><label htmlFor={`${idPrefix}-days-early`}>Days early</label><input id={`${idPrefix}-days-early`} name="daysEarly" type="number" min={0} max={365} step={1} value={daysEarly} onChange={(event) => setDaysEarly(Math.min(365, Math.max(0, Number(event.target.value) || 0)))} required /><p className="hint">0 means the normal previous-evening send. 1 means two evenings before.</p></div>}
      <div><label htmlFor={`${idPrefix}-date`}>{titled ? `${type === "event" ? "Event" : "Reminder"} publish date` : "Announcement date"}</label><input id={`${idPrefix}-date`} name="scheduledDate" type="date" min={minimumDate} value={scheduledDate} onChange={(event) => { const value = event.target.value; setScheduledDate(value); if (type === "event" && occurrenceDate < value) { setOccurrenceDate(value); if (occurrenceEndDate && occurrenceEndDate < value) setOccurrenceEndDate(value); } }} required /><p className="hint">{titled ? `Published during the 6 PM Pacific hour on this date.${type === "event" ? " This does not need to be the date of the event." : " This reminder will not appear on the calendar."}` : "The date this announcement is for. Published the previous day during the 6 PM Pacific hour."}</p></div>
      {publishDate && <p className="inline-feedback" role="status">Calculated send: {displayDate(publishDate)} during the 6 PM Pacific hour.</p>}
      <div className="template-grid">
        <MarkdownEditor id={`${idPrefix}-announcement`} name="announcement" value={announcement} onChange={setAnnouncement} minLength={8} maxLength={1500} required />
        <AnnouncementPreview type={type} announcement={announcement} eventTitle={eventTitle} scheduledDate={scheduledDate} announcementTemplate={announcementTemplate} eventTemplate={eventTemplate} />
      </div>
    </div>
  );
}
