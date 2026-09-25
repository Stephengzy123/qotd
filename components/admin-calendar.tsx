"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { AdminCalendarEvent } from "@/lib/admin-calendar";
import { DiscordMarkdown } from "@/components/discord-preview";
import { CalendarDayView, type DailyPeriod } from "@/components/calendar-day-view";

type CalendarCell = { value: string; day: number; current: boolean };
type SpanSegment = { event: AdminCalendarEvent; startColumn: number; endColumn: number; lane: number; continuesBefore: boolean; continuesAfter: boolean };

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

function layoutWeek(cells: CalendarCell[], events: AdminCalendarEvent[]) {
  const weekStart = cells[0].value;
  const weekEnd = cells[6].value;
  const laneEnds: number[] = [];
  const segments: SpanSegment[] = events
    .filter((event) => event.endDate && event.date <= weekEnd && event.endDate >= weekStart)
    .sort((left, right) => left.date.localeCompare(right.date) || (right.endDate || right.date).localeCompare(left.endDate || left.date) || left.title.localeCompare(right.title))
    .map((event) => {
      const visibleStart = event.date < weekStart ? weekStart : event.date;
      const visibleEnd = event.endDate! > weekEnd ? weekEnd : event.endDate!;
      const startColumn = cells.findIndex((cell) => cell.value === visibleStart);
      const endColumn = cells.findIndex((cell) => cell.value === visibleEnd);
      let lane = laneEnds.findIndex((lastColumn) => lastColumn < startColumn);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = endColumn;
      return { event, startColumn, endColumn, lane, continuesBefore: event.date < weekStart, continuesAfter: event.endDate! > weekEnd };
    });
  return { cells, segments, laneCount: laneEnds.length };
}

export function AdminCalendar({ events, today, rangeStart, rangeEnd, timetable, personalizedTimetable = false, editTimetableHref, initialView }: { events: AdminCalendarEvent[]; today: string; rangeStart: string; rangeEnd: string; timetable?: Record<string, DailyPeriod[]>; personalizedTimetable?: boolean; editTimetableHref?: string; initialView?: "day" | "month" }) {
  const [view, setView] = useState<"day" | "week" | "month" | "list">(initialView || (timetable ? "day" : "month"));
  const [anchor, setAnchor] = useState(today);
  useEffect(() => { if ((initialView === "month" || !timetable) && window.matchMedia("(max-width: 700px), (max-width: 1000px) and (pointer: coarse)").matches) setView("week"); }, [timetable, initialView]);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState<AdminCalendarEvent | null>(null);
  const dialog = useRef<HTMLElement>(null);
  const singleEventsByDate = useMemo(() => {
    const grouped = new Map<string, AdminCalendarEvent[]>();
    for (const event of events) {
      if (event.endDate && event.endDate > event.date) continue;
      grouped.set(event.date, [...(grouped.get(event.date) || []), event]);
    }
    return grouped;
  }, [events]);
  const rangeEvents = useMemo(() => events.filter((event) => event.endDate && event.endDate > event.date), [events]);
  const cells = useMemo(() => {
    const [year, monthNumber] = month.split("-").map(Number);
    const first = new Date(Date.UTC(year, monthNumber - 1, 1, 12));
    const start = new Date(first);
    start.setUTCDate(1 - first.getUTCDay());
    const daysInMonth = new Date(Date.UTC(year, monthNumber, 0, 12)).getUTCDate();
    const cellCount = Math.ceil((first.getUTCDay() + daysInMonth) / 7) * 7;
    return Array.from({ length: cellCount }, (_, index) => {
      const date = new Date(start);
      date.setUTCDate(start.getUTCDate() + index);
      return { value: date.toISOString().slice(0, 10), day: date.getUTCDate(), current: date.getUTCMonth() === monthNumber - 1 };
    });
  }, [month]);
  const weeks = useMemo(() => Array.from({ length: cells.length / 7 }, (_, index) => layoutWeek(cells.slice(index * 7, index * 7 + 7), rangeEvents)), [cells, rangeEvents]);
  const weekCells = useMemo(() => {
    const date = new Date(`${anchor}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - date.getUTCDay());
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(date);
      day.setUTCDate(day.getUTCDate() + index);
      const value = day.toISOString().slice(0, 10);
      return { value, day: day.getUTCDate(), current: value >= rangeStart && value <= rangeEnd };
    });
  }, [anchor, rangeStart, rangeEnd]);
  const shownWeeks = view === "week" ? [layoutWeek(weekCells, rangeEvents)] : weeks;
  function navigate(by: number) {
    if (view === "week" || view === "day") {
      const date = new Date(`${anchor}T12:00:00Z`);
      date.setUTCDate(date.getUTCDate() + by * (view === "day" ? 1 : 7));
      const value = date.toISOString().slice(0, 10);
      const bounded = value < rangeStart ? rangeStart : value > rangeEnd ? rangeEnd : value;
      setAnchor(bounded);
      setMonth(bounded.slice(0, 7));
    } else {
      const value = moveMonth(month, by);
      setMonth(value);
      setAnchor(`${value}-01`);
    }
  }

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
    <div className="admin-calendar panel" data-calendar-view={view}>
      <div className="admin-calendar-toolbar">
        <div><strong>{view === "day" ? fullDate(anchor) : view === "week" ? `${fullDate(weekCells[0].value)} – ${fullDate(weekCells[6].value)}` : monthLabel(month)}</strong><span>{events.length} calendar entries loaded</span></div>
        <div className="calendar-view-picker" role="group" aria-label="Calendar view">{([...(timetable ? ["day" as const] : []), "week", "month", "list"] as const).map(option => <button key={option} className="secondary" type="button" aria-pressed={view === option} onClick={() => setView(option)}>{option[0].toUpperCase() + option.slice(1)}</button>)}</div>
        <div><button type="button" className="secondary" disabled={view === "day" ? anchor <= rangeStart : view === "week" ? weekCells[0].value <= rangeStart : previous < rangeStart.slice(0, 7)} onClick={() => navigate(-1)} aria-label={view === "day" ? "Previous day" : view === "week" ? "Previous week" : "Previous month"}>‹</button><button type="button" className="secondary" onClick={() => { setMonth(today.slice(0, 7)); setAnchor(today); }}>Today</button><button type="button" className="secondary" disabled={view === "day" ? anchor >= rangeEnd : view === "week" ? weekCells[6].value >= rangeEnd : next > rangeEnd.slice(0, 7)} onClick={() => navigate(1)} aria-label={view === "day" ? "Next day" : view === "week" ? "Next week" : "Next month"}>›</button></div>
      </div>
      {view === "day" && timetable && <CalendarDayView date={anchor} periods={timetable[anchor] || []} events={events} onSelect={setSelected} personalized={personalizedTimetable} editHref={editTimetableHref} />}
      <div className="admin-calendar-scroll"><div className="admin-calendar-inner">
        <div className="admin-calendar-weekdays" aria-hidden="true">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day}>{day}</span>)}</div>
        <div className="admin-calendar-grid">{shownWeeks.map((week, weekIndex) => <div className="admin-calendar-week" key={week.cells[0].value}>
          {week.cells.map((cell) => <div key={cell.value} className={`admin-calendar-day${cell.current ? "" : " outside"}${cell.value === today ? " today" : ""}`}>
            {timetable ? <button className="calendar-date-open" type="button" disabled={cell.value < rangeStart || cell.value > rangeEnd} aria-label={`Open ${fullDate(cell.value)}`} onClick={() => { setAnchor(cell.value); setMonth(cell.value.slice(0, 7)); setView("day"); }}>{cell.day}</button> : <time dateTime={cell.value}>{cell.day}</time>}
            <div className="admin-calendar-events" style={{ paddingTop: week.laneCount ? `${week.laneCount * 1.55}rem` : undefined }}>{(singleEventsByDate.get(cell.value) || []).map((event) => <button key={event.id} type="button" className={`calendar-event ${event.kind}`} onClick={() => setSelected(event)}>{event.title}</button>)}</div>
          </div>)}
          <div className="admin-calendar-spans" aria-label={`Multi-day events, week ${weekIndex + 1}`}>{week.segments.map((segment) => {
            const style = { gridColumn: `${segment.startColumn + 1} / ${segment.endColumn + 2}`, marginTop: `calc(1.85rem + ${segment.lane} * 1.55rem)` } as CSSProperties;
            return <button key={`${segment.event.id}-${weekIndex}`} type="button" style={style} className={`calendar-event calendar-event-span ${segment.event.kind}${segment.continuesBefore ? " continues-before" : ""}${segment.continuesAfter ? " continues-after" : ""}`} onClick={() => setSelected(segment.event)} title={`${segment.event.title}: ${fullDate(segment.event.date)} to ${fullDate(segment.event.endDate!)}`}>{segment.continuesBefore ? "← " : ""}{segment.event.title}{segment.continuesAfter ? " →" : ""}</button>;
          })}</div>
        </div>)}</div>
      </div></div>
      {view === "week" && <div className="calendar-week-stack">{weekCells.map(cell => {
        const daily = events.filter(event => event.date <= cell.value && (event.endDate || event.date) >= cell.value);
        return <section key={cell.value} className={cell.value === today ? "is-today" : undefined}><h3><time dateTime={cell.value}>{fullDate(cell.value)}</time>{cell.value === today ? " · Today" : ""}</h3><div>{daily.length ? daily.map(event => <button key={event.id} type="button" className={`calendar-event ${event.kind}`} onClick={() => setSelected(event)}>{event.title}{event.endDate && event.endDate !== event.date ? <small> · {event.date} – {event.endDate}</small> : null}</button>) : <p className="hint">No events</p>}</div></section>;
      })}</div>}
      <div className="public-calendar-agenda">{cells.filter(cell => cell.current).map(cell => {
        const daily = events.filter(event => event.date <= cell.value && (event.endDate || event.date) >= cell.value);
        if (!daily.length) return null;
        return <details key={cell.value}><summary>{fullDate(cell.value)} · {daily.length} items</summary><div>{daily.map(event => <button key={event.id} type="button" className={`calendar-event ${event.kind}`} onClick={() => setSelected(event)}>{event.title}</button>)}</div></details>;
      })}</div>
      <div className="admin-calendar-legend"><span><i className="imported" />Imported</span><span><i className="announcement" />Announcement event</span><span><i className="manual" />Calendar-only event</span><span><i className="lunch" />Lunch</span></div>
    </div>
    {selected ? <div className="calendar-detail-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><section ref={dialog} className="calendar-detail panel" role="dialog" aria-modal="true" aria-labelledby="calendar-detail-title" tabIndex={-1}>
      <div className="calendar-detail-heading"><div><span className={`status calendar-${selected.kind}`}>{selected.kind === "announcement" ? "Announcement event" : selected.kind === "manual" ? "Calendar-only event" : selected.kind === "lunch" ? "Lunch menu" : "Imported event"}</span><h2 id="calendar-detail-title">{selected.title}</h2><p>{fullDate(selected.date)}{selected.endDate && selected.endDate !== selected.date ? ` – ${fullDate(selected.endDate)}` : ""}</p></div><button type="button" className="secondary" onClick={() => setSelected(null)} aria-label="Close">×</button></div>
      {selected.details ? <div className="calendar-detail-copy discord-preview"><DiscordMarkdown value={selected.details} /></div> : null}
      {selected.items ? <div className="lunch-detail-list">{selected.items.map((item, index) => <div key={`${item.category}-${index}`}><strong>{item.category}</strong><span>{item.dish}</span></div>)}</div> : null}
      {selected.meta ? <p className="hint">{selected.meta}</p> : null}
      <a className="secondary" href={`/live/report?category=calendar&context=${encodeURIComponent(`${selected.title} (${selected.date}${selected.endDate ? ` to ${selected.endDate}` : ""}) [${selected.id}]`.slice(0, 500))}`}>Report an issue</a>
    </section></div> : null}
  </>;
}
