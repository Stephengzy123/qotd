"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { clearSession, createSession, getSession, requireRole, verifyCredentials } from "@/lib/auth";
import { dbReady } from "@/lib/db";
import { encryptSecret, hashAddress, validateDiscordWebhook } from "@/lib/security";
import { isValidAnnouncementDate, isValidFuturePacificDate, normalizeDiscordTemplate, sendAnnouncement, sendPendingNotification, validateAnnouncementTemplate, type AnnouncementType } from "@/lib/qotd";
import { fetchCalendarByUrl, normalizeCalendarFeedUrl } from "@/lib/calendar";
import { createAccount, deleteAccount, updateAccount } from "@/lib/accounts";
import { logEvent } from "@/lib/log";
import type { Role } from "@/lib/auth";

function messageUrl(path: string, kind: "ok" | "error", message: string) {
  return `${path}?${kind}=${encodeURIComponent(message)}`;
}

async function clientHash() {
  const h = await headers();
  const address = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  return hashAddress(address);
}

type Actor = { username: string; role: Role };

// Log a rejected action, then redirect with the user-facing message.
async function fail(path: string, actor: Actor | null, action: string, message: string, details: Record<string, unknown> = {}): Promise<never> {
  await logEvent({ action, actor: actor?.username, role: actor?.role, success: false, details: { ...details, reason: message } });
  redirect(messageUrl(path, "error", message));
}

function daysEarlyValue(formData: FormData) {
  const raw = String(formData.get("daysEarly") ?? "0");
  if (!/^\d{1,3}$/.test(raw)) return null;
  const value = Number(raw);
  return value >= 0 && value <= 365 ? value : null;
}

export async function loginAction(formData: FormData) {
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "");
  const role = await verifyCredentials(username, password);
  if (!role) {
    await logEvent({ action: "login", actor: username, success: false, details: { reason: "Invalid credentials" } });
    redirect(messageUrl("/login", "error", "Those credentials weren’t recognized."));
  }
  await createSession(role, username);
  await logEvent({ action: "login", actor: username, role });
  redirect(role === "admin" ? "/admin" : "/contribute");
}

export async function logoutAction() {
  const session = await getSession();
  await clearSession();
  await logEvent({ action: "logout", actor: session?.username, role: session?.role });
  redirect("/login");
}

export async function submitQuestionAction(formData: FormData) {
  const session = await requireRole("contributor");
  const action = "submit_announcement";
  if (formData.get("checkedAnnouncements") !== "yes") {
    await fail("/contribute", session, action, "Check the scheduled and recently sent announcements, then confirm that your submission is not repetitive.");
  }
  const type: AnnouncementType = formData.get("type") === "event" ? "event" : "announcement";
  const announcement = String(formData.get("announcement") || "").trim();
  const eventTitle = String(formData.get("eventTitle") || "").trim();
  const scheduledDate = String(formData.get("scheduledDate") || "");
  const note = String(formData.get("note") || "").trim();
  const details = { type, scheduledDate, eventTitle: type === "event" ? eventTitle : undefined, length: announcement.length };
  if (announcement.length < 8 || announcement.length > 1500) {
    await fail("/contribute", session, action, "Announcements must be between 8 and 1,500 characters.", details);
  }
  if (type === "announcement" && !isValidAnnouncementDate(scheduledDate)) await fail("/contribute", session, action, "Choose an announcement date whose previous-day 6 PM publishing window has not passed.", details);
  if (type === "event" && !isValidFuturePacificDate(scheduledDate)) await fail("/contribute", session, action, "Choose a valid future event publish date.", details);
  if (type === "event" && (eventTitle.length < 1 || eventTitle.length > 200)) await fail("/contribute", session, action, "Event titles must be between 1 and 200 characters.", details);
  if (note.length > 500) await fail("/contribute", session, action, "Notes must be 500 characters or fewer.", details);
  const ipHash = await clientHash();
  const sql = await dbReady();
  const recent = Number((await sql`
    select count(*)::int as count from questions
    where submitter_ip_hash = ${ipHash} and created_at > now() - interval '1 hour'
  `)[0].count);
  if (recent >= 8) await fail("/contribute", session, action, "You’ve submitted several announcements recently. Please try again in a little while.", { ...details, recentSubmissions: recent });
  const inserted = await sql<{ id: string }[]>`insert into questions (question, contributor_note, scheduled_date, question_type, event_title, submitter_ip_hash) values (${announcement}, ${note || null}, ${scheduledDate}, ${type}, ${type === "event" ? eventTitle : null}, ${ipHash}) returning id`;
  await logEvent({ action, actor: session.username, role: session.role, details: { ...details, id: inserted[0]?.id, hasNote: Boolean(note) } });
  await sendPendingNotification(announcement, scheduledDate, type, type === "event" ? eventTitle : null);
  revalidatePath("/admin");
  redirect(messageUrl("/contribute", "ok", "Your announcement is ready for review."));
}

export async function reviewQuestionAction(formData: FormData) {
  const session = await requireRole("admin");
  const id = String(formData.get("id") || "");
  const type: AnnouncementType = formData.get("type") === "event" ? "event" : "announcement";
  const announcement = String(formData.get("announcement") || "").trim();
  const eventTitle = String(formData.get("eventTitle") || "").trim();
  const scheduledDate = String(formData.get("scheduledDate") || "");
  const requestedDaysEarly = daysEarlyValue(formData);
  const intent = String(formData.get("intent") || "save");
  const status = intent === "approve" ? "approved" : intent === "reject" ? "rejected" : "pending";
  const action = intent === "approve" ? "approve_announcement" : intent === "reject" ? "reject_announcement" : "edit_announcement";
  const details = { id, type, scheduledDate, eventTitle: type === "event" ? eventTitle : undefined, daysEarly: requestedDaysEarly, length: announcement.length };
  if (!id || announcement.length < 8 || announcement.length > 1500) await fail("/admin", session, action, "Check the announcement length and try again.", details);
  const sql = await dbReady();
  let updated: { id: string }[];
  if (status === "rejected") {
    updated = await sql<{ id: string }[]>`update questions set question = ${announcement}, status = 'rejected', updated_at = now() where id = ${id} and status <> 'sent' returning id`;
  } else {
    const daysEarly = type === "announcement" ? (requestedDaysEarly ?? await fail("/admin", session, action, "Days early must be between 0 and 365.", details)) : 0;
    if (type === "announcement" && !isValidAnnouncementDate(scheduledDate, new Date(), daysEarly)) await fail("/admin", session, action, "Choose an announcement date whose calculated 6 PM publishing window has not passed.", details);
    if (type === "event" && !isValidFuturePacificDate(scheduledDate)) await fail("/admin", session, action, "Choose a valid future event publish date.", details);
    if (type === "event" && (eventTitle.length < 1 || eventTitle.length > 200)) await fail("/admin", session, action, "Event titles must be between 1 and 200 characters.", details);
    updated = await sql<{ id: string }[]>`update questions set question = ${announcement}, scheduled_date = ${scheduledDate}, question_type = ${type}, event_title = ${type === "event" ? eventTitle : null}, days_early = ${daysEarly}, status = ${status}, updated_at = now() where id = ${id} and status <> 'sent' returning id`;
  }
  await logEvent({ action, actor: session.username, role: session.role, success: updated.length > 0, details: { ...details, updated: updated.length > 0 } });
  revalidatePath("/admin");
  redirect(messageUrl("/admin", "ok", status === "approved" ? "Announcement approved." : status === "rejected" ? "Announcement rejected." : "Changes saved."));
}

export async function addApprovedQuestionAction(formData: FormData) {
  const session = await requireRole("admin");
  const type: AnnouncementType = formData.get("type") === "event" ? "event" : "announcement";
  const announcement = String(formData.get("announcement") || "").trim();
  const eventTitle = String(formData.get("eventTitle") || "").trim();
  const scheduledDate = String(formData.get("scheduledDate") || "");
  const requestedDaysEarly = daysEarlyValue(formData);
  const action = "add_approved_announcement";
  const details = { type, scheduledDate, eventTitle: type === "event" ? eventTitle : undefined, daysEarly: requestedDaysEarly, length: announcement.length };
  if (announcement.length < 8 || announcement.length > 1500) {
    await fail("/admin", session, action, "Announcements must be between 8 and 1,500 characters.", details);
  }
  const daysEarly = type === "announcement" ? (requestedDaysEarly ?? await fail("/admin", session, action, "Days early must be between 0 and 365.", details)) : 0;
  if (type === "announcement" && !isValidAnnouncementDate(scheduledDate, new Date(), daysEarly)) await fail("/admin", session, action, "Choose an announcement date whose calculated 6 PM publishing window has not passed.", details);
  if (type === "event" && !isValidFuturePacificDate(scheduledDate)) await fail("/admin", session, action, "Choose a valid future event publish date.", details);
  if (type === "event" && (eventTitle.length < 1 || eventTitle.length > 200)) await fail("/admin", session, action, "Event titles must be between 1 and 200 characters.", details);
  const sql = await dbReady();
  const inserted = await sql<{ id: string }[]>`
    insert into questions (question, scheduled_date, question_type, event_title, days_early, status, submitter_ip_hash)
    values (${announcement}, ${scheduledDate}, ${type}, ${type === "event" ? eventTitle : null}, ${daysEarly}, 'approved', ${hashAddress(`admin:${session.username}`)})
    returning id
  `;
  await logEvent({ action, actor: session.username, role: session.role, details: { ...details, id: inserted[0]?.id } });
  revalidatePath("/admin");
  redirect(messageUrl("/admin", "ok", "Announcement added to Approved."));
}

export async function unapproveQuestionAction(formData: FormData) {
  const session = await requireRole("admin");
  const id = String(formData.get("id") || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) await fail("/admin", session, "unapprove_announcement", "Invalid announcement.", { id });
  const sql = await dbReady();
  const updated = await sql`update questions set status = 'pending', updated_at = now() where id = ${id} and status = 'approved' returning id`;
  await logEvent({ action: "unapprove_announcement", actor: session.username, role: session.role, success: updated.length > 0, details: { id, updated: updated.length > 0 } });
  revalidatePath("/admin");
  redirect(messageUrl("/admin", "ok", "Announcement moved back to Pending."));
}

export async function deleteApprovedQuestionAction(formData: FormData) {
  const session = await requireRole("admin");
  const id = String(formData.get("id") || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) await fail("/admin", session, "delete_announcement", "Invalid announcement.", { id });
  const sql = await dbReady();
  const deleted = await sql<{ question: string }[]>`delete from questions where id = ${id} and status = 'approved' returning question`;
  await logEvent({ action: "delete_announcement", actor: session.username, role: session.role, success: deleted.length > 0, details: { id, deleted: deleted.length > 0, excerpt: deleted[0]?.question.slice(0, 120) } });
  revalidatePath("/admin");
  redirect(messageUrl("/admin", "ok", "Announcement deleted."));
}

export async function saveSettingsAction(formData: FormData) {
  const session = await requireRole("admin");
  const action = "save_settings";
  const announcementTemplate = normalizeDiscordTemplate(String(formData.get("announcementTemplate") || "").trim());
  const eventTemplate = normalizeDiscordTemplate(String(formData.get("eventTemplate") || "").trim());
  const webhook = String(formData.get("webhook") || "").trim();
  const calendarFeed = String(formData.get("calendarFeed") || "").trim();
  const roleId = String(formData.get("roleId") || "").trim();
  const notificationWebhook = String(formData.get("notificationWebhook") || "").trim();
  const notificationUserId = String(formData.get("notificationUserId") || "").trim();
  const announcementTemplateError = validateAnnouncementTemplate(announcementTemplate, "announcement");
  const eventTemplateError = validateAnnouncementTemplate(eventTemplate, "event");
  // Never log secret values; record only which settings changed.
  const details = { roleId, notificationUserId: notificationUserId || null, webhookChanged: Boolean(webhook), notificationWebhookChanged: Boolean(notificationWebhook), calendarFeedChanged: Boolean(calendarFeed) };
  if (announcementTemplateError) await fail("/admin", session, action, announcementTemplateError, details);
  if (eventTemplateError) await fail("/admin", session, action, eventTemplateError, details);
  if (!/^\d{15,22}$/.test(roleId)) await fail("/admin", session, action, "The announcement role ID must contain 15–22 digits.", details);
  if (notificationUserId && !/^\d{15,22}$/.test(notificationUserId)) await fail("/admin", session, action, "The notification user ID must contain 15–22 digits.", details);
  if (webhook && !validateDiscordWebhook(webhook)) await fail("/admin", session, action, "Enter a valid Discord webhook URL.", details);
  if (notificationWebhook && !validateDiscordWebhook(notificationWebhook)) await fail("/admin", session, action, "Enter a valid notification webhook URL.", details);
  const normalizedCalendarFeed = calendarFeed ? normalizeCalendarFeedUrl(calendarFeed) : null;
  if (calendarFeed && !normalizedCalendarFeed) await fail("/admin", session, action, "Enter a valid HTTPS or webcal calendar feed URL.", details);
  if (normalizedCalendarFeed) {
    try {
      await fetchCalendarByUrl(normalizedCalendarFeed);
    } catch {
      await fail("/admin", session, action, "The calendar feed could not be read. Check its URL and try again.", { ...details, error: "calendar_feed_unreadable" });
    }
  }
  const sql = await dbReady();
  await sql`update settings set
    message_template = ${announcementTemplate},
    event_message_template = ${eventTemplate},
    mention_role_id = ${roleId},
    webhook_url_encrypted = coalesce(${webhook ? encryptSecret(webhook) : null}, webhook_url_encrypted),
    calendar_feed_url_encrypted = coalesce(${normalizedCalendarFeed ? encryptSecret(normalizedCalendarFeed) : null}, calendar_feed_url_encrypted),
    notification_webhook_url_encrypted = coalesce(${notificationWebhook ? encryptSecret(notificationWebhook) : null}, notification_webhook_url_encrypted),
    notification_user_id = ${notificationUserId || null},
    updated_at = now()
    where singleton = true`;
  await logEvent({ action, actor: session.username, role: session.role, details });
  revalidatePath("/admin");
  redirect(messageUrl("/admin", "ok", "Delivery settings saved."));
}

export async function sendQuestionAction(formData: FormData) {
  const session = await requireRole("admin");
  const id = String(formData.get("id") || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) await fail("/admin", session, "send_announcement", "Select an announcement to send.", { id });
  const result = await sendAnnouncement(id, "manual_selected", undefined, session.username);
  await logEvent({ action: "send_announcement", actor: session.username, role: session.role, success: !("error" in result), details: { id, mode: "manual_selected", error: "error" in result ? result.error : undefined } });
  revalidatePath("/admin");
  redirect(messageUrl("/admin", "error" in result ? "error" : "ok", "error" in result ? (result.error || "Send failed.") : "Announcement sent to Discord."));
}

export async function createAccountAction(formData: FormData) {
  const session = await requireRole("admin");
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "");
  const role: Role = formData.get("role") === "admin" ? "admin" : "contributor";
  const result = await createAccount(username, password, role, session.username);
  if (result.error !== undefined) await fail("/admin", session, "create_account", result.error, { username, role });
  await logEvent({ action: "create_account", actor: session.username, role: session.role, details: { id: result.id, username, accountRole: role } });
  revalidatePath("/admin");
  redirect(messageUrl("/admin", "ok", `Account “${username}” created as ${role}.`));
}

export async function deleteAccountAction(formData: FormData) {
  const session = await requireRole("admin");
  const id = String(formData.get("id") || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) await fail("/admin", session, "delete_account", "Invalid account.", { id });
  const deleted = (await deleteAccount(id)) ?? await fail("/admin", session, "delete_account", "That account no longer exists.", { id });
  await logEvent({ action: "delete_account", actor: session.username, role: session.role, details: { id, username: deleted.username, accountRole: deleted.role } });
  revalidatePath("/admin");
  redirect(messageUrl("/admin", "ok", `Account “${deleted.username}” deleted.`));
}

export async function updateAccountAction(formData: FormData) {
  const session = await requireRole("admin");
  const id = String(formData.get("id") || "");
  const role: Role = formData.get("role") === "admin" ? "admin" : "contributor";
  const password = String(formData.get("password") || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) await fail("/admin", session, "update_account", "Invalid account.", { id });
  const result = await updateAccount(id, role, password || null);
  if (result.error !== undefined) await fail("/admin", session, "update_account", result.error, { id, role, passwordReset: Boolean(password) });
  await logEvent({ action: "update_account", actor: session.username, role: session.role, details: { id, username: result.username, accountRole: role, passwordReset: Boolean(password) } });
  revalidatePath("/admin");
  redirect(messageUrl("/admin", "ok", password ? `Account “${result.username}” updated and password reset.` : `Account “${result.username}” updated.`));
}
