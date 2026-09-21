"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

function dayLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}

export function LiveCalendar({ events, today }: { events: CalendarEvent[]; today: string }) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(today.slice(0, 7));
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLElement>(null);
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
  const mobileDays = useMemo(() => cells.filter((cell) => cell.current && (byDate.get(cell.value)?.length || cell.value === today)), [byDate, cells, today]);

  useEffect(() => {
    if (!open) return;
    popup.current?.focus();
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!popup.current?.contains(target) && !trigger.current?.contains(target)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("pointerdown", onPointerDown); window.removeEventListener("keydown", onKeyDown); };
  }, [open]);

  return <div className="live-calendar">
    <button ref={trigger} type="button" className="live-pill" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((visible) => !visible)}>Calendar</button>
    {open && typeof document !== "undefined" && createPortal(<div className="live-calendar-backdrop">
      <section ref={popup} className="live-calendar-popover" role="dialog" aria-modal="true" aria-label="Imported calendar events" tabIndex={-1}>
        <div className="live-calendar-title">
          <strong>{monthLabel(month)}</strong>
          <div className="live-calendar-title-actions">
            <button type="button" aria-label="Previous month" onClick={() => setMonth((value) => moveMonth(value, -1))}>‹</button>
            <button type="button" aria-label="Next month" onClick={() => setMonth((value) => moveMonth(value, 1))}>›</button>
            <button type="button" aria-label="Close calendar" onClick={() => { setOpen(false); trigger.current?.focus(); }}>×</button>
          </div>
        </div>
        <div className="live-calendar-grid-scroll">
          <div className="live-calendar-grid-inner">
            <div className="live-calendar-weekdays" aria-hidden="true">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day}>{day}</span>)}</div>
            <div className="live-calendar-grid">{cells.map((cell) => {
              const titles = byDate.get(cell.value) || [];
              return <div key={cell.value} className={`live-calendar-day${cell.current ? "" : " outside"}${cell.value === today ? " today" : ""}`}><time dateTime={cell.value}>{cell.day}</time>{titles.map((title, index) => <span key={`${title}-${index}`} title={title}>{title}</span>)}</div>;
            })}</div>
          </div>
        </div>
        <div className="live-calendar-agenda">
          {mobileDays.length ? mobileDays.map((cell) => {
            const titles = byDate.get(cell.value) || [];
            return <details key={cell.value} className={cell.value === today ? "today" : undefined}>
              <summary><span>{dayLabel(cell.value)}</span><small>{titles.length ? `${titles.length} item${titles.length === 1 ? "" : "s"}` : "Today"}</small></summary>
              <div>{titles.length ? titles.map((title, index) => <p key={`${title}-${index}`}>{title}</p>) : <p>No calendar items today.</p>}</div>
            </details>;
          }) : <p className="live-calendar-empty">No events this month.</p>}
        </div>
        {!events.length && <p className="live-calendar-empty">No imported events are available for these months.</p>}
      </section>
    </div>, document.querySelector(".live-shell") || document.body)}
  </div>;
}
