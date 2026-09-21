"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AdminCalendarEvent } from "@/lib/admin-calendar";

function dateValue(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month, day, 12)).toISOString().slice(0, 10);
}

function moveMonth(value: string, by: number) {
  const [year, month] = value.split("-").map(Number);
  return dateValue(year, month - 1 + by, 1).slice(0, 7);
}

function monthLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}-01T12:00:00Z`));
}

function fullDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}

export function AdminCalendar({ events, today, rangeStart, rangeEnd }: { events: AdminCalendarEvent[]; today: string; rangeStart: string; rangeEnd: string }) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState<AdminCalendarEvent | null>(null);
  const dialog = useRef<HTMLElement>(null);
  const byDate = useMemo(() => {
    const grouped = new Map<string, AdminCalendarEvent[]>();
    for (const event of events) grouped.set(event.date, [...(grouped.get(event.date) || []), event]);
    return grouped;
  }, [events]);
  const cells = useMemo(() => {
    const [year, monthNumber] = month.split("-").map(Number);
    const first = new Date(Date.UTC(year, monthNumber - 1, 1, 12));
    const start = new Date(first);
    start.setUTCDate(1 - first.getUTCDay());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setUTCDate(start.getUTCDate() + index);
      return { value: date.toISOString().slice(0, 10), day: date.getUTCDate(), current: date.getUTCMonth() === monthNumber - 1 };
    });
  }, [month]);
  useEffect(() => {
    if (!selected) return;
    dialog.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setSelected(null); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected]);
  const previous = moveMonth(month, -1);
  const next = moveMonth(month, 1);

  return <>
    <div className="admin-calendar panel">
      <div className="admin-calendar-toolbar">
        <div><strong>{monthLabel(month)}</strong><span>{events.length} calendar entries loaded</span></div>
        <div>
          <button type="button" className="secondary" disabled={previous < rangeStart.slice(0, 7)} onClick={() => setMonth(previous)} aria-label="Previous month">‹</button>
          <button type="button" className="secondary" onClick={() => setMonth(today.slice(0, 7))}>Today</button>
          <button type="button" className="secondary" disabled={next > rangeEnd.slice(0, 7)} onClick={() => setMonth(next)} aria-label="Next month">›</button>
        </div>
      </div>
      <div className="admin-calendar-scroll">
        <div className="admin-calendar-inner">
          <div className="admin-calendar-weekdays" aria-hidden="true">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day}>{day}</span>)}</div>
          <div className="admin-calendar-grid">{cells.map((cell) => <div key={cell.value} className={`admin-calendar-day${cell.current ? "" : " outside"}${cell.value === today ? " today" : ""}`}>
            <time dateTime={cell.value}>{cell.day}</time>
            <div className="admin-calendar-events">{(byDate.get(cell.value) || []).map((event) => <button key={event.id} type="button" className={`calendar-event ${event.kind}`} onClick={() => setSelected(event)}>{event.title}</button>)}</div>
          </div>)}</div>
        </div>
      </div>
        <div className="admin-calendar-legend"><span><i className="imported" />Imported</span><span><i className="announcement" />Announcement event</span><span><i className="manual" />Calendar-only event</span><span><i className="lunch" />Lunch</span></div>
    </div>
    {selected ? <div className="calendar-detail-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
      <section ref={dialog} className="calendar-detail panel" role="dialog" aria-modal="true" aria-labelledby="calendar-detail-title" tabIndex={-1}>
        <div className="calendar-detail-heading"><div><span className={`status calendar-${selected.kind}`}>{selected.kind === "announcement" ? "Announcement event" : selected.kind === "manual" ? "Calendar-only event" : selected.kind === "lunch" ? "Lunch menu" : "Imported event"}</span><h2 id="calendar-detail-title">{selected.title}</h2><p>{fullDate(selected.date)}</p></div><button type="button" className="secondary" onClick={() => setSelected(null)} aria-label="Close">×</button></div>
        {selected.details && <p className="calendar-detail-copy">{selected.details}</p>}
        {selected.items && <div className="lunch-detail-list">{selected.items.map((item, index) => <div key={`${item.category}-${index}`}><strong>{item.category}</strong><span>{item.dish}</span></div>)}</div>}
        {selected.meta && <p className="hint">{selected.meta}</p>}
      </section>
    </div> : null}
  </>;
}
