import { NextRequest, NextResponse } from "next/server";
import { getLiveMessageById, getLiveMessages, parseLiveCursor } from "@/lib/live-messages";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const type = params.get("type") || "all";
  const target = params.get("target");
  if (!["all", "announcement", "event", "human"].includes(type) || (params.has("before") && params.has("after"))) return NextResponse.json({ error: "Invalid filter" }, { status: 400 });
  if (target && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(target)) return NextResponse.json({ error: "Invalid target" }, { status: 400 });
  let before, after;
  try { before = parseLiveCursor(params.get("before")); after = parseLiveCursor(params.get("after")); }
  catch { return NextResponse.json({ error: "Invalid cursor" }, { status: 400 }); }
  try {
    if (target) {
      const message = await getLiveMessageById(target);
      return message ? NextResponse.json({ message }, { headers: { "Cache-Control": "private, no-store" } }) : NextResponse.json({ error: "Message not found" }, { status: 404 });
    }
    const hidden = params.get("hidden") === "true";
    if (hidden && (await getSession())?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    return NextResponse.json(await getLiveMessages(type as "all" | "announcement" | "event" | "human", before, after, hidden), { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Messages are temporarily unavailable" }, { status: 503 });
  }
}
