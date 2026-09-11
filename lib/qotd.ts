import { dbReady } from "@/lib/db";
import { decryptSecret } from "@/lib/security";

export const DEFAULT_ANNOUNCEMENT_TEMPLATE = "# <:sgs:1372767087612657724> Announcements for {date}\n\n{announcement}\n\n-# {mention-role}";
export const DEFAULT_EVENT_TEMPLATE = "# <:sgs:1372767087612657724> Announcement for {title}\n\n{announcement}\n\n-# {mention-role}";
const COMMON_TEMPLATE_TOKENS = ["{date}", "{announcement}", "{mention-role}"];
export type AnnouncementType = "announcement" | "event";

export function pacificParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
  return { localDate: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

export function addDays(localDate: string, days: number) {
  const date = new Date(`${localDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function isValidFuturePacificDate(value: string, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return false;
  return value > pacificParts(now).localDate;
}

export function minimumAnnouncementDate(now = new Date()) {
  const { localDate, hour } = pacificParts(now);
  return addDays(localDate, hour >= 18 ? 2 : 1);
}

export function isValidAnnouncementDate(value: string, now = new Date()) {
  return isValidFuturePacificDate(value, now) && value >= minimumAnnouncementDate(now);
}

export function scheduledDateValue(value: unknown) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  if (typeof value !== "string") return null;
  const localDate = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (!localDate) return null;
  const parsed = new Date(`${localDate}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === localDate ? localDate : null;
}

export function displayScheduledDate(value: unknown) {
  const localDate = scheduledDateValue(value);
  if (!localDate) return "Date unavailable";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
  }).format(new Date(`${localDate}T12:00:00Z`));
}

export function validateAnnouncementTemplate(template: string, type: AnnouncementType) {
  if (!template.includes("{announcement}")) return "The format must include {announcement}.";
  if (type === "event" && !template.includes("{title}")) return "The event format must include {title}.";
  if (template.length > 500) return "Keep the format under 500 characters.";
  const allowedTokens = type === "event" ? [...COMMON_TEMPLATE_TOKENS, "{title}"] : COMMON_TEMPLATE_TOKENS;
  const unknown = template.match(/\{[^{}]+\}/g)?.filter((token) => !allowedTokens.includes(token));
  return unknown?.length ? `Unknown element: ${unknown[0]}` : null;
}

export function formatAnnouncement(template: string, announcement: string, scheduledDate: string, roleId: string, title?: string | null) {
  return template
    .replaceAll("{date}", displayScheduledDate(scheduledDate))
    .replaceAll("{announcement}", announcement)
    .replaceAll("{title}", title || "")
    .replaceAll("{mention-role}", `<@&${roleId}>`)
    .slice(0, 2000);
}

type Mode = "scheduled" | "manual_selected";

export async function sendAnnouncement(announcementId: string, mode: Mode, localDate?: string) {
  const sql = await dbReady();
  const claimed = await sql.begin(async (tx) => {
    const announcements = await tx`
      select id, question, scheduled_date, question_type, event_title from questions
      where id = ${announcementId} and status = 'approved' and scheduled_date is not null
      limit 1
    `;
    const announcement = announcements[0];
    if (!announcement) return { error: "There are no approved announcements ready to send." } as const;
    const settings = (await tx`
      select webhook_url_encrypted, mention_role_id, message_template, event_message_template
      from settings where singleton = true
    `)[0];
    if (!settings?.webhook_url_encrypted) return { error: "Set a Discord webhook before sending." } as const;
    const roleId = settings.mention_role_id as string | null;
    if (!roleId) return { error: "Set a Discord role ID before sending." } as const;
    const scheduledDate = scheduledDateValue(announcement.scheduled_date);
    if (!scheduledDate) return { error: "This announcement has an invalid posting date. Unapprove it and choose the date again." } as const;
    const type = announcement.question_type === "event" ? "event" : "announcement";
    const template = type === "event"
      ? (settings.event_message_template as string) || DEFAULT_EVENT_TEMPLATE
      : (settings.message_template as string) || DEFAULT_ANNOUNCEMENT_TEMPLATE;
    const message = formatAnnouncement(template, announcement.question, scheduledDate, roleId, announcement.event_title as string | null);
    const claim = await tx`
      update questions set status = 'sent', updated_at = now()
      where id = ${announcement.id} and status = 'approved'
      returning id
    `;
    if (!claim[0]) return { error: "That announcement is already being handled." } as const;
    const rows = await tx`
      insert into dispatches (question_id, local_date, mode, message, success)
      values (${announcement.id}, ${localDate || null}, ${mode}, ${message}, false)
      returning id
    `;
    return { dispatchId: rows[0].id as string, announcement, message, roleId, encryptedUrl: settings.webhook_url_encrypted as string } as const;
  });

  if ("error" in claimed) return claimed;
  let responseStatus: number | null = null;
  let errorMessage: string | null = null;
  try {
    const response = await fetch(decryptSecret(claimed.encryptedUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: claimed.message, allowed_mentions: { parse: [], roles: [claimed.roleId] } }),
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
    responseStatus = response.status;
    if (!response.ok) errorMessage = `Discord returned HTTP ${response.status}.`;
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "The Discord request failed.";
  }

  const success = !errorMessage;
  await sql.begin(async (tx) => {
    await tx`update dispatches set success = ${success}, response_status = ${responseStatus}, error = ${errorMessage} where id = ${claimed.dispatchId}`;
    if (success) {
      await tx`update questions set sent_at = now(), updated_at = now() where id = ${claimed.announcement.id} and status = 'sent'`;
    } else {
      await tx`update questions set status = 'approved', updated_at = now() where id = ${claimed.announcement.id} and status = 'sent' and sent_at is null`;
    }
  });
  return success ? { success: true, message: claimed.message } : { error: errorMessage || "Send failed." };
}

export async function sendPendingNotification(announcement: string, scheduledDate: string, type: AnnouncementType, title?: string | null) {
  const sql = await dbReady();
  const settings = (await sql`
    select notification_webhook_url_encrypted, notification_user_id
    from settings where singleton = true
  `)[0];
  if (!settings?.notification_webhook_url_encrypted || !settings.notification_user_id) return;
  const userId = settings.notification_user_id as string;
  const excerpt = announcement.length > 180 ? `${announcement.slice(0, 177)}...` : announcement;
  const projectHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  let reviewUrl = "https://announcement-bot.vercel.app";
  if (projectHost) {
    try {
      const productionUrl = new URL(projectHost.startsWith("http") ? projectHost : `https://${projectHost}`);
      if (productionUrl.protocol === "https:") reviewUrl = productionUrl.origin;
    } catch {
      // Use the known production URL when Vercel's value is unavailable or malformed.
    }
  }
  const subject = type === "event" ? `event “${title}” with a publish date of` : "announcement for";
  const content = `<@${userId}> New ${subject} ${displayScheduledDate(scheduledDate)} is awaiting review:\n${excerpt}\n[Review it here](${reviewUrl})`;
  try {
    await fetch(decryptSecret(settings.notification_webhook_url_encrypted as string), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content, allowed_mentions: { parse: [], users: [userId] } }),
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // Notification delivery must never discard a successfully saved submission.
  }
}
