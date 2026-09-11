"use client";

import { useState } from "react";
import type { AnnouncementType } from "@/lib/qotd";

type AdminEntryFieldsProps = {
  idPrefix: string;
  announcementMinimumDate: string;
  eventMinimumDate: string;
  initialType?: AnnouncementType;
  initialTitle?: string;
  initialDate?: string;
  initialAnnouncement?: string;
};

export function AdminEntryFields({ idPrefix, announcementMinimumDate, eventMinimumDate, initialType = "announcement", initialTitle = "", initialDate, initialAnnouncement = "" }: AdminEntryFieldsProps) {
  const [type, setType] = useState<AnnouncementType>(initialType);
  const [scheduledDate, setScheduledDate] = useState(initialDate || (initialType === "event" ? eventMinimumDate : announcementMinimumDate));
  const minimumDate = type === "event" ? eventMinimumDate : announcementMinimumDate;
  return (
    <div className="entry-fields">
      <div><label htmlFor={`${idPrefix}-type`}>Type</label><select id={`${idPrefix}-type`} name="type" value={type} onChange={(event) => { const nextType = event.target.value === "event" ? "event" : "announcement"; const nextMinimum = nextType === "event" ? eventMinimumDate : announcementMinimumDate; setType(nextType); if (scheduledDate < nextMinimum) setScheduledDate(nextMinimum); }}><option value="announcement">Announcement</option><option value="event">Event</option></select></div>
      {type === "event" && <div><label htmlFor={`${idPrefix}-title`}>Event title</label><input id={`${idPrefix}-title`} name="eventTitle" defaultValue={initialTitle} maxLength={200} required /></div>}
      <div><label htmlFor={`${idPrefix}-date`}>{type === "event" ? "Event publish date" : "Announcement date"}</label><input id={`${idPrefix}-date`} name="scheduledDate" type="date" min={minimumDate} value={scheduledDate} onChange={(event) => setScheduledDate(event.target.value)} required /><p className="hint">{type === "event" ? "Published during the 6 PM Pacific hour on this date. This does not need to be the date of the event." : "The date this announcement is for. Published the previous day during the 6 PM Pacific hour."}</p></div>
      <div><label htmlFor={`${idPrefix}-announcement`}>Announcement</label><textarea id={`${idPrefix}-announcement`} name="announcement" defaultValue={initialAnnouncement} rows={6} minLength={8} maxLength={1500} required /></div>
    </div>
  );
}
