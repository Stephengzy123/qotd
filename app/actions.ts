"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { clearSession, createSession, requireRole, verifyCredentials } from "@/lib/auth";
import { dbReady } from "@/lib/db";
import { encryptSecret, hashAddress, validateDiscordWebhook } from "@/lib/security";
import { isValidFuturePacificDate, sendAnnouncement, sendPendingNotification } from "@/lib/qotd";

function messageUrl(path: string, kind: "ok" | "error", message: string) {
  return `${path}?${kind}=${encodeURIComponent(message)}`;
}

async function clientHash() {
  const h = await headers();
  const address = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  return hashAddress(address);
}

export async function loginAction(formData: FormData) {
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "");
  const role = await verifyCredentials(username, password);
  if (!role) redirect(messageUrl("/login", "error", "Those credentials weren’t recognized."));
  await createSession(role, username);
  redirect(role === "admin" ? "/admin" : "/contribute");
}

export async function logoutAction() {
  await clearSession();
  redirect("/login");
}

export async function submitQuestionAction(formData: FormData) {
  await requireRole("contributor");
  const announcement = String(formData.get("announcement") || "").trim();
  const scheduledDate = String(formData.get("scheduledDate") || "");
  const note = String(formData.get("note") || "").trim();
  if (announcement.length < 8 || announcement.length > 1500) {
    redirect(messageUrl("/contribute", "error", "Announcements must be between 8 and 1,500 characters."));
  }
  if (!isValidFuturePacificDate(scheduledDate)) redirect(messageUrl("/contribute", "error", "Choose a valid Pacific date after today."));
  if (note.length > 500) redirect(messageUrl("/contribute", "error", "Notes must be 500 characters or fewer."));
  const ipHash = await clientHash();
  const sql = await dbReady();
  const recent = Number((await sql`
    select count(*)::int as count from questions
    where submitter_ip_hash = ${ipHash} and created_at > now() - interval '1 hour'
  `)[0].count);
  if (recent >= 8) redirect(messageUrl("/contribute", "error", "You’ve submitted several announcements recently. Please try again in a little while."));
  await sql`insert into questions (question, contributor_note, scheduled_date, submitter_ip_hash) values (${announcement}, ${note || null}, ${scheduledDate}, ${ipHash})`;
  await sendPendingNotification(announcement, scheduledDate);
  revalidatePath("/admin");
  redirect(messageUrl("/contribute", "ok", "Your announcement is ready for review."));
}

export async function reviewQuestionAction(formData: FormData) {
  await requireRole("admin");
  const id = String(formData.get("id") || "");
  const announcement = String(formData.get("announcement") || "").trim();
  const scheduledDate = String(formData.get("scheduledDate") || "");
  const intent = String(formData.get("intent") || "save");
  if (!id || announcement.length < 8 || announcement.length > 1500) redirect(messageUrl("/admin", "error", "Check the announcement length and try again."));
  const status = intent === "approve" ? "approved" : intent === "reject" ? "rejected" : "pending";
  const sql = await dbReady();
  if (status === "rejected") {
    await sql`update questions set question = ${announcement}, status = 'rejected', updated_at = now() where id = ${id} and status <> 'sent'`;
  } else {
    if (!isValidFuturePacificDate(scheduledDate)) redirect(messageUrl("/admin", "error", "Choose a valid Pacific date after today."));
    await sql`update questions set question = ${announcement}, scheduled_date = ${scheduledDate}, status = ${status}, updated_at = now() where id = ${id} and status <> 'sent'`;
  }
  revalidatePath("/admin");
  redirect(messageUrl("/admin", "ok", status === "approved" ? "Announcement approved." : status === "rejected" ? "Announcement rejected." : "Changes saved."));
}

export async function addApprovedQuestionAction(formData: FormData) {
  const session = await requireRole("admin");
  const announcement = String(formData.get("announcement") || "").trim();
  const scheduledDate = String(formData.get("scheduledDate") || "");
  if (announcement.length < 8 || announcement.length > 1500) {
    redirect(messageUrl("/admin", "error", "Announcements must be between 8 and 1,500 characters."));
  }
  if (!isValidFuturePacificDate(scheduledDate)) redirect(messageUrl("/admin", "error", "Choose a valid Pacific date after today."));
  const sql = await dbReady();
  await sql`
    insert into questions (question, scheduled_date, status, submitter_ip_hash)
    values (${announcement}, ${scheduledDate}, 'approved', ${hashAddress(`admin:${session.username}`)})
  `;
  revalidatePath("/admin");
  redirect(messageUrl("/admin", "ok", "Announcement added to Approved."));
}

export async function unapproveQuestionAction(formData: FormData) {
  await requireRole("admin");
  const id = String(formData.get("id") || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect(messageUrl("/admin", "error", "Invalid announcement."));
  const sql = await dbReady();
  await sql`update questions set status = 'pending', updated_at = now() where id = ${id} and status = 'approved'`;
  revalidatePath("/admin");
  redirect(messageUrl("/admin", "ok", "Announcement moved back to Pending."));
}

export async function deleteApprovedQuestionAction(formData: FormData) {
  await requireRole("admin");
  const id = String(formData.get("id") || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect(messageUrl("/admin", "error", "Invalid announcement."));
  const sql = await dbReady();
  await sql`delete from questions where id = ${id} and status = 'approved'`;
  revalidatePath("/admin");
  redirect(messageUrl("/admin", "ok", "Announcement deleted."));
}

export async function saveSettingsAction(formData: FormData) {
  await requireRole("admin");
  const webhook = String(formData.get("webhook") || "").trim();
  const roleId = String(formData.get("roleId") || "").trim();
  const notificationWebhook = String(formData.get("notificationWebhook") || "").trim();
  const notificationUserId = String(formData.get("notificationUserId") || "").trim();
  if (!/^\d{15,22}$/.test(roleId)) redirect(messageUrl("/admin", "error", "The announcement role ID must contain 15–22 digits."));
  if (notificationUserId && !/^\d{15,22}$/.test(notificationUserId)) redirect(messageUrl("/admin", "error", "The notification user ID must contain 15–22 digits."));
  if (webhook && !validateDiscordWebhook(webhook)) redirect(messageUrl("/admin", "error", "Enter a valid Discord webhook URL."));
  if (notificationWebhook && !validateDiscordWebhook(notificationWebhook)) redirect(messageUrl("/admin", "error", "Enter a valid notification webhook URL."));
  const sql = await dbReady();
  await sql`update settings set
    mention_role_id = ${roleId},
    webhook_url_encrypted = coalesce(${webhook ? encryptSecret(webhook) : null}, webhook_url_encrypted),
    notification_webhook_url_encrypted = coalesce(${notificationWebhook ? encryptSecret(notificationWebhook) : null}, notification_webhook_url_encrypted),
    notification_user_id = ${notificationUserId || null},
    updated_at = now()
    where singleton = true`;
  revalidatePath("/admin");
  redirect(messageUrl("/admin", "ok", "Delivery settings saved."));
}

export async function sendQuestionAction(formData: FormData) {
  await requireRole("admin");
  const id = String(formData.get("id") || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect(messageUrl("/admin", "error", "Select an announcement to send."));
  const result = await sendAnnouncement(id, "manual_selected");
  revalidatePath("/admin");
  redirect(messageUrl("/admin", "error" in result ? "error" : "ok", "error" in result ? (result.error || "Send failed.") : "Announcement sent to Discord."));
}
