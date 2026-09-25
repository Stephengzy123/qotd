import type { DailyPeriod } from "@/components/calendar-day-view";

export function personalizeSchedule(periods: DailyPeriod[], classes: Record<string, string>): DailyPeriod[] {
  return periods.map(period => {
    if (!period.letter) return period;
    const course = classes[period.letter] || `Block ${period.letter}`;
    const room = classes[`room:${period.letter}`] || "";
    return { ...period, label: room && !course.endsWith(`(${room})`) ? `${course} (${room})` : course };
  });
}
