"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { dbReady } from "@/lib/db";
import { syncLunchMenus } from "@/lib/lunch-menu";
import { logEvent } from "@/lib/log";

function calendarUrl(kind: "ok" | "error", message: string, backfill = false) {
  const params = new URLSearchParams({ [kind]: message });
  if (backfill) params.set("backfill", "1");
  return `/admin/calendar?${params}`;
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export async function refreshLunchMenusAction() {
  const session = await requireRole("admin");
  let result;
  try {
    result = await syncLunchMenus({ force: true });
    await logEvent({ action: "refresh_lunch_menu", actor: session.username, role: session.role, details: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lunch menu refresh failed.";
    await logEvent({ action: "refresh_lunch_menu", actor: session.username, role: session.role, success: false, details: { error: message } });
    redirect(calendarUrl("error", message));
  }
  revalidatePath("/admin/calendar");
  redirect(calendarUrl("ok", `Lunch menus refreshed: ${result.imported} days checked, ${result.changed} changed.`));
}

export async function updateEventOccurrenceDateAction(formData: FormData) {
  const session = await requireRole("admin");
  const id = String(formData.get("id") || "");
  const occurrenceDate = String(formData.get("occurrenceDate") || "");
  const continueBackfill = formData.get("continueBackfill") === "yes";
  if (!/^[0-9a-f-]{36}$/i.test(id) || !validDate(occurrenceDate)) redirect(calendarUrl("error", "Choose a valid event date.", continueBackfill));
  const sql = await dbReady();
  const updated = await sql`
    update questions set event_occurrence_date = ${occurrenceDate}, updated_at = now()
    where id = ${id} and question_type = 'event' and status in ('approved', 'sent') returning id
  `;
  await logEvent({ action: "update_event_occurrence", actor: session.username, role: session.role, success: updated.length > 0, details: { id, occurrenceDate } });
  if (!updated.length) redirect(calendarUrl("error", "That event announcement is no longer available.", continueBackfill));
  revalidatePath("/admin/calendar");
  redirect(calendarUrl("ok", "Event date updated.", continueBackfill));
}
