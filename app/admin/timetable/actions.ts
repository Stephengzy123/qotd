"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { dbReady } from "@/lib/db";
import { validateTimetable } from "@/lib/timetable";
import { logEvent } from "@/lib/log";

export async function saveTimetableAction(_previous: { error?: string; success?: string }, formData: FormData): Promise<{ error?: string; success?: string }> {
  const session = await requireRole("admin");
  const raw = String(formData.get("config") || "");
  if (raw.length > 30000) return { error: "The timetable is too large." };
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return { error: "Enter valid timetable values." }; }
  let config;
  try { config = validateTimetable(parsed); } catch (error) { return { error: error instanceof Error ? error.message : "Invalid timetable." }; }
  const sql = await dbReady();
  await sql`update settings set timetable_config = ${JSON.stringify(config)}::jsonb, updated_at = now() where singleton = true`;
  await logEvent({ action: "save_timetable", actor: session.username, role: session.role, details: { monday: config.monday.length, tuesday: config.tuesday.length, wednesday: config.wednesday.length, thursday: config.thursday.length, friday: config.friday.length, flex: config.flex.length } });
  revalidatePath("/admin/timetable");
  return { success: "Timetable saved. The daily preview has been updated." };
}
