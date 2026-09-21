import { resolveWebhooks, deliverWebhooks } from "@/lib/webhook-destinations";
import { errorDetail, logEvent } from "@/lib/log";
import { removePings } from "@/lib/live-text";
import { dbReady } from "@/lib/db";
import { decryptSecret } from "@/lib/security";
import { calendarHeading, getCalendarByDate } from "@/lib/calendar";

export const DEFAULT_ANNOUNCEMENT_TEMPLATE = "# <:sgs:1372767087612657724> Announcements for {date}\n{calendar}\n\n{announcement}\n\n-# {mention-role}";
export const DEFAULT_EVENT_TEMPLATE = "# <:sgs:1372767087612657724> Announcement for {title}\n\n{announcement}\n\n-# {mention-role}";
const COMMON_TEMPLATE_TOKENS = ["{date}", "{announcement}", "{mention-role}"];
export type AnnouncementType = "announcement" | "event" | "reminder";

export function parseAnnouncementType(value: FormDataEntryValue | null): AnnouncementType {
  return value === "event" || value === "reminder" ? value : "announcement";
}

export function normalizeDiscordTemplate(template: string) {
  return template.split("\n").map((line) => {
    const cleaned = line.replace(/[\uFEFF\u200B\u200C\u200D]/g, "");
    return /^\s*(?:#{1,3}|-#)\s+/.test(cleaned) ? cleaned : line;
  }).join("\n");
}

export function pacificParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
  return { localDate: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")), minute: Number(get("minute")) };
}

export type SendScheduleMode = "auto" | "disabled" | "exact";

// datetime-local inputs have no timezone. Treat them as a Pacific wall-clock
// value, including the daylight-saving offset that applies on that date.
export function parsePacificDateTime(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const baseline = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  const raw = new Date(baseline);
  if (raw.getUTCFullYear() !== Number(year) || raw.getUTCMonth() + 1 !== Number(month) || raw.getUTCDate() !== Number(day) || raw.getUTCHours() !== Number(hour) || raw.getUTCMinutes() !== Number(minute)) return null;
  const wanted = `${year}-${month}-${day}T${hour}:${minute}`;
  // Pacific is UTC-7 or UTC-8. Comparing formatted parts rejects impossible
  // spring-forward wall times and chooses the earlier occurrence in fall.
  const candidates = [7, 8].map((offset) => new Date(baseline + offset * 60 * 60 * 1000)).filter((candidate) => pacificDateTimeInput(candidate) === wanted);
  return candidates.sort((a, b) => a.getTime() - b.getTime())[0] || null;
}

export function pacificDateTimeInput(value: Date | string | null | undefined) {
  const date = value instanceof Date ? value : value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export function displayPacificDateTime(value: Date | string | null | undefined) {
  const date = value instanceof Date ? value : value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(date);
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

export function minimumAnnouncementDate(now = new Date(), daysEarly = 0) {
  const { localDate, hour } = pacificParts(now);
  return addDays(localDate, (hour >= 18 ? 2 : 1) + daysEarly);
}

export function isValidAnnouncementDate(value: string, now = new Date(), daysEarly = 0) {
  return Number.isInteger(daysEarly) && daysEarly >= 0 && daysEarly <= 365 &&
    isValidFuturePacificDate(value, now) && value >= minimumAnnouncementDate(now, daysEarly);
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
  if (type !== "announcement" && !template.includes("{title}")) return "The event and reminder format must include {title}.";
  if (template.length > 500) return "Keep the format under 500 characters.";
  const allowedTokens = type !== "announcement" ? [...COMMON_TEMPLATE_TOKENS, "{title}"] : [...COMMON_TEMPLATE_TOKENS, "{calendar}"];
  const unknown = template.match(/\{[^{}]+\}/g)?.filter((token) => !allowedTokens.includes(token));
  return unknown?.length ? `Unknown element: ${unknown[0]}` : null;
}

export function formatAnnouncement(template: string, announcement: string, scheduledDate: string, roleId: string, title?: string | null, calendar = "") {
  const calendarApplied = normalizeDiscordTemplate(template).split("\n").flatMap((line) => {
    if (line.trim() === "{calendar}") return calendar ? [line.replace("{calendar}", calendar)] : [];
    return [line.replaceAll("{calendar}", calendar)];
  }).join("\n");
  const formatted = calendarApplied
    .replaceAll("{date}", displayScheduledDate(scheduledDate))
    .replaceAll("{announcement}", announcement)
    .replaceAll("{title}", title || "")
    .replaceAll("{mention-role}", `<@&${roleId}>`);
  return normalizeDiscordTemplate(formatted).slice(0, 2000);
}

type Mode = "scheduled" | "manual_selected";

export async function sendAnnouncement(announcementId: string, mode: Mode, localDate?: string, actor?: string, options: { destination?: "discord" | "live"; removePings?: boolean; webhookIds?: string[] } = {}) {
  const logBase = { action: "dispatch_announcement", actor: actor ?? (mode === "scheduled" ? "scheduler" : null), role: mode === "scheduled" ? "system" : "admin" } as const;
  const sql = await dbReady();
  const announcements = await sql`
      select id, question, scheduled_date, question_type, event_title, discord_webhook_ids, delivery_destination, remove_pings, updated_at::text as settings_version from questions
      where id = ${announcementId} and status = 'approved' and scheduled_date is not null
      limit 1
    `;
  const announcement = announcements[0];
  if (!announcement) return { error: "There are no approved announcements ready to send." } as const;
  const destination = options.destination ?? announcement.delivery_destination ?? "discord";
  if (destination !== "discord" && destination !== "live") return { error: "Invalid destination." } as const;
  const stripPings = destination === "live" || (options.removePings ?? announcement.remove_pings) === true;
  const settings = (await sql`
      select webhook_url_encrypted, mention_role_id, message_template, event_message_template, calendar_feed_url_encrypted
      from settings where singleton = true
    `)[0];
  if (!settings) return { error: "Announcement settings are unavailable." } as const;
  let targets: Awaited<ReturnType<typeof resolveWebhooks>> = [];
  if (destination === "discord") {
    try { targets = await resolveWebhooks(options.webhookIds ?? (announcement.discord_webhook_ids as string[] | null) ?? ["primary"]); }
    catch (error) { return { error: errorDetail(error) } as const; }
  }
  const roleId = (settings.mention_role_id as string | null) || "0";
  if (destination === "discord" && !stripPings && !settings.mention_role_id) return { error: "Set a Discord role ID before sending." } as const;
  const scheduledDate = scheduledDateValue(announcement.scheduled_date);
  if (!scheduledDate) return { error: "This announcement has an invalid posting date. Unapprove it and choose the date again." } as const;
  const type: AnnouncementType = announcement.question_type === "event" ? "event" : announcement.question_type === "reminder" ? "reminder" : "announcement";
  const template = type !== "announcement"
    ? (settings.event_message_template as string) || DEFAULT_EVENT_TEMPLATE
    : (settings.message_template as string) || DEFAULT_ANNOUNCEMENT_TEMPLATE;
  let calendar = "";
  if (type === "announcement" && settings.calendar_feed_url_encrypted) {
    try {
      calendar = calendarHeading(await getCalendarByDate(settings.calendar_feed_url_encrypted as string, scheduledDate));
    } catch (error) {
      // A calendar outage must not prevent an approved announcement from being sent.
      await logEvent({ action: "calendar_lookup", actor: logBase.actor, role: logBase.role, success: false, details: { announcementId, scheduledDate, error: errorDetail(error) } });
    }
  }
  const formatted = formatAnnouncement(template, announcement.question, scheduledDate, roleId, announcement.event_title as string | null, calendar);
  const message = stripPings ? removePings(formatted) : formatted;
  if (!message.trim()) return { error: "The message is empty after removing pings." } as const;
  const claimed = await sql.begin(async (tx) => {
    const claim = await tx`
      update questions set status = 'sent', updated_at = now()
      where id = ${announcement.id} and status = 'approved' and updated_at = ${announcement.settings_version}::timestamptz
      returning id
    `;
    if (!claim[0]) return { error: "That announcement changed or is already being handled. Reload before retrying." } as const;
    const rows = await tx`
      insert into dispatches (question_id, local_date, mode, message, success, question_type, destination)
      values (${announcement.id}, ${localDate || null}, ${mode}, ${message}, ${destination === "live"}, ${type}, ${destination})
      returning id
    `;
    if (destination === "live") await tx`update questions set sent_at = now() where id = ${announcement.id}`;
    return { dispatchId: rows[0].id as string } as const;
  });

  if ("error" in claimed) {
    await logEvent({ ...logBase, success: false, details: { announcementId, mode, localDate, reason: claimed.error } });
    return claimed;
  }
  let responseStatus: number | null = null;
  let errorMessage: string | null = null;
  if (destination === "live") {
    await logEvent({ ...logBase, success: true, details: { announcementId, dispatchId: claimed.dispatchId, destination, removePings: true, mode } });
    return { success: true, message, dispatchId: claimed.dispatchId };
  }
  const results = await deliverWebhooks(targets, { content: message, allowed_mentions: { parse: [], roles: stripPings ? [] : [roleId], users: [], replied_user: false } });
  responseStatus = results.length === 1 ? results[0].status : null;
  const failed = results.filter(result => !result.success);
  errorMessage = failed.length ? failed.map(result => `${result.name}: ${result.error}`).join(" ") : null;
  // A partial send must not automatically resend to channels that succeeded.
  const success = results.some(result => result.success);
  const uncertain = results.some(result => result.status === null);
  await sql.begin(async (tx) => {
    await tx`update dispatches set success = ${success}, response_status = ${responseStatus}, error = ${errorMessage} where id = ${claimed.dispatchId}`;
    if (success) {
      await tx`update questions set sent_at = now(), updated_at = now() where id = ${announcement.id} and status = 'sent'`;
    } else if (!uncertain) {
      await tx`update questions set status = 'approved', updated_at = now() where id = ${announcement.id} and status = 'sent' and sent_at is null`;
    }
  });
  await logEvent({ ...logBase, success, details: { announcementId, dispatchId: claimed.dispatchId, destination, removePings: stripPings, mode, localDate, type, scheduledDate, destinations: results, responseStatus, error: errorMessage ?? undefined, messageLength: message.length } });
  return success ? { success: true, message, dispatchId: claimed.dispatchId, warning: errorMessage } : { error: errorMessage || "Send failed." };
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
  const subject = type === "event" ? `event “${title}” with a publish date of` : type === "reminder" ? `reminder “${title}” with a publish date of` : "announcement for";
  const content = `<@${userId}> New ${subject} ${displayScheduledDate(scheduledDate)} is awaiting review:\n${excerpt}\n[Review it here](${reviewUrl})`;
  try {
    await fetch(decryptSecret(settings.notification_webhook_url_encrypted as string), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content, allowed_mentions: { parse: [], users: [userId] } }),
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
    await logEvent({ action: "pending_notification", role: "system", details: { type, scheduledDate, title: title ?? undefined } });
  } catch (error) {
    // Notification delivery must never discard a successfully saved submission.
    await logEvent({ action: "pending_notification", role: "system", success: false, details: { type, scheduledDate, title: title ?? undefined, error: errorDetail(error) } });
  }
}
