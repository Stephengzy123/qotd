"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { clearSession, createSession, requireRole, verifyCredentials } from "@/lib/auth";
import { dbReady } from "@/lib/db";
import { encryptSecret, hashAddress, validateDiscordWebhook } from "@/lib/security";
import { isValidAnnouncementDate, isValidFuturePacificDate, sendAnnouncement, sendPendingNotification, validateAnnouncementTemplate, type AnnouncementType } from "@/lib/qotd";
import { fetchCalendarByUrl, normalizeCalendarFeedUrl } from "@/lib/calendar";

function messageUrl(path: string, kind: "ok" | "error", message: string) {
  return `${path}?${kind}=${encodeURIComponent(message)}`;
}

async function clientHash() {
  const h = await headers();
  const address = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  return hashAddress(address);
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
  const type: AnnouncementType = formData.get("type") === "event" ? "event" : "announcement";
  const announcement = String(formData.get("announcement") || "").trim();
  const eventTitle = String(formData.get("eventTitle") || "").trim();
  const scheduledDate = String(formData.get("scheduledDate") || "");
  const note = String(formData.get("note") || "").trim();
  if (announcement.length < 8 || announcement.length > 1500) {
    redirect(messageUrl("/contribute", "error", "Announcements must be between 8 and 1,500 characters."));
  }
  if (type === "announcement" && !isValidAnnouncementDate(scheduledDate)) redirect(messageUrl("/contribute", "error", "Choose an announcement date whose previous-day 6 PM publishing window has not passed."));
  if (type === "event" && !isValidFuturePacificDate(scheduledDate)) redirect(messageUrl("/contribute", "error", "Choose a valid future event publish date."));
  if (type === "event" && (eventTitle.length < 1 || eventTitle.length > 200)) redirect(messageUrl("/contribute", "error", "Event titles must be between 1 and 200 characters."));
  if (note.length > 500) redirect(messageUrl("/contribute", "error", "Notes must be 500 characters or fewer."));
  const ipHash = await clientHash();
  const sql = await dbReady();
  const recent = Number((await sql`
    select count(*)::int as count from questions
    where submitter_ip_hash = ${ipHash} and created_at > now() - interval '1 hour'
  `)[0].count);
  if (recent >= 8) redirect(messageUrl("/contribute", "error", "You’ve submitted several announcements recently. Please try again in a little while."));
  await sql`insert into questions (question, contributor_note, scheduled_date, question_type, event_title, submitter_ip_hash) values (${announcement}, ${note || null}, ${scheduledDate}, ${type}, ${type === "event" ? eventTitle : null}, ${ipHash})`;
  await sendPendingNotification(announcement, scheduledDate, type, type === "event" ? eventTitle : null);
  revalidatePath("/admin");
  redirect(messageUrl("/contribute", "ok", "Your announcement is ready for review."));
}

export async function reviewQuestionAction(formData: FormData) {
  await requireRole("admin");
  const id = String(formData.get("id") || "");
  const type: AnnouncementType = formData.get("type") === "event" ? "event" : "announcement";
  const announcement = String(formData.get("announcement") || "").trim();
  const eventTitle = String(formData.get("eventTitle") || "").trim();
  const scheduledDate = String(formData.get("scheduledDate") || "");
  const requestedDaysEarly = daysEarlyValue(formData);
  const intent = String(formData.get("intent") || "save");
  if (!id || announcement.length < 8 || announcement.length > 1500) redirect(messageUrl("/admin", "error", "Check the announcement length and try again."));
  const status = intent === "approve" ? "approved" : intent === "reject" ? "rejected" : "pending";
  const sql = await dbReady();
  if (status === "rejected") {
    await sql`update questions set question = ${announcement}, status = 'rejected', updated_at = now() where id = ${id} and status <> 'sent'`;
  } else {
    const daysEarly = type === "announcement" ? requestedDaysEarly : 0;
    if (daysEarly === null) redirect(messageUrl("/admin", "error", "Days early must be between 0 and 365."));
    if (type === "announcement" && !isValidAnnouncementDate(scheduledDate, new Date(), daysEarly)) redirect(messageUrl("/admin", "error", "Choose an announcement date whose calculated 6 PM publishing window has not passed."));
    if (type === "event" && !isValidFuturePacificDate(scheduledDate)) redirect(messageUrl("/admin", "error", "Choose a valid future event publish date."));
    if (type === "event" && (eventTitle.length < 1 || eventTitle.length > 200)) redirect(messageUrl("/admin", "error", "Event titles must be between 1 and 200 characters."));
    await sql`update questions set question = ${announcement}, scheduled_date = ${scheduledDate}, question_type = ${type}, event_title = ${type === "event" ? eventTitle : null}, days_early = ${daysEarly}, status = ${status}, updated_at = now() where id = ${id} and status <> 'sent'`;
  }
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
  if (announcement.length < 8 || announcement.length > 1500) {
    redirect(messageUrl("/admin", "error", "Announcements must be between 8 and 1,500 characters."));
  }
  const daysEarly = type === "announcement" ? requestedDaysEarly : 0;
  if (daysEarly === null) redirect(messageUrl("/admin", "error", "Days early must be between 0 and 365."));
  if (type === "announcement" && !isValidAnnouncementDate(scheduledDate, new Date(), daysEarly)) redirect(messageUrl("/admin", "error", "Choose an announcement date whose calculated 6 PM publishing window has not passed."));
  if (type === "event" && !isValidFuturePacificDate(scheduledDate)) redirect(messageUrl("/admin", "error", "Choose a valid future event publish date."));
  if (type === "event" && (eventTitle.length < 1 || eventTitle.length > 200)) redirect(messageUrl("/admin", "error", "Event titles must be between 1 and 200 characters."));
  const sql = await dbReady();
  await sql`
    insert into questions (question, scheduled_date, question_type, event_title, days_early, status, submitter_ip_hash)
    values (${announcement}, ${scheduledDate}, ${type}, ${type === "event" ? eventTitle : null}, ${daysEarly}, 'approved', ${hashAddress(`admin:${session.username}`)})
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
  const announcementTemplate = String(formData.get("announcementTemplate") || "").trim();
  const eventTemplate = String(formData.get("eventTemplate") || "").trim();
  const webhook = String(formData.get("webhook") || "").trim();
  const calendarFeed = String(formData.get("calendarFeed") || "").trim();
  const roleId = String(formData.get("roleId") || "").trim();
  const notificationWebhook = String(formData.get("notificationWebhook") || "").trim();
  const notificationUserId = String(formData.get("notificationUserId") || "").trim();
  const announcementTemplateError = validateAnnouncementTemplate(announcementTemplate, "announcement");
  const eventTemplateError = validateAnnouncementTemplate(eventTemplate, "event");
  if (announcementTemplateError) redirect(messageUrl("/admin", "error", announcementTemplateError));
  if (eventTemplateError) redirect(messageUrl("/admin", "error", eventTemplateError));
  if (!/^\d{15,22}$/.test(roleId)) redirect(messageUrl("/admin", "error", "The announcement role ID must contain 15–22 digits."));
  if (notificationUserId && !/^\d{15,22}$/.test(notificationUserId)) redirect(messageUrl("/admin", "error", "The notification user ID must contain 15–22 digits."));
  if (webhook && !validateDiscordWebhook(webhook)) redirect(messageUrl("/admin", "error", "Enter a valid Discord webhook URL."));
  if (notificationWebhook && !validateDiscordWebhook(notificationWebhook)) redirect(messageUrl("/admin", "error", "Enter a valid notification webhook URL."));
  const normalizedCalendarFeed = calendarFeed ? normalizeCalendarFeedUrl(calendarFeed) : null;
  if (calendarFeed && !normalizedCalendarFeed) redirect(messageUrl("/admin", "error", "Enter a valid HTTPS or webcal calendar feed URL."));
  if (normalizedCalendarFeed) {
    try {
      await fetchCalendarByUrl(normalizedCalendarFeed);
    } catch {
      redirect(messageUrl("/admin", "error", "The calendar feed could not be read. Check its URL and try again."));
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
