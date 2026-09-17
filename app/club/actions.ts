"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { CLUB_POST_MAX_LENGTH, postClubDestinations } from "@/lib/clubs";
import { logEvent } from "@/lib/log";

function messageUrl(kind: "ok" | "error", message: string) {
  return `/club?${kind}=${encodeURIComponent(message)}`;
}

export async function postClubMessageAction(formData: FormData) {
  const session = await requireRole("club_leader");
  const message = String(formData.get("message") || "").trim();
  const accountId = session.accountId ?? redirect(messageUrl("error", "Sign in again to post."));
  if (message.length < 1 || message.length > CLUB_POST_MAX_LENGTH) {
    await logEvent({ action: "club_post", actor: session.username, role: session.role, success: false, details: { reason: "Invalid length", messageLength: message.length } });
    redirect(messageUrl("error", `Messages must be between 1 and ${CLUB_POST_MAX_LENGTH.toLocaleString()} characters.`));
  }
  const result = await postClubDestinations({ id: accountId, username: session.username }, message, formData.getAll("webhookIds").map(String), String(formData.get("requestId") || ""));
  revalidatePath("/club");
  redirect(result.error !== undefined ? messageUrl("error", result.error) : messageUrl("ok", "Posted to the selected Discord channels."));
}
