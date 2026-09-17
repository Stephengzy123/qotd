"use server";
import { scheduleLivePush } from "@/lib/web-push";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { clearSession, createSession, getSession, homePath, requireRole, verifyCredentials } from "@/lib/auth";
import { dbReady } from "@/lib/db";
import { encryptSecret, hashAddress, validateDiscordWebhook } from "@/lib/security";
import { isValidAnnouncementDate, isValidFuturePacificDate, normalizeDiscordTemplate, sendAnnouncement, sendPendingNotification, validateAnnouncementTemplate, type AnnouncementType } from "@/lib/qotd";
import { fetchCalendarByUrl, normalizeCalendarFeedUrl } from "@/lib/calendar";
import { createAccount, createSetupLink, deleteAccount, getAccount, parseRole, ROLE_LABELS, updateAccountRole } from "@/lib/accounts";
import { createClub, setMembership, type ClubRole } from "@/lib/clubs";
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
  redirect(homePath(role));
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
  revalidatePath("/admin", "layout");
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
  if (!id || announcement.length < 8 || announcement.length > 1500) await fail("/admin/pending", session, action, "Check the announcement length and try again.", details);
  const sql = await dbReady();
  let updated: { id: string }[];
  if (status === "rejected") {
    updated = await sql<{ id: string }[]>`update questions set question = ${announcement}, status = 'rejected', updated_at = now() where id = ${id} and status <> 'sent' returning id`;
  } else {
    const daysEarly = type === "announcement" ? (requestedDaysEarly ?? await fail("/admin/pending", session, action, "Days early must be between 0 and 365.", details)) : 0;
    if (type === "announcement" && !isValidAnnouncementDate(scheduledDate, new Date(), daysEarly)) await fail("/admin/pending", session, action, "Choose an announcement date whose calculated 6 PM publishing window has not passed.", details);
    if (type === "event" && !isValidFuturePacificDate(scheduledDate)) await fail("/admin/pending", session, action, "Choose a valid future event publish date.", details);
    if (type === "event" && (eventTitle.length < 1 || eventTitle.length > 200)) await fail("/admin/pending", session, action, "Event titles must be between 1 and 200 characters.", details);
    updated = await sql<{ id: string }[]>`update questions set question = ${announcement}, scheduled_date = ${scheduledDate}, question_type = ${type}, event_title = ${type === "event" ? eventTitle : null}, days_early = ${daysEarly}, status = ${status}, updated_at = now() where id = ${id} and status <> 'sent' returning id`;
  }
  await logEvent({ action, actor: session.username, role: session.role, success: updated.length > 0, details: { ...details, updated: updated.length > 0 } });
  revalidatePath("/admin", "layout");
  redirect(messageUrl("/admin/pending", "ok", status === "approved" ? "Announcement approved." : status === "rejected" ? "Announcement rejected." : "Changes saved."));
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
    await fail("/admin/approved", session, action, "Announcements must be between 8 and 1,500 characters.", details);
  }
  const daysEarly = type === "announcement" ? (requestedDaysEarly ?? await fail("/admin/approved", session, action, "Days early must be between 0 and 365.", details)) : 0;
  if (type === "announcement" && !isValidAnnouncementDate(scheduledDate, new Date(), daysEarly)) await fail("/admin/approved", session, action, "Choose an announcement date whose calculated 6 PM publishing window has not passed.", details);
  if (type === "event" && !isValidFuturePacificDate(scheduledDate)) await fail("/admin/approved", session, action, "Choose a valid future event publish date.", details);
  if (type === "event" && (eventTitle.length < 1 || eventTitle.length > 200)) await fail("/admin/approved", session, action, "Event titles must be between 1 and 200 characters.", details);
  const sql = await dbReady();
  const inserted = await sql<{ id: string }[]>`
    insert into questions (question, scheduled_date, question_type, event_title, days_early, status, submitter_ip_hash)
    values (${announcement}, ${scheduledDate}, ${type}, ${type === "event" ? eventTitle : null}, ${daysEarly}, 'approved', ${hashAddress(`admin:${session.username}`)})
    returning id
  `;
  await logEvent({ action, actor: session.username, role: session.role, details: { ...details, id: inserted[0]?.id } });
  revalidatePath("/admin", "layout");
  redirect(messageUrl("/admin/approved", "ok", "Announcement added to Approved."));
}

export async function unapproveQuestionAction(formData: FormData) {
  const session = await requireRole("admin");
  const id = String(formData.get("id") || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) await fail("/admin/approved", session, "unapprove_announcement", "Invalid announcement.", { id });
  const sql = await dbReady();
  const updated = await sql`update questions set status = 'pending', updated_at = now() where id = ${id} and status = 'approved' returning id`;
  await logEvent({ action: "unapprove_announcement", actor: session.username, role: session.role, success: updated.length > 0, details: { id, updated: updated.length > 0 } });
  revalidatePath("/admin", "layout");
  redirect(messageUrl("/admin/approved", "ok", "Announcement moved back to Pending."));
}

export async function deleteApprovedQuestionAction(formData: FormData) {
  const session = await requireRole("admin");
  const id = String(formData.get("id") || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) await fail("/admin/approved", session, "delete_announcement", "Invalid announcement.", { id });
  const sql = await dbReady();
  const deleted = await sql<{ question: string }[]>`delete from questions where id = ${id} and status = 'approved' returning question`;
  await logEvent({ action: "delete_announcement", actor: session.username, role: session.role, success: deleted.length > 0, details: { id, deleted: deleted.length > 0, excerpt: deleted[0]?.question.slice(0, 120) } });
  revalidatePath("/admin", "layout");
  redirect(messageUrl("/admin/approved", "ok", "Announcement deleted."));
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
  if (announcementTemplateError) await fail("/admin/settings", session, action, announcementTemplateError, details);
  if (eventTemplateError) await fail("/admin/settings", session, action, eventTemplateError, details);
  if (!/^\d{15,22}$/.test(roleId)) await fail("/admin/settings", session, action, "The announcement role ID must contain 15–22 digits.", details);
  if (notificationUserId && !/^\d{15,22}$/.test(notificationUserId)) await fail("/admin/settings", session, action, "The notification user ID must contain 15–22 digits.", details);
  if (webhook && !validateDiscordWebhook(webhook)) await fail("/admin/settings", session, action, "Enter a valid Discord webhook URL.", details);
  if (notificationWebhook && !validateDiscordWebhook(notificationWebhook)) await fail("/admin/settings", session, action, "Enter a valid notification webhook URL.", details);
  const normalizedCalendarFeed = calendarFeed ? normalizeCalendarFeedUrl(calendarFeed) : null;
  if (calendarFeed && !normalizedCalendarFeed) await fail("/admin/settings", session, action, "Enter a valid HTTPS or webcal calendar feed URL.", details);
  if (normalizedCalendarFeed) {
    try {
      await fetchCalendarByUrl(normalizedCalendarFeed);
    } catch {
      await fail("/admin/settings", session, action, "The calendar feed could not be read. Check its URL and try again.", { ...details, error: "calendar_feed_unreadable" });
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
  revalidatePath("/admin", "layout");
  redirect(messageUrl("/admin/settings", "ok", "Delivery settings saved."));
}

export async function sendQuestionAction(formData: FormData) {
  const session = await requireRole("admin");
  const id = String(formData.get("id") || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) await fail("/admin/approved", session, "send_announcement", "Select an announcement to send.", { id });
  const destination = String(formData.get("destination") || "discord");
  if (destination !== "discord" && destination !== "live") await fail("/admin/approved", session, "send_announcement", "Choose a valid destination.", { id });
  const result = await sendAnnouncement(id, "manual_selected", undefined, session.username, { destination: destination as "discord" | "live", removePings: formData.get("removePings") === "on" });
  if (!("error" in result)) scheduleLivePush(result.dispatchId);
  await logEvent({ action: "send_announcement", actor: session.username, role: session.role, success: !("error" in result), details: { id, mode: "manual_selected", error: "error" in result ? result.error : undefined } });
  revalidatePath("/admin", "layout");
  revalidatePath("/live");
  revalidatePath("/contribute");
  redirect(messageUrl("/admin/approved", "error" in result ? "error" : "ok", "error" in result ? (result.error || "Send failed.") : destination === "live" ? "Announcement published to /live only." : "Announcement sent to Discord."));
}

export async function createAccountAction(formData: FormData) {
  const session = await requireRole("admin");
  const username = String(formData.get("username") || "").trim();
  const role = parseRole(formData.get("role")) ?? await fail("/admin/accounts", session, "create_account", "Choose an account type.", { username });
  // Club leaders and assistants belong to a club: an existing one or a new one named here.
  const clubChoice = String(formData.get("club") || "");
  const clubName = String(formData.get("clubName") || "").trim();
  const clubRole: ClubRole = formData.get("clubRole") === "assistant" ? "assistant" : "leader";
  let clubId: string | null = null;
  let createdClub = false;
  if (role === "club_leader") {
    if (clubChoice === "new") {
      const club = await createClub(clubName, session.username);
      clubId = club.id ?? await fail("/admin/accounts", session, "create_club", club.error ?? "The club could not be created.", { clubName });
      createdClub = true;
      await logEvent({ action: "create_club", actor: session.username, role: session.role, details: { clubId, clubName } });
    } else if (/^[0-9a-f-]{36}$/i.test(clubChoice)) {
      clubId = clubChoice;
    } else {
      await fail("/admin/accounts", session, "create_account", "Choose a club for this account.", { username, role });
    }
  }
  const result = await createAccount(username, role, session.username);
  const accountId = result.id ?? await fail("/admin/accounts", session, "create_account", result.error ?? "The account could not be created.", { username, role });
  await logEvent({ action: "create_account", actor: session.username, role: session.role, details: { id: accountId, username, accountRole: role, clubId: clubId ?? undefined, clubRole: clubId ? clubRole : undefined } });
  if (clubId) {
    const membershipError = await setMembership(accountId, clubId, clubRole);
    if (membershipError) {
      await deleteAccount(accountId);
      await fail("/admin/accounts", session, "create_account", membershipError, { username, clubId, clubRole });
    }
  }
  // The person chooses their own password through the setup link.
  await createSetupLink(accountId, session.username);
  await logEvent({ action: "create_setup_link", actor: session.username, role: session.role, details: { id: accountId, username } });
  revalidatePath("/admin", "layout");
  if (createdClub) redirect(messageUrl(`/admin/clubs/${clubId}`, "ok", `“${clubName}” created with ${username} as leader. Connect the channel webhook, then share the setup link from the account page.`));
  redirect(messageUrl(`/admin/accounts/${accountId}`, "ok", `Account “${username}” created as ${ROLE_LABELS[role].toLowerCase()}. Share the setup link below.`));
}

export async function deleteAccountAction(formData: FormData) {
  const session = await requireRole("admin");
  const id = String(formData.get("id") || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) await fail("/admin/accounts", session, "delete_account", "Invalid account.", { id });
  const deleted = (await deleteAccount(id)) ?? await fail("/admin/accounts", session, "delete_account", "That account no longer exists.", { id });
  await logEvent({ action: "delete_account", actor: session.username, role: session.role, details: { id, username: deleted.username, accountRole: deleted.role } });
  revalidatePath("/admin", "layout");
  redirect(messageUrl("/admin/accounts", "ok", `Account “${deleted.username}” deleted.`));
}

export async function updateAccountAction(formData: FormData) {
  const session = await requireRole("admin");
  const id = String(formData.get("id") || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) await fail("/admin/accounts", session, "update_account", "Invalid account.", { id });
  const role = parseRole(formData.get("role")) ?? await fail("/admin/accounts", session, "update_account", "Choose an account type.", { id });
  const username = (await updateAccountRole(id, role)) ?? await fail("/admin/accounts", session, "update_account", "That account no longer exists.", { id, role });
  await logEvent({ action: "update_account", actor: session.username, role: session.role, details: { id, username, accountRole: role } });
  revalidatePath("/admin", "layout");
  revalidatePath(`/admin/accounts/${id}`);
  redirect(messageUrl("/admin/accounts", "ok", `Account “${username}” is now a ${ROLE_LABELS[role].toLowerCase()}.`));
}

// Issues a new setup link. Also the way to reset a password: the old link
// (if any) stops working and the person picks a new password from the new one.
export async function regenerateSetupLinkAction(formData: FormData) {
  const session = await requireRole("admin");
  const id = String(formData.get("id") || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) await fail("/admin/accounts", session, "create_setup_link", "Invalid account.", { id });
  const account = (await getAccount(id)) ?? await fail("/admin/accounts", session, "create_setup_link", "That account no longer exists.", { id });
  await createSetupLink(account.id, session.username);
  await logEvent({ action: "create_setup_link", actor: session.username, role: session.role, details: { id, username: account.username, replacesPassword: account.has_password } });
  revalidatePath(`/admin/accounts/${id}`);
  redirect(messageUrl(`/admin/accounts/${id}`, "ok", "New setup link ready. Earlier links no longer work."));
}
