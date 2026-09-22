import { createHash } from "node:crypto";
import type { AdminCalendarEvent } from "@/lib/admin-calendar";

export const calendarFeeds = { events: "School Events", rotations: "Block Rotations", lunch: "Senior School Lunch Menus" };
export type CalendarFeed = keyof typeof calendarFeeds;
export const subscriptionCategories = ["announcement", "manual", "imported", "rotations", "lunch"] as const;
export type SubscriptionCategory = typeof subscriptionCategories[number];

function escapeText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\r\n?|\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
}
function fold(line: string) {
  let output = "", bytes = 0;
  for (const character of line) {
    const size = Buffer.byteLength(character);
    if (bytes + size > 75) { output += "\r\n "; bytes = 1; }
    output += character; bytes += size;
  }
  return output;
}
export function subscriptionCalendar(events: AdminCalendarEvent[], feed: CalendarFeed | SubscriptionCategory[], origin: string, now = new Date()) {
  const categories: readonly string[] = Array.isArray(feed) ? feed : feed === "events" ? ["announcement", "manual", "imported"] : [feed];
  const selected = events.filter(event => {
    const rotation = event.kind === "imported" && /\bday\s*[12]\b|\b[ABCDEFGH]{4}\b|block\s*rotation/i.test(event.title);
    return categories.includes(rotation ? "rotations" : event.kind);
  });
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Announcement Bot//School Calendar//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${Array.isArray(feed) ? "School Calendar" : calendarFeeds[feed]}`];
  for (const event of selected) {
    // Imported rows use positional IDs in the UI; don't carry those into subscriptions.
    const identity = event.kind === "imported" ? `${event.date}:${event.title}` : event.id;
    const uid = createHash("sha256").update(identity).digest("hex");
    const end = new Date(`${event.endDate || event.date}T12:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 1); // ICS all-day DTEND is exclusive.
    const details = event.items ? event.items.map(item => `${item.category}: ${item.dish}`).join("\n\n") : event.details || "";
    lines.push("BEGIN:VEVENT", `UID:${uid}@announcement-bot`, `DTSTAMP:${now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`,
      `DTSTART;VALUE=DATE:${event.date.replaceAll("-", "")}`, `DTEND;VALUE=DATE:${end.toISOString().slice(0, 10).replaceAll("-", "")}`,
      `SUMMARY:${escapeText(event.title)}`, `DESCRIPTION:${escapeText(details)}`, `URL:${origin}/live/calendar`, "TRANSP:TRANSPARENT", "END:VEVENT");
  }
  return [...lines, "END:VCALENDAR"].map(fold).join("\r\n") + "\r\n";
}
