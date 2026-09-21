import "server-only";

import { createHash } from "node:crypto";
import { dbReady } from "@/lib/db";
import { pacificParts } from "@/lib/qotd";

const MENU_BASE_URL = "https://apps-external.stgeorges.bc.ca/weekly-menu/embed?meal=lunch";
const MAX_MENU_BYTES = 500_000;
const FETCH_TIMEOUT_MS = 10_000;
const RETRY_AFTER_MS = 6 * 60 * 60 * 1000;

const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};
const WEEKDAYS: Record<string, number> = {
  SUNDAY: 0, MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3,
  THURSDAY: 4, FRIDAY: 5, SATURDAY: 6,
};

export type LunchMenuItem = { category: string; dish: string };
export type ParsedLunchMenu = { date: string; items: LunchMenuItem[]; sourceUrl: string };

function decodeHtml(value: string) {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function cleanText(value: string) {
  return decodeHtml(value.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function tagBodies(value: string, tag: "th" | "td") {
  return [...value.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi"))].map((match) => match[1]);
}

function isoDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseHeading(value: string, referenceDate: string) {
  const heading = cleanText(value).toUpperCase();
  const match = heading.match(/^(SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY)\s+([A-Z]{3})\s+(\d{1,2})$/);
  if (!match) throw new Error(`Unrecognized lunch menu date heading: ${heading || "empty"}`);
  const [, weekday, monthName, dayText] = match;
  const month = MONTHS[monthName];
  const day = Number(dayText);
  if (!month || day < 1 || day > 31) throw new Error(`Invalid lunch menu date heading: ${heading}`);
  const reference = new Date(`${referenceDate}T12:00:00Z`);
  const candidates = [reference.getUTCFullYear() - 1, reference.getUTCFullYear(), reference.getUTCFullYear() + 1]
    .map((year) => ({ year, date: new Date(Date.UTC(year, month - 1, day, 12)) }))
    .filter(({ date }) => date.getUTCMonth() === month - 1 && date.getUTCDate() === day && date.getUTCDay() === WEEKDAYS[weekday])
    .sort((a, b) => Math.abs(a.date.getTime() - reference.getTime()) - Math.abs(b.date.getTime() - reference.getTime()));
  if (!candidates[0] || Math.abs(candidates[0].date.getTime() - reference.getTime()) > 45 * 86_400_000) {
    throw new Error(`Lunch menu date is too far from the current date: ${heading}`);
  }
  return isoDate(candidates[0].year, month, day);
}

export function parseLunchMenuHtml(html: string, sourceUrl: string, referenceDate = pacificParts().localDate): ParsedLunchMenu[] {
  const daysRow = html.match(/<tr\b[^>]*class=["'][^"']*\bdays\b[^"']*["'][^>]*>([\s\S]*?)<\/tr>/i)?.[1];
  const menuRow = html.match(/<tr\b[^>]*class=["'][^"']*\bmenu\b[^"']*["'][^>]*>([\s\S]*?)<\/tr>/i)?.[1];
  if (!daysRow || !menuRow) throw new Error("Lunch menu page no longer contains the expected day and menu rows.");
  const headings = tagBodies(daysRow, "th");
  const cells = tagBodies(menuRow, "td");
  if (!headings.length || headings.length !== cells.length || headings.length > 7) {
    throw new Error("Lunch menu page has an unexpected number of day columns.");
  }
  const parsed = headings.map((heading, index) => {
    const items = [...cells[index].matchAll(/<span\b[^>]*class=["'][^"']*\bcat\b[^"']*["'][^>]*>([\s\S]*?)<\/span>\s*<span\b[^>]*class=["'][^"']*\bdish\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi)]
      .map((match) => ({ category: cleanText(match[1]).slice(0, 80), dish: cleanText(match[2]).slice(0, 500) }))
      .filter((item) => item.category && item.dish);
    if (!items.length) throw new Error(`Lunch menu has no items for ${cleanText(heading)}.`);
    return { date: parseHeading(heading, referenceDate), items, sourceUrl };
  });
  if (new Set(parsed.map((menu) => menu.date)).size !== parsed.length) throw new Error("Lunch menu contains duplicate dates.");
  return parsed;
}

async function readLimitedText(response: Response) {
  const announced = Number(response.headers.get("content-length"));
  if (Number.isFinite(announced) && announced > MAX_MENU_BYTES) throw new Error("Lunch menu response is too large.");
  const text = await response.text();
  if (new TextEncoder().encode(text).length > MAX_MENU_BYTES) throw new Error("Lunch menu response is too large.");
  return text;
}

async function fetchMenu(url: string, referenceDate: string) {
  const response = await fetch(url, {
    headers: { accept: "text/html" },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Lunch menu returned HTTP ${response.status}.`);
  return parseLunchMenuHtml(await readLimitedText(response), url, referenceDate);
}

export type LunchSyncResult = { skipped: boolean; imported: number; changed: number };

export async function syncLunchMenus({ force = false }: { force?: boolean } = {}): Promise<LunchSyncResult> {
  const sql = await dbReady();
  const state = (await sql<{ last_attempt_at: Date | null; last_success_at: Date | null }[]>`
    select last_attempt_at, last_success_at from lunch_menu_sync_state where singleton = true
  `)[0];
  const today = pacificParts().localDate;
  const lastSuccessDate = state?.last_success_at ? pacificParts(new Date(state.last_success_at)).localDate : null;
  const attemptedRecently = state?.last_attempt_at && Date.now() - new Date(state.last_attempt_at).getTime() < RETRY_AFTER_MS;
  if (!force && (lastSuccessDate === today || attemptedRecently)) return { skipped: true, imported: 0, changed: 0 };

  await sql`update lunch_menu_sync_state set last_attempt_at = now(), last_error = null where singleton = true`;
  try {
    const urls = [MENU_BASE_URL, `${MENU_BASE_URL}&week=next`];
    const menus = (await Promise.all(urls.map((url) => fetchMenu(url, today)))).flat();
    const unique = new Map(menus.map((menu) => [menu.date, menu]));
    let changed = 0;
    await sql.begin(async (tx) => {
      for (const menu of unique.values()) {
        const hash = createHash("sha256").update(JSON.stringify(menu.items)).digest("hex");
        const rows = await tx`
          insert into lunch_menus (menu_date, items, source_url, content_hash, fetched_at)
          values (${menu.date}, ${tx.json(menu.items)}, ${menu.sourceUrl}, ${hash}, now())
          on conflict (menu_date) do update set
            items = excluded.items,
            source_url = excluded.source_url,
            content_hash = excluded.content_hash,
            fetched_at = now()
          where lunch_menus.content_hash <> excluded.content_hash
          returning menu_date
        `;
        changed += rows.length;
      }
      await tx`update lunch_menu_sync_state set last_success_at = now(), last_error = null where singleton = true`;
    });
    return { skipped: false, imported: unique.size, changed };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await sql`update lunch_menu_sync_state set last_error = ${message.slice(0, 500)} where singleton = true`;
    throw error;
  }
}

export async function lunchSyncStatus() {
  const sql = await dbReady();
  return (await sql<{ last_attempt_at: Date | null; last_success_at: Date | null; last_error: string | null }[]>`
    select last_attempt_at, last_success_at, last_error from lunch_menu_sync_state where singleton = true
  `)[0] || { last_attempt_at: null, last_success_at: null, last_error: null };
}
