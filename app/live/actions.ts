"use server";

import { requireRole } from "@/lib/auth";
import { dbReady } from "@/lib/db";
import { logEvent } from "@/lib/log";
import { revalidatePath } from "next/cache";

export async function setLiveMessageHidden(id: string, hidden: boolean) {
  const session = await requireRole("admin");
  if (typeof hidden !== "boolean" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error("Invalid message");
  const sql = await dbReady();
  const rows = await sql`update dispatches set hidden_from_live = ${hidden} where id = ${id} and success = true returning id`;
  await logEvent({ action: "live_visibility", actor: session.username, role: session.role, success: rows.length > 0, details: { id, hidden } });
  if (!rows.length) throw new Error("Message not found");
  revalidatePath("/live");
}

export async function updateLiveChannelName(name: string) {
  const session = await requireRole("admin");
  const next = name.trim();
  if (next.length < 1 || next.length > 60) throw new Error("Channel names must be between 1 and 60 characters.");
  const sql = await dbReady();
  await sql`update settings set live_channel_name = ${next}, updated_at = now() where singleton = true`;
  await logEvent({ action: "update_live_channel_name", actor: session.username, role: session.role, details: { length: next.length } });
  revalidatePath("/live");
  return { name: next };
}
