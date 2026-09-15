import { NextRequest, NextResponse } from "next/server";
import { getLiveMessages, parseLiveCursor } from "@/lib/live-messages";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const type = params.get("type") || "all";
  if (!["all", "announcement", "event"].includes(type) || (params.has("before") && params.has("after"))) return NextResponse.json({ error: "Invalid filter" }, { status: 400 });
  let before, after;
  try { before = parseLiveCursor(params.get("before")); after = parseLiveCursor(params.get("after")); }
  catch { return NextResponse.json({ error: "Invalid cursor" }, { status: 400 }); }
  try {
    const hidden = params.get("hidden") === "true";
    if (hidden && (await getSession())?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    return NextResponse.json(await getLiveMessages(type, before, after, hidden), { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Messages are temporarily unavailable" }, { status: 503 });
  }
}
