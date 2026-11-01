import { NextResponse } from "next/server";
import { publicUpdateNotice } from "@/lib/public-data";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json({ update: await publicUpdateNotice() }, { headers: { "Cache-Control": "public, max-age=0, s-maxage=30" } });
  } catch {
    return NextResponse.json({ error: "Update check unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
