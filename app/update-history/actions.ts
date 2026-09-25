"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { dbReady } from "@/lib/db";
import { logEvent } from "@/lib/log";

export async function publishHistoryEntry(formData: FormData) {
  const session = await requireRole("admin");
  const title = String(formData.get("title") || "").trim();
  const body = String(formData.get("body") || "").trim();
  if (!title || title.length > 120 || !body) {
    await logEvent({ action: "publish_update_history", actor: session.username, role: session.role, success: false, details: { reason: "Invalid title or empty body" } });
    redirect("/update-history?error=Enter+a+title+and+description.");
  }
  const sql = await dbReady();
  await sql`insert into update_history_entries (title, body, published_by) values (${title}, ${body}, ${session.username})`;
  await logEvent({ action: "publish_update_history", actor: session.username, role: session.role, details: { title } });
  revalidatePath("/update-history");
  redirect("/update-history?ok=Update+added+to+history.");
}
