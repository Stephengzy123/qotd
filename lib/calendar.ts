import "server-only";

import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { decryptSecret } from "@/lib/security";

const MAX_FEED_BYTES = 1_000_000;
const CACHE_MS = 5 * 60 * 1000;

type CalendarByDate = Record<string, string[]>;

const globalForCalendar = globalThis as unknown as {
  announcementCalendarCache?: Map<string, { expires: number; entries: CalendarByDate }>;
};

function cache() {
  if (!globalForCalendar.announcementCalendarCache) globalForCalendar.announcementCalendarCache = new Map();
  return globalForCalendar.announcementCalendarCache;
}

export function normalizeCalendarFeedUrl(value: string) {
  const normalized = value.trim().replace(/^webcal:/i, "https:");
  try {
    const url = new URL(normalized);
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash || normalized.length > 2048) return null;
    return url.href;
  } catch {
    return null;
  }
}

function isPrivateAddress(address: string) {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (isIP(address) === 6) {
    const lower = address.toLowerCase();
    return lower === "::" || lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd") ||
      /^fe[89ab]/.test(lower) || lower.startsWith("::ffff:127.") || lower.startsWith("::ffff:10.") ||
      lower.startsWith("::ffff:192.168.");
  }
  return true;
}

async function assertPublicCalendarHost(url: URL) {
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new Error("Calendar feed host is not allowed.");
  }
  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) throw new Error("Calendar feed host is not allowed.");
    return;
  }
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("Calendar feed host is not allowed.");
  }
}

function unescapeCalendarText(value: string) {
  return value
    .replace(/\\[nN]/g, " ")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

function compactDate(value: string) {
  if (!/^\d{8}$/.test(value)) return null;
  const date = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  const parsed = new Date(`${date}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : null;
}

function addUtcDay(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function parseCalendarFeed(text: string): CalendarByDate {
  if (!/(?:^|\r?\n)BEGIN:VCALENDAR(?:\r?\n|$)/i.test(text)) throw new Error("Calendar feed is not valid iCalendar data.");
  const lines = text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const entries: CalendarByDate = {};
  let event: { start?: string; end?: string; summary?: string } | null = null;

  for (const line of lines) {
    if (line.toUpperCase() === "BEGIN:VEVENT") {
      event = {};
      continue;
    }
    if (line.toUpperCase() === "END:VEVENT") {
      if (event?.start && event.summary) {
        const end = event.end && event.end > event.start ? event.end : addUtcDay(event.start);
        let date = event.start;
        let days = 0;
        while (date < end && days < 366) {
          if (!entries[date]) entries[date] = [];
          if (!entries[date].includes(event.summary)) entries[date].push(event.summary);
          date = addUtcDay(date);
          days += 1;
        }
      }
      event = null;
      continue;
    }
    if (!event) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const property = line.slice(0, separator).toUpperCase();
    const value = line.slice(separator + 1);
    if (property.startsWith("DTSTART;") && property.split(";").includes("VALUE=DATE")) event.start = compactDate(value) || undefined;
    else if (property.startsWith("DTEND;") && property.split(";").includes("VALUE=DATE")) event.end = compactDate(value) || undefined;
    else if (property === "SUMMARY") event.summary = unescapeCalendarText(value) || undefined;
  }
  return entries;
}

async function readLimitedBody(response: Response) {
  const announcedLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(announcedLength) && announcedLength > MAX_FEED_BYTES) throw new Error("Calendar feed is too large.");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > MAX_FEED_BYTES) {
      await reader.cancel();
      throw new Error("Calendar feed is too large.");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(body);
}

export async function fetchCalendarByUrl(value: string) {
  const normalized = normalizeCalendarFeedUrl(value);
  if (!normalized) throw new Error("Enter a valid HTTPS or webcal calendar feed URL.");
  const url = new URL(normalized);
  await assertPublicCalendarHost(url);
  const response = await fetch(url, {
    headers: { accept: "text/calendar, text/plain;q=0.9" },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Calendar feed returned HTTP ${response.status}.`);
  return parseCalendarFeed(await readLimitedBody(response));
}

export async function getCalendarByDate(encryptedUrl: string | null | undefined, date: string) {
  if (!encryptedUrl || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
  const saved = cache().get(encryptedUrl);
  if (saved && saved.expires > Date.now()) return saved.entries[date] || [];
  const entries = await fetchCalendarByUrl(decryptSecret(encryptedUrl));
  cache().set(encryptedUrl, { expires: Date.now() + CACHE_MS, entries });
  return entries[date] || [];
}

export function calendarHeading(titles: string[]) {
  return titles.map((title) => `## ${title}`).join("\n");
}
