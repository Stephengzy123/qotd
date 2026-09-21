"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { dbReady } from "@/lib/db";
import { syncLunchMenus } from "@/lib/lunch-menu";
import { logEvent } from "@/lib/log";

function normalizedSkipped(value: FormDataEntryValue | null) {
  return String(value || "").split(",").filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 50).join(",");
}

function calendarUrl(kind: "ok" | "error", message: string, backfill = false, skipped = "") {
  const params = new URLSearchParams({ [kind]: message });
  if (backfill) params.set("backfill", "1");
  if (skipped) params.set("skipped", skipped);
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
  const occurrenceEndDate = String(formData.get("occurrenceEndDate") || "");
  const continueBackfill = formData.get("continueBackfill") === "yes";
  const skipped = normalizedSkipped(formData.get("skippedEvents"));
  if (!/^[0-9a-f-]{36}$/i.test(id) || !validDate(occurrenceDate) || (occurrenceEndDate && (!validDate(occurrenceEndDate) || occurrenceEndDate < occurrenceDate))) {
    redirect(calendarUrl("error", "Choose a valid date range. Leave the end date blank for a single-day event.", continueBackfill, skipped));
  }
  const sql = await dbReady();
  const updated = await sql`
    update questions set event_occurrence_date = ${occurrenceDate}, event_occurrence_end_date = ${occurrenceEndDate || null}, updated_at = now()
    where id = ${id} and question_type = 'event' and status in ('approved', 'sent') returning id
  `;
  await logEvent({ action: "update_event_occurrence", actor: session.username, role: session.role, success: updated.length > 0, details: { id, occurrenceDate, occurrenceEndDate: occurrenceEndDate || null } });
  if (!updated.length) redirect(calendarUrl("error", "That event announcement is no longer available.", continueBackfill, skipped));
  revalidatePath("/admin/calendar");
  redirect(calendarUrl("ok", "Event date updated.", continueBackfill, skipped));
}

export async function createCalendarEventAction(formData: FormData) {
  const session = await requireRole("admin");
  const title = String(formData.get("title") || "").trim();
  const eventDate = String(formData.get("eventDate") || "");
  const requestedEndDate = String(formData.get("endDate") || "");
  const endDate = requestedEndDate || eventDate;
  const details = String(formData.get("details") || "").trim();
  if (title.length < 1 || title.length > 200 || !validDate(eventDate) || !validDate(endDate) || endDate < eventDate || details.length > 1500) {
    redirect(calendarUrl("error", "Check the title and date range. Leave the end date blank for a single-day event."));
  }
  const sql = await dbReady();
  const inserted = await sql<{ id: string }[]>`
    insert into calendar_events (event_date, end_date, title, details, created_by)
    values (${eventDate}, ${endDate}, ${title}, ${details || null}, ${session.username}) returning id
  `;
  await logEvent({ action: "create_calendar_event", actor: session.username, role: session.role, details: { id: inserted[0]?.id, title, eventDate, endDate } });
  revalidatePath("/admin/calendar");
  redirect(calendarUrl("ok", "Calendar event added."));
}

export async function deleteCalendarEventAction(formData: FormData) {
  const session = await requireRole("admin");
  const id = String(formData.get("id") || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect(calendarUrl("error", "Invalid calendar event."));
  const sql = await dbReady();
  const deleted = await sql<{ title: string }[]>`delete from calendar_events where id = ${id} returning title`;
  await logEvent({ action: "delete_calendar_event", actor: session.username, role: session.role, success: deleted.length > 0, details: { id, title: deleted[0]?.title } });
  revalidatePath("/admin/calendar");
  redirect(calendarUrl(deleted.length ? "ok" : "error", deleted.length ? "Calendar event deleted." : "Calendar event not found."));
}
