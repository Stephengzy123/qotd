import { dbReady } from "@/lib/db";
import { decryptSecret } from "@/lib/security";

export const DEFAULT_TEMPLATE = "**Question of the Day — {date}**\n\n{question}";
export const ALLOWED_TOKENS = ["{date}", "{question}", "{number}", "{mention-role}"];
export type QuestionType = "open" | "reaction";
export type Transport = "bot" | "webhook";

export function parseReactions(value: string) {
  return [...new Set(value.trim().split(/\s+/).filter(Boolean))].slice(0, 10);
}

export function validateQuestionType(type: string, reactions: string[]) {
  if (type !== "open" && type !== "reaction") return "Choose a valid question type.";
  if (type === "reaction" && reactions.length < 2) return "Reaction-based questions need at least two reactions.";
  const customEmoji = /^<a?:[A-Za-z0-9_]{2,32}:\d{15,22}>$/;
  const unicodeEmojiCharacters = /^[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}\u200d\ufe0f\u20e3#*0-9]+$/u;
  const containsEmoji = /[\p{Extended_Pictographic}\p{Regional_Indicator}\u20e3]/u;
  if (reactions.some((reaction) => reaction.length > 100 || (!customEmoji.test(reaction) && (!unicodeEmojiCharacters.test(reaction) || !containsEmoji.test(reaction))))) {
    return "Use Unicode emoji or Discord custom emoji such as <:name:id>.";
  }
  return null;
}

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

function reactionPathValue(reaction: string) {
  const custom = reaction.match(/^<a?:([A-Za-z0-9_]{2,32}):(\d{15,22})>$/);
  return custom ? `${custom[1]}:${custom[2]}` : reaction;
}

async function addBotReactions(token: string, channelId: string, messageId: string, reactions: string[]) {
  const failures: string[] = [];
  for (const reaction of reactions) {
    try {
      const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(reactionPathValue(reaction))}/@me`, {
        method: "PUT",
        headers: { authorization: `Bot ${token}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) failures.push(`${reaction} (${response.status})`);
    } catch {
      failures.push(reaction);
    }
  }
  return failures.length ? `Message sent, but these reactions failed: ${failures.join(", ")}` : null;
}

export async function sendQuestion(
  questionId: string | null,
  mode: Mode,
  localDate?: string,
  transport: Transport = "bot",
): Promise<{ success: true; message: string; warning: string | null } | { error: string }> {
  const sql = await dbReady();
  const claimed = await sql.begin(async (tx) => {
    const settings = (await tx`
      select webhook_url_encrypted, bot_token_encrypted, bot_channel_id,
        open_message_template, reaction_message_template, mention_role_id,
        next_number, automatic_question_type
      from settings where singleton = true
      for update
    `)[0];
    if (!settings) return { error: "Delivery settings are missing." } as const;
    if (transport === "bot" && (!settings.bot_token_encrypted || !settings.bot_channel_id)) return { error: "Set a bot token and channel ID before sending with the bot." } as const;
    if (transport === "webhook" && !settings.webhook_url_encrypted) return { error: "Set a Discord webhook before sending with the webhook." } as const;
    const automaticType = String(settings.automatic_question_type || "both");
    const questions = questionId
      ? await tx`select id, question, question_type, reactions from questions where id = ${questionId} and status = 'approved' limit 1`
      : mode === "scheduled" && automaticType !== "both"
        ? await tx`select id, question, question_type, reactions from questions where status = 'approved' and question_type = ${automaticType} order by random() limit 1`
        : await tx`select id, question, question_type, reactions from questions where status = 'approved' order by random() limit 1`;
    const question = questions[0];
    if (!question) return { error: "There are no matching approved questions ready to send." } as const;
    const count = Number(settings.next_number) || 1;
    const roleId = settings.mention_role_id as string | null;
    const template = question.question_type === "reaction" ? settings.reaction_message_template : settings.open_message_template;
    const message = formatMessage(template || DEFAULT_TEMPLATE, question.question, count, roleId);
    const rows = await tx`
      insert into dispatches (question_id, local_date, mode, transport, message, success)
      values (${question.id}, ${localDate || null}, ${mode}, ${transport}, ${message}, false)
      on conflict do nothing
      returning id
    `;
    if (!rows[0]) return { error: "Today’s scheduled question was already handled." } as const;
    await tx`update settings set next_number = ${count + 1} where singleton = true`;
    return {
      dispatchId: rows[0].id as string,
      question,
      message,
      number: count,
      roleId,
      encryptedWebhook: settings.webhook_url_encrypted as string | null,
      encryptedBotToken: settings.bot_token_encrypted as string | null,
      channelId: settings.bot_channel_id as string | null,
    } as const;
  });

  if ("error" in claimed) return { error: claimed.error || "Delivery could not be started." };
  let responseStatus: number | null = null;
  let errorMessage: string | null = null;
  let warningMessage: string | null = null;
  try {
    const allowedMentions = { parse: [], roles: claimed.roleId ? [claimed.roleId] : [] };
    let messageId: string | null = null;
    let reactionChannelId = claimed.channelId;
    if (transport === "bot") {
      const botToken = decryptSecret(claimed.encryptedBotToken!);
      const response = await fetch(`https://discord.com/api/v10/channels/${claimed.channelId}/messages`, {
        method: "POST",
        headers: { authorization: `Bot ${botToken}`, "content-type": "application/json" },
        body: JSON.stringify({ content: claimed.message, allowed_mentions: allowedMentions }),
        signal: AbortSignal.timeout(10_000),
      });
      responseStatus = response.status;
      if (!response.ok) errorMessage = `Discord bot API returned HTTP ${response.status}.`;
      else messageId = String((await response.json()).id || "");
    } else {
      const webhookUrl = new URL(decryptSecret(claimed.encryptedWebhook!));
      webhookUrl.searchParams.set("wait", "true");
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: claimed.message, allowed_mentions: allowedMentions }),
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
      });
      responseStatus = response.status;
      if (!response.ok) errorMessage = `Discord webhook returned HTTP ${response.status}.`;
      else {
        const sent = await response.json();
        messageId = String(sent.id || "");
        reactionChannelId = String(sent.channel_id || reactionChannelId || "");
      }
    }
    const reactions = Array.isArray(claimed.question.reactions) ? claimed.question.reactions.map(String) : [];
    if (!errorMessage && claimed.question.question_type === "reaction" && reactions.length) {
      if (claimed.encryptedBotToken && reactionChannelId && messageId) {
        warningMessage = await addBotReactions(decryptSecret(claimed.encryptedBotToken), reactionChannelId, messageId, reactions);
      } else {
        warningMessage = "Message sent, but reactions require a configured bot token and channel.";
      }
    }
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "The Discord request failed.";
  }

  const success = !errorMessage;
  await sql.begin(async (tx) => {
    await tx`update dispatches set success = ${success}, response_status = ${responseStatus}, error = ${errorMessage || warningMessage} where id = ${claimed.dispatchId}`;
    if (success) {
      await tx`update questions set status = 'sent', sent_at = now(), updated_at = now() where id = ${claimed.question.id}`;
    } else {
      await tx`update settings set next_number = ${claimed.number} where singleton = true and next_number = ${claimed.number + 1}`;
    }
  });
  return success ? { success: true, message: claimed.message, warning: warningMessage } : { error: errorMessage || "Send failed." };
}
