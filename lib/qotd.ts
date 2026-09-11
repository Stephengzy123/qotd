import { dbReady } from "@/lib/db";
import { decryptSecret } from "@/lib/security";

export const FIXED_ANNOUNCEMENT_FORMAT = "# Announcements for {date}\n\n{announcement}\n\n-# {mention-role}";

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

export function displayScheduledDate(value: string | Date) {
  const localDate = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(`${localDate}T12:00:00Z`));
}

export function formatAnnouncement(announcement: string, scheduledDate: string, roleId: string) {
  return FIXED_ANNOUNCEMENT_FORMAT
    .replace("{date}", displayScheduledDate(scheduledDate))
    .replace("{announcement}", announcement)
    .replace("{mention-role}", `<@&${roleId}>`)
    .slice(0, 2000);
}

type Mode = "scheduled" | "manual_random" | "manual_selected";

export async function sendAnnouncement(announcementId: string | null, mode: Mode, localDate?: string) {
  const sql = await dbReady();
  const claimed = await sql.begin(async (tx) => {
    const announcements = announcementId
      ? await tx`select id, question, scheduled_date from questions where id = ${announcementId} and status = 'approved' and scheduled_date is not null limit 1`
      : await tx`select id, question, scheduled_date from questions where status = 'approved' and scheduled_date is not null order by random() limit 1`;
    const announcement = announcements[0];
    if (!announcement) return { error: "There are no approved announcements ready to send." } as const;
    const settings = (await tx`
      select webhook_url_encrypted, mention_role_id
      from settings where singleton = true
    `)[0];
    if (!settings?.webhook_url_encrypted) return { error: "Set a Discord webhook before sending." } as const;
    const roleId = settings.mention_role_id as string | null;
    if (!roleId) return { error: "Set a Discord role ID before sending." } as const;
    const scheduledDate = String(announcement.scheduled_date).slice(0, 10);
    const message = formatAnnouncement(announcement.question, scheduledDate, roleId);
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

export async function sendPendingNotification(announcement: string, scheduledDate: string) {
  const sql = await dbReady();
  const settings = (await sql`
    select notification_webhook_url_encrypted, notification_user_id
    from settings where singleton = true
  `)[0];
  if (!settings?.notification_webhook_url_encrypted || !settings.notification_user_id) return;
  const userId = settings.notification_user_id as string;
  const excerpt = announcement.length > 180 ? `${announcement.slice(0, 177)}...` : announcement;
  const content = `<@${userId}> New announcement awaiting review for ${displayScheduledDate(scheduledDate)}:\n${excerpt}`;
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
