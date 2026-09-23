"use client";

import { useEffect, useRef, useState } from "react";
import type { AdminCalendarEvent } from "@/lib/admin-calendar";
import type { TimetablePeriod } from "@/lib/timetable";

export type DailyPeriod = TimetablePeriod & { letter: string | null };
const SCALE = 1.5;
function minutes(time: string) { const [hour, minute] = time.split(":").map(Number); return hour * 60 + minute; }
function clockLabel(value: number) { return `${Math.floor(value / 60) % 12 || 12}:${String(value % 60).padStart(2, "0")} ${value < 720 ? "AM" : "PM"}`; }
function pacificNow() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Vancouver", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return { date: `${part("year")}-${part("month")}-${part("day")}`, minute: Number(part("hour")) * 60 + Number(part("minute")) };
}

export function CalendarDayView({ date, periods, events, onSelect }: { date: string; periods: DailyPeriod[]; events: AdminCalendarEvent[]; onSelect: (event: AdminCalendarEvent) => void }) {
  const [now, setNow] = useState<ReturnType<typeof pacificNow> | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const update = () => setNow(pacificNow());
    update();
    const timer = window.setInterval(update, 30000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = Math.max(0, (periods.length ? minutes(periods[0].start) - 30 : 480) * SCALE);
  }, [date, periods]);
  const daily = events.filter(event => event.date <= date && (event.endDate || event.date) >= date);
  return <div className="calendar-day-view">
    <div className="calendar-day-all-day"><span>All day</span><div>{daily.length ? daily.map(event => <button type="button" key={event.id} className={`calendar-event ${event.kind}`} onClick={() => onSelect(event)}>{event.title}</button>) : <p className="hint">No all-day events</p>}</div></div>
    <div className="calendar-day-note"><span>Times shown in Vancouver time</span><a href="/admin/timetable">Edit timetable</a></div>
    {!periods.length && <p className="calendar-day-empty hint">No timed school schedule for this date. A weekday rotation and saved timetable are needed.</p>}
    <div className="calendar-day-scroll" ref={scroll} tabIndex={0} aria-label="Daily schedule, scroll for other times">
      <div className="calendar-day-timeline" style={{ height: 1440 * SCALE }}>
        {Array.from({ length: 24 }, (_, hour) => <div key={hour} className="calendar-day-hour" style={{ top: hour * 60 * SCALE }}><time>{clockLabel(hour * 60)}</time></div>)}
        {periods.map((period, index) => <div key={`${date}-${index}`} className={`calendar-day-period ${period.kind}`} style={{ top: minutes(period.start) * SCALE, height: (minutes(period.end) - minutes(period.start)) * SCALE }} title={`${period.letter ? `${period.letter} · ` : ""}${period.label}, ${clockLabel(minutes(period.start))}–${clockLabel(minutes(period.end))}`}>
          <strong>{period.letter ? `${period.letter} · ` : ""}{period.label}</strong><span>{clockLabel(minutes(period.start))}–{clockLabel(minutes(period.end))}</span>
        </div>)}
        {now?.date === date && <div className="calendar-day-now" style={{ top: now.minute * SCALE }} aria-label={`Current time ${clockLabel(now.minute)} Vancouver`}><span>{clockLabel(now.minute)}</span></div>}
      </div>
    </div>
  </div>;
}
