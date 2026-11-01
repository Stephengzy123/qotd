import { dbReady } from "@/lib/db";
import { loadPublicCalendar } from "@/lib/admin-calendar";
import { publicRotationSourceConfigured, publicTimetableConfig } from "@/lib/public-data";
import { tokenHash, restoreClasses, personalTimetableCalendar } from "@/lib/personal-timetable";

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
    if (!await publicRotationSourceConfigured()) throw new Error("No rotation source configured");
    const year = Number(new Intl.DateTimeFormat("en", { timeZone: "America/Vancouver", year: "numeric" }).format(new Date()));
    const from = `${year - 1}-08-01`, to = `${year + 2}-07-31`;
    const [events, config] = await Promise.all([loadPublicCalendar(from, to, true), publicTimetableConfig()]);
    const rotations = events.filter(event => event.kind === "imported");
    const menus = events.filter(event => event.kind === "lunch" && event.items).map(event => ({ menu_date: event.date, items: event.items! }));
    return new Response(personalTimetableCalendar(hash, restoreClasses(personal.classes), config, rotations, menus, new URL(request.url).origin), {
      headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'inline; filename="my-timetable.ics"', "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex" },
    });
  } catch {
    return new Response("Timetable temporarily unavailable. Please retry later.", { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "300" } });
  }
}
