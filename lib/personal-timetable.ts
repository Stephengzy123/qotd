import { createHash } from "node:crypto";
import { escapeText, fold } from "@/lib/calendar-subscription";
import { rotationForDate, scheduleForDate, type TimetableConfig } from "@/lib/timetable";
export { personalizeSchedule } from "@/lib/timetable-personalization";

export type PersonalizedPeriod = ReturnType<typeof scheduleForDate>[number];

export function tokenHash(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("Invalid timetable link. Reset it to create a new one.");
  return createHash("sha256").update(token).digest("hex");
}
export function validateClasses(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Enter your classes for blocks A–H.");
  const result = Object.fromEntries([..."ABCDEFGH"].map(letter => {
    const value = (input as Record<string, unknown>)[letter];
    if (typeof value !== "string" || value.length > 100 || /[\r\n\x00-\x1f]/.test(value)) throw new Error(`Block ${letter}: use a class name of at most 100 characters.`);
    return [letter, value.trim()];
  }));
  // Keep optional room fields in the existing JSON document; old saves stay valid.
  for (const letter of "ABCDEFGH") {
    const key = `room:${letter}`;
    const room = (input as Record<string, unknown>)[key];
    if (room === undefined) continue;
    if (typeof room !== "string" || room.length > 60 || /[\r\n\x00-\x1f]/.test(room)) throw new Error(`Block ${letter}: use a room of at most 60 characters.`);
    if (room.trim()) result[key] = room.trim();
  }
  return result;
}

// Older writes encoded JSON twice. Recover them without changing the token/UIDs.
export function restoreClasses(input: unknown) {
  return validateClasses(typeof input === "string" ? JSON.parse(input) : input);
}

// Resolve Vancouver wall time per date, rather than using today's UTC offset.
export function pacificTimestamp(date: string, time: string) {
  const offset = new Intl.DateTimeFormat("en-US", { timeZone: "America/Vancouver", timeZoneName: "shortOffset" }).formatToParts(new Date(`${date}T12:00:00Z`)).find(part => part.type === "timeZoneName")!.value;
  const hours = Number(offset.replace("GMT", ""));
  return new Date(Date.parse(`${date}T${time}:00Z`) - hours * 3600000).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function personalTimetableCalendar(identity: string, classes: Record<string, string>, config: TimetableConfig,
  rotations: { date: string; title: string }[], menus: { menu_date: string; items: { category: string; dish: string }[] }[], origin: string, now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Announcement Bot//Personal Timetable//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:My School Timetable", "X-WR-TIMEZONE:America/Vancouver", "X-WR-CALDESC:Personal timetable only — not an official school calendar. It reflects normal school days and imported block rotations; one semester at a time."];
  for (const date of [...new Set(rotations.map(row => row.date))].sort()) {
    const rotation = rotationForDate(rotations, date);
    scheduleForDate(config, date, rotation?.letters || null).forEach((period, index) => {
      const uid = createHash("sha256").update(`${identity}:${date}:${index}`).digest("hex");
      const course = period.letter ? classes[period.letter] || `Block ${period.letter}` : period.label;
      const room = period.letter ? classes[`room:${period.letter}`] || "" : "";
      const title = room && !course.endsWith(`(${room})`) ? `${course} (${room})` : course;
      const menu = menus.find(row => row.menu_date === date);
      const details = [period.letter ? `Block ${period.letter} · ${period.label}` : period.label, rotation?.title || "",
        period.kind === "lunch" ? menu?.items.map(item => `${item.category}: ${item.dish}`).join("\n\n") || "Menu not available yet." : "",
        period.infoUrl || ""].filter(Boolean).join("\n\n");
      lines.push("BEGIN:VEVENT", `UID:${uid}@announcement-bot`, `DTSTAMP:${stamp}`, `DTSTART:${pacificTimestamp(date, period.start)}`, `DTEND:${pacificTimestamp(date, period.end)}`,
        `SUMMARY:${escapeText(title)}`, ...(room ? [`LOCATION:${escapeText(room)}`] : []), `DESCRIPTION:${escapeText(details)}`, `URL:${period.infoUrl || `${origin}/live/calendar`}`, "TRANSP:OPAQUE", "END:VEVENT");
    });
  }
  return [...lines, "END:VCALENDAR"].map(fold).join("\r\n") + "\r\n";
}
