"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { CLUB_POST_MAX_LENGTH, getMembership, postClubMessage } from "@/lib/clubs";
import { logEvent } from "@/lib/log";

function messageUrl(kind: "ok" | "error", message: string) {
  return `/club?${kind}=${encodeURIComponent(message)}`;
}

function refresh() {
  revalidatePath("/club");
  revalidatePath("/admin", "layout");
}

// Only the assigned club manager may post.
export async function postClubMessageAction(formData: FormData) {
  const session = await requireRole("club_leader");
  const message = String(formData.get("message") || "").trim();
  const accountId = session.accountId ?? redirect(messageUrl("error", "Sign in again to post."));
  const membership = (await getMembership(accountId)) ?? redirect(messageUrl("error", "You’re not in a club yet. Ask an admin to add you to one."));
  if (message.length < 1 || message.length > CLUB_POST_MAX_LENGTH) {
    await logEvent({ action: "club_post", actor: session.username, role: session.role, success: false, details: { reason: "Invalid length", messageLength: message.length } });
    redirect(messageUrl("error", `Messages must be between 1 and ${CLUB_POST_MAX_LENGTH.toLocaleString()} characters.`));
  }
  const author = { accountId, username: session.username, role: session.role };
  if (membership.club_role !== "leader") redirect(messageUrl("error", "Only club managers and admins can post."));
  const result = await postClubMessage(membership.club, author, message, formData.getAll("webhookIds").map(String), String(formData.get("requestId") || ""));
  refresh();
  redirect(result.error !== undefined ? messageUrl("error", result.error) : messageUrl("ok", "Posted to your channel."));
}
