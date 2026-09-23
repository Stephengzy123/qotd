import { dbReady } from "@/lib/db";
import { getCalendarEvents } from "@/lib/calendar";
import { normalizeTimetable } from "@/lib/timetable";
import { tokenHash, validateClasses, personalTimetableCalendar } from "@/lib/personal-timetable";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  let hash: string;
  try { hash = tokenHash((await params).token.replace(/\.ics$/, "")); }
  catch { return new Response("Calendar not found", { status: 404, headers: { "Cache-Control": "no-store" } }); }
  try {
    const sql = await dbReady();
    const personal = (await sql<{ classes: unknown }[]>`select classes from personal_timetables where token_hash = ${hash} and revoked_at is null`)[0];
    if (!personal) return new Response("Calendar not found", { status: 404, headers: { "Cache-Control": "no-store" } });
    const settings = (await sql<{ timetable_config: unknown; calendar_feed_url_encrypted: string | null }[]>`select timetable_config, calendar_feed_url_encrypted from settings where singleton = true`)[0];
    if (!settings?.calendar_feed_url_encrypted) throw new Error("No rotation source configured");
    const year = Number(new Intl.DateTimeFormat("en", { timeZone: "America/Vancouver", year: "numeric" }).format(new Date()));
    const from = `${year - 1}-08-01`, to = `${year + 2}-07-31`;
    // Fetch one month at a time to avoid the importer's 500-event result cap.
    const rotations = [];
    for (let month = new Date(`${from}T12:00:00Z`); month.toISOString().slice(0, 10) <= to; month.setUTCMonth(month.getUTCMonth() + 1)) {
      const end = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0, 12));
      rotations.push(...await getCalendarEvents(settings.calendar_feed_url_encrypted, month.toISOString().slice(0, 10), end.toISOString().slice(0, 10)));
    }
    const menus = await sql<{ menu_date: string; items: { category: string; dish: string }[] }[]>`select menu_date::text, items from lunch_menus where menu_date between ${from}::date and ${to}::date`;
    return new Response(personalTimetableCalendar(hash, validateClasses(personal.classes), normalizeTimetable(settings.timetable_config), rotations, menus, new URL(request.url).origin), {
      headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'inline; filename="my-timetable.ics"', "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex" },
    });
  } catch {
    return new Response("Timetable temporarily unavailable. Please retry later.", { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "300" } });
  }
}
