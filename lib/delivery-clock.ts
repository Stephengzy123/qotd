import "server-only";

import { dbReady } from "@/lib/db";
import { writeScheduleHint } from "@/lib/shared-cache";

export function nextPacificDelivery(now: Date, targetHour = 18) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Vancouver", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (name: string) => parts.find(item => item.type === name)!.value;
  const day = new Date(`${part("year")}-${part("month")}-${part("day")}T18:00:00Z`);
  const atHour = (date: Date) => {
    const hour = Number(new Intl.DateTimeFormat("en", { timeZone: "America/Vancouver", hour: "2-digit", hourCycle: "h23" }).format(date));
    return date.getTime() + (targetHour - hour) * 3600_000;
  };
  let next = atHour(day);
  if (next <= now.getTime()) { day.setUTCDate(day.getUTCDate() + 1); next = atHour(day); }
  return next;
}

export async function rememberNextDelivery(revision: string | null, now: Date, retry = false) {
  if (!revision) return;
  const sql = await dbReady();
  const row = (await sql<{ next_exact: Date | null }[]>`
    select min(send_at) as next_exact from questions
    where status = 'approved' and scheduled_date is not null and send_schedule_mode = 'exact'`)[0];
  const exact = row?.next_exact ? new Date(row.next_exact).getTime() : Infinity;
  const nextExact = exact <= now.getTime() ? now.getTime() + 10 * 60_000 : exact;
  const nextCheckAt = Math.min(nextPacificDelivery(now), nextPacificDelivery(now, 6), nextExact, retry ? now.getTime() + 10 * 60_000 : Infinity);
  await writeScheduleHint(revision, nextCheckAt);
}
