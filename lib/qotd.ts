import { dbReady } from "@/lib/db";
import { decryptSecret } from "@/lib/security";

export const DEFAULT_TEMPLATE = "**Question of the Day — {date}**\n\n{question}";
export const ALLOWED_TOKENS = ["{date}", "{question}", "{number}", "{mention-role}"];

export function pacificParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value || "";
  return { localDate: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

export function formatMessage(template: string, question: string, number?: number, roleId?: string | null, date = new Date()) {
  const displayDate = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
  return template
    .replaceAll("{date}", displayDate)
    .replaceAll("{question}", question)
    .replaceAll("{number}", number ? String(number) : "—")
    .replaceAll("{mention-role}", roleId ? `<@&${roleId}>` : "")
    .slice(0, 2000);
}

export function validateTemplate(template: string, roleId?: string) {
  if (!template.includes("{question}")) return "The template must include {question}.";
  if (template.length > 1800) return "Keep the template under 1,800 characters.";
  if (roleId && !/^\d{15,22}$/.test(roleId)) return "The Discord role ID must contain 15–22 digits.";
  if (template.includes("{mention-role}") && !roleId) return "Set a role ID before using {mention-role}.";
  const unknown = template.match(/\{[^{}]+\}/g)?.filter((token) => !ALLOWED_TOKENS.includes(token));
  return unknown?.length ? `Unknown element: ${unknown[0]}` : null;
}

type Mode = "scheduled" | "manual_random" | "manual_selected";

export async function sendQuestion(questionId: string | null, mode: Mode, localDate?: string) {
  const sql = await dbReady();
  const claimed = await sql.begin(async (tx) => {
    const questions = questionId
      ? await tx`select id, question from questions where id = ${questionId} and status = 'approved' limit 1`
      : await tx`select id, question from questions where status = 'approved' order by random() limit 1`;
    const question = questions[0];
    if (!question) return { error: "There are no approved questions ready to send." } as const;
    const settings = (await tx`
      select webhook_url_encrypted, message_template, mention_role_id, next_number
      from settings where singleton = true
      for update
    `)[0];
    if (!settings?.webhook_url_encrypted) return { error: "Set a Discord webhook before sending." } as const;
    const count = Number(settings.next_number) || 1;
    const roleId = settings.mention_role_id as string | null;
    const message = formatMessage(settings.message_template || DEFAULT_TEMPLATE, question.question, count, roleId);
    const rows = await tx`
      insert into dispatches (question_id, local_date, mode, message, success)
      values (${question.id}, ${localDate || null}, ${mode}, ${message}, false)
      on conflict do nothing
      returning id
    `;
    if (!rows[0]) return { error: "Today’s scheduled question was already handled." } as const;
    await tx`update settings set next_number = ${count + 1} where singleton = true`;
    return { dispatchId: rows[0].id as string, question, message, number: count, roleId, encryptedUrl: settings.webhook_url_encrypted as string } as const;
  });

  if ("error" in claimed) return claimed;
  let responseStatus: number | null = null;
  let errorMessage: string | null = null;
  try {
    const response = await fetch(decryptSecret(claimed.encryptedUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: claimed.message, allowed_mentions: { parse: [], roles: claimed.roleId ? [claimed.roleId] : [] } }),
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
      await tx`update questions set status = 'sent', sent_at = now(), updated_at = now() where id = ${claimed.question.id}`;
    } else {
      await tx`update settings set next_number = ${claimed.number} where singleton = true and next_number = ${claimed.number + 1}`;
    }
  });
  return success ? { success: true, message: claimed.message } : { error: errorMessage || "Send failed." };
}
