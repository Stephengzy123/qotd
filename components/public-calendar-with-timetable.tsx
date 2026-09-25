"use client";

import { useEffect, useState } from "react";
import { AdminCalendar } from "@/components/admin-calendar";
import { PUBLIC_TIMETABLE_STORAGE_KEY } from "@/components/personal-timetable-export";
import { publicTimetableAction } from "@/app/live/timetable/actions";
import { personalizeSchedule } from "@/lib/timetable-personalization";
import type { AdminCalendarEvent } from "@/lib/admin-calendar";
import type { DailyPeriod } from "@/components/calendar-day-view";

export function PublicCalendarWithTimetable({ events, today, rangeStart, rangeEnd, timetable }: { events: AdminCalendarEvent[]; today: string; rangeStart: string; rangeEnd: string; timetable: Record<string, DailyPeriod[]> }) {
  const [classes, setClasses] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const stored = localStorage.getItem(PUBLIC_TIMETABLE_STORAGE_KEY);
        if (!stored) return;
        const { readToken, editToken } = JSON.parse(stored);
        const result = await publicTimetableAction("load", readToken, editToken);
        if (active && result.classes) setClasses(result.classes);
      } catch { /* A missing or revoked timetable falls back to the school schedule. */ }
    })();
    return () => { active = false; };
  }, []);
  const shown = classes ? Object.fromEntries(Object.entries(timetable).map(([date, periods]) => [date, personalizeSchedule(periods, classes)])) : timetable;
  return <AdminCalendar events={events} today={today} rangeStart={rangeStart} rangeEnd={rangeEnd} timetable={shown} personalizedTimetable={Boolean(classes)} editTimetableHref="/live/timetable" initialView="month" />;
}
