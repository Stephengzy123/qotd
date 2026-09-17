"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { CLUB_POST_MAX_LENGTH, getMembership, postClubMessage, reviewClubPost, submitClubPost } from "@/lib/clubs";
import { logEvent } from "@/lib/log";

function messageUrl(kind: "ok" | "error", message: string) {
  return `/club?${kind}=${encodeURIComponent(message)}`;
}

function refresh() {
  revalidatePath("/club");
  revalidatePath("/admin", "layout");
}

// Leaders post straight away; assistants queue the post for their leader.
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
  if (membership.club_role === "assistant") {
    await submitClubPost(membership.club, author, message);
    refresh();
    redirect(messageUrl("ok", "Sent to your club leader for approval."));
  }
  const result = await postClubMessage(membership.club, author, message);
  refresh();
  redirect(result.error !== undefined ? messageUrl("error", result.error) : messageUrl("ok", "Posted to your channel."));
}

export async function reviewClubPostAction(formData: FormData) {
  const session = await requireRole("club_leader");
  const postId = String(formData.get("postId") || "");
  const decision = formData.get("decision") === "reject" ? "reject" : "approve";
  const accountId = session.accountId ?? redirect(messageUrl("error", "Sign in again."));
  const membership = (await getMembership(accountId)) ?? redirect(messageUrl("error", "You’re not in a club yet."));
  if (membership.club_role !== "leader") redirect(messageUrl("error", "Only club leaders can approve posts."));
  if (!/^[0-9a-f-]{36}$/i.test(postId)) redirect(messageUrl("error", "Invalid post."));
  const result = await reviewClubPost(membership.club, postId, { accountId, username: session.username, role: session.role }, decision);
  refresh();
  redirect(result.error !== undefined ? messageUrl("error", result.error) : messageUrl("ok", decision === "approve" ? "Approved and posted." : "Post rejected."));
}
