import { loadPublicCalendar } from "@/lib/admin-calendar";
import { calendarFeeds, subscriptionCalendar, subscriptionCategories, type SubscriptionCategory, type CalendarFeed } from "@/lib/calendar-subscription";
import { pacificParts } from "@/lib/qotd";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ feed: string }> }) {
  const name = (await params).feed.replace(/\.ics$/, "");
  if (name !== "custom" && !Object.hasOwn(calendarFeeds, name)) return new Response("Calendar not found", { status: 404 });
  const categories = [...new Set((new URL(request.url).searchParams.get("include") || "").split(","))];
  if (name === "custom" && categories.some(category => !subscriptionCategories.includes(category as SubscriptionCategory))) return new Response("Choose at least one valid calendar category", { status: 400 });
  try {
    const today = pacificParts().localDate;
    const year = Number(today.slice(0, 4));
    // Include previous/current/upcoming school years so rollover doesn't immediately
    // discard the previous year's subscribed events.
    const events = await loadPublicCalendar(`${year - 1}-08-01`, `${year + 2}-07-31`, true);
    return new Response(subscriptionCalendar(events, name === "custom" ? categories as SubscriptionCategory[] : name as CalendarFeed, new URL(request.url).origin), {
      headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `inline; filename="${name}.ics"`, "Cache-Control": "no-cache" },
    });
  } catch {
    // Never publish an empty successful snapshot on source/database failure.
    return new Response("Calendar temporarily unavailable. Please retry later.", { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "300" } });
  }
}
