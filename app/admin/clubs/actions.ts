"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { CLUB_POST_MAX_LENGTH, createClub, deleteClub, getClub, postClubMessage, removeMembership, renameClub, saveClubWebhook, setMembership, type ClubRole } from "@/lib/clubs";
import { logEvent } from "@/lib/log";
import { validateDiscordWebhook } from "@/lib/security";

const UUID = /^[0-9a-f-]{36}$/i;

function messageUrl(path: string, kind: "ok" | "error", message: string) {
  return `${path}?${kind}=${encodeURIComponent(message)}`;
}

async function fail(path: string, actor: { username: string; role: string }, action: string, message: string, details: Record<string, unknown> = {}): Promise<never> {
  await logEvent({ action, actor: actor.username, role: actor.role, success: false, details: { ...details, reason: message } });
  redirect(messageUrl(path, "error", message));
}

function refresh(clubId?: string) {
  revalidatePath("/admin", "layout");
  revalidatePath("/club");
  if (clubId) revalidatePath(`/admin/clubs/${clubId}`);
}

export async function createClubAction(formData: FormData) {
  const session = await requireRole("admin");
  const name = String(formData.get("name") || "").trim();
  const result = await createClub(name, session.username);
  if (result.error !== undefined) await fail("/admin/clubs", session, "create_club", result.error, { clubName: name });
  await logEvent({ action: "create_club", actor: session.username, role: session.role, details: { clubId: result.id, clubName: name } });
  refresh();
  redirect(messageUrl(`/admin/clubs/${result.id}`, "ok", `“${name}” created. Connect its channel webhook and add a leader.`));
}

export async function renameClubAction(formData: FormData) {
  const session = await requireRole("admin");
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  if (!UUID.test(id)) await fail("/admin/clubs", session, "rename_club", "Invalid club.", { id });
  const error = await renameClub(id, name);
  if (error) await fail(`/admin/clubs/${id}`, session, "rename_club", error, { clubId: id, clubName: name });
  await logEvent({ action: "rename_club", actor: session.username, role: session.role, details: { clubId: id, clubName: name } });
  refresh(id);
  redirect(messageUrl(`/admin/clubs/${id}`, "ok", "Club renamed."));
}

export async function deleteClubAction(formData: FormData) {
  const session = await requireRole("admin");
  const id = String(formData.get("id") || "");
  if (!UUID.test(id)) await fail("/admin/clubs", session, "delete_club", "Invalid club.", { id });
  const name = (await deleteClub(id)) ?? await fail("/admin/clubs", session, "delete_club", "That club no longer exists.", { clubId: id });
  await logEvent({ action: "delete_club", actor: session.username, role: session.role, details: { clubId: id, clubName: name } });
  refresh();
  redirect(messageUrl("/admin/clubs", "ok", `“${name}” deleted. Its members keep their accounts but no longer belong to a club.`));
}

export async function saveClubWebhookAction(formData: FormData) {
  const session = await requireRole("admin");
  const id = String(formData.get("id") || "");
  const webhook = String(formData.get("webhook") || "").trim();
  const path = `/admin/clubs/${id}`;
  if (!UUID.test(id)) await fail("/admin/clubs", session, "save_club_webhook", "Invalid club.", { id });
  const club = (await getClub(id)) ?? await fail("/admin/clubs", session, "save_club_webhook", "That club no longer exists.", { clubId: id });
  if (!validateDiscordWebhook(webhook)) await fail(path, session, "save_club_webhook", "Enter a valid Discord webhook URL.", { clubId: id, club: club.name });
  await saveClubWebhook(id, webhook);
  // Never log the webhook itself.
  await logEvent({ action: "save_club_webhook", actor: session.username, role: session.role, details: { clubId: id, club: club.name } });
  refresh(id);
  redirect(messageUrl(path, "ok", `Channel connected for “${club.name}”.`));
}

// Admins can post straight to any club's channel.
export async function postAsClubAction(formData: FormData) {
  const session = await requireRole("admin");
  const id = String(formData.get("id") || "");
  const message = String(formData.get("message") || "").trim();
  const path = `/admin/clubs/${id}`;
  if (!UUID.test(id)) await fail("/admin/clubs", session, "club_post", "Invalid club.", { id });
  const club = (await getClub(id)) ?? await fail("/admin/clubs", session, "club_post", "That club no longer exists.", { clubId: id });
  if (message.length < 1 || message.length > CLUB_POST_MAX_LENGTH) await fail(path, session, "club_post", `Messages must be between 1 and ${CLUB_POST_MAX_LENGTH.toLocaleString()} characters.`, { club: club.name, messageLength: message.length });
  const result = await postClubMessage(club, { accountId: session.accountId ?? null, username: session.username, role: session.role }, message, formData.getAll("webhookIds").map(String), String(formData.get("requestId") || ""));
  refresh(id);
  redirect(result.error !== undefined ? messageUrl(path, "error", result.error) : messageUrl(path, "ok", `Posted to ${club.name}’s channel.`));
}

export async function setMemberRoleAction(formData: FormData) {
  const session = await requireRole("admin");
  const clubId = String(formData.get("clubId") || "");
  const accountId = String(formData.get("accountId") || "");
  const role: ClubRole = "leader";
  if (formData.get("clubRole") !== "leader") redirect("/admin/clubs?error=Only+club+managers+can+be+assigned");
  const path = `/admin/clubs/${clubId}`;
  if (!UUID.test(clubId) || !UUID.test(accountId)) await fail("/admin/clubs", session, "update_club_member", "Invalid club or account.", { clubId, accountId });
  if (formData.get("intent") === "remove") {
    await removeMembership(accountId);
    await logEvent({ action: "remove_club_member", actor: session.username, role: session.role, details: { clubId, accountId } });
    refresh(clubId);
    redirect(messageUrl(path, "ok", "Member removed from the club. Their account still exists."));
  }
  const error = await setMembership(accountId, clubId, role);
  if (error) await fail(path, session, "update_club_member", error, { clubId, accountId, clubRole: role });
  await logEvent({ action: "update_club_member", actor: session.username, role: session.role, details: { clubId, accountId, clubRole: role } });
  refresh(clubId);
  redirect(messageUrl(path, "ok", "Now a club manager."));
}
