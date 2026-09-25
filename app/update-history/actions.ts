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

export async function editHistoryEntry(formData: FormData) {
  const session = await requireRole("admin");
  const id = String(formData.get("id") || "");
  const title = String(formData.get("title") || "").trim();
  const body = String(formData.get("body") || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || !title || title.length > 120 || !body) {
    await logEvent({ action: "edit_update_history", actor: session.username, role: session.role, success: false, details: { id, reason: "Invalid entry, title, or empty body" } });
    redirect("/update-history?error=Enter+a+valid+title+and+description.");
  }
  const sql = await dbReady();
  const updated = await sql<{ id: string }[]>`
    update update_history_entries
    set title = ${title}, body = ${body}, edited_at = now(), edited_by = ${session.username}
    where id = ${id} returning id`;
  if (!updated.length) {
    await logEvent({ action: "edit_update_history", actor: session.username, role: session.role, success: false, details: { id, reason: "Entry not found" } });
    redirect("/update-history?error=That+entry+no+longer+exists.");
  }
  await logEvent({ action: "edit_update_history", actor: session.username, role: session.role, details: { id, title } });
  revalidatePath("/update-history");
  redirect("/update-history?ok=History+entry+updated.");
}
