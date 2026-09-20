"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CalendarEvent } from "@/lib/calendar";

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

export function LiveCalendar({ events, today }: { events: CalendarEvent[]; today: string }) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(today.slice(0, 7));
  const popup = useRef<HTMLDivElement>(null);
  const byDate = useMemo(() => new Map(events.reduce<[string, string[]][]>((all, event) => {
    const entry = all.find(([date]) => date === event.date);
    if (entry) entry[1].push(event.title); else all.push([event.date, [event.title]]);
    return all;
  }, [])), [events]);
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
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => { if (!popup.current?.contains(event.target as Node)) setOpen(false); };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("pointerdown", onPointerDown); window.removeEventListener("keydown", onKeyDown); };
  }, [open]);

  return <div className="live-calendar" ref={popup}>
    <button type="button" className="live-pill" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((visible) => !visible)}>Calendar</button>
    {open && <section className="live-calendar-popover" role="dialog" aria-label="Imported calendar events">
      <div className="live-calendar-title"><button type="button" aria-label="Previous month" onClick={() => setMonth((value) => moveMonth(value, -1))}>‹</button><strong>{monthLabel(month)}</strong><button type="button" aria-label="Next month" onClick={() => setMonth((value) => moveMonth(value, 1))}>›</button></div>
      <div className="live-calendar-weekdays" aria-hidden="true">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day}>{day}</span>)}</div>
      <div className="live-calendar-grid">{cells.map((cell) => {
        const titles = byDate.get(cell.value) || [];
        return <div key={cell.value} className={`live-calendar-day${cell.current ? "" : " outside"}${cell.value === today ? " today" : ""}`}><time dateTime={cell.value}>{cell.day}</time>{titles.slice(0, 2).map((title) => <span key={title} title={title}>{title}</span>)}{titles.length > 2 && <small>+{titles.length - 2}</small>}</div>;
      })}</div>
      {!events.length && <p className="live-calendar-empty">No imported events are available for these months.</p>}
    </section>}
  </div>;
}
