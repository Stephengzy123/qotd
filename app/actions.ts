"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { clearSession, createSession, requireRole, verifyCredentials } from "@/lib/auth";
import { dbReady } from "@/lib/db";
import { encryptSecret, hashAddress, validateDiscordWebhook } from "@/lib/security";
import { parseReactions, sendQuestion, validateQuestionType, validateTemplate } from "@/lib/qotd";

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
  const question = String(formData.get("question") || "").trim();
  const note = String(formData.get("note") || "").trim();
  const questionType = String(formData.get("questionType") || "open");
  const reactions = parseReactions(String(formData.get("reactions") || ""));
  if (question.length < 8 || question.length > 500) {
    redirect(messageUrl("/contribute", "error", "Questions must be between 8 and 500 characters."));
  }
  if (note.length > 500) redirect(messageUrl("/contribute", "error", "Notes must be 500 characters or fewer."));
  const typeError = validateQuestionType(questionType, reactions);
  if (typeError) redirect(messageUrl("/contribute", "error", typeError));
  const ipHash = await clientHash();
  const sql = await dbReady();
  const recent = Number((await sql`
    select count(*)::int as count from questions
    where submitter_ip_hash = ${ipHash} and created_at > now() - interval '1 hour'
  `)[0].count);
  if (recent >= 8) redirect(messageUrl("/contribute", "error", "You’ve submitted several questions recently. Please try again in a little while."));
  await sql`insert into questions (question, question_type, reactions, contributor_note, submitter_ip_hash) values (${question}, ${questionType}, ${reactions}, ${note || null}, ${ipHash})`;
  revalidatePath("/admin");
  redirect(messageUrl("/contribute", "ok", "Thanks — your question is ready for review."));
}

export async function reviewQuestionAction(formData: FormData) {
  await requireRole("admin");
  const id = String(formData.get("id") || "");
  const question = String(formData.get("question") || "").trim();
  const questionType = String(formData.get("questionType") || "open");
  const reactions = parseReactions(String(formData.get("reactions") || ""));
  const intent = String(formData.get("intent") || "save");
  if (!id || question.length < 8 || question.length > 500) redirect(messageUrl("/admin", "error", "Check the question length and try again."));
  const typeError = validateQuestionType(questionType, reactions);
  if (typeError) redirect(messageUrl("/admin", "error", typeError));
  const status = intent === "approve" ? "approved" : intent === "reject" ? "rejected" : "pending";
  const sql = await dbReady();
  await sql`update questions set question = ${question}, question_type = ${questionType}, reactions = ${questionType === "reaction" ? reactions : []}, status = ${status}, updated_at = now() where id = ${id} and status <> 'sent'`;
  revalidatePath("/admin");
  redirect(messageUrl("/admin", "ok", status === "approved" ? "Question approved." : status === "rejected" ? "Question rejected." : "Changes saved."));
}

export async function addApprovedQuestionAction(formData: FormData) {
  const session = await requireRole("admin");
  const question = String(formData.get("question") || "").trim();
  const questionType = String(formData.get("questionType") || "open");
  const reactions = parseReactions(String(formData.get("reactions") || ""));
  if (question.length < 8 || question.length > 500) {
    redirect(messageUrl("/admin", "error", "Questions must be between 8 and 500 characters."));
  }
  const typeError = validateQuestionType(questionType, reactions);
  if (typeError) redirect(messageUrl("/admin", "error", typeError));
  const sql = await dbReady();
  await sql`
    insert into questions (question, question_type, reactions, status, submitter_ip_hash)
    values (${question}, ${questionType}, ${questionType === "reaction" ? reactions : []}, 'approved', ${hashAddress(`admin:${session.username}`)})
  `;
  revalidatePath("/admin");
  redirect(messageUrl("/admin", "ok", "Question added to Approved."));
}

export async function unapproveQuestionAction(formData: FormData) {
  await requireRole("admin");
  const id = String(formData.get("id") || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect(messageUrl("/admin", "error", "Invalid question."));
  const sql = await dbReady();
  await sql`update questions set status = 'pending', updated_at = now() where id = ${id} and status = 'approved'`;
  revalidatePath("/admin");
  redirect(messageUrl("/admin", "ok", "Question moved back to Pending."));
}

export async function deleteApprovedQuestionAction(formData: FormData) {
  await requireRole("admin");
  const id = String(formData.get("id") || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect(messageUrl("/admin", "error", "Invalid question."));
  const sql = await dbReady();
  await sql`delete from questions where id = ${id} and status = 'approved'`;
  revalidatePath("/admin");
  redirect(messageUrl("/admin", "ok", "Question deleted."));
}

export async function saveSettingsAction(formData: FormData) {
  await requireRole("admin");
  const openTemplate = String(formData.get("openTemplate") || "").trim();
  const reactionTemplate = String(formData.get("reactionTemplate") || "").trim();
  const webhook = String(formData.get("webhook") || "").trim();
  const botToken = String(formData.get("botToken") || "").trim();
  const botApplicationId = String(formData.get("botApplicationId") || "").trim();
  const botChannelId = String(formData.get("botChannelId") || "").trim();
  const automaticQuestionType = String(formData.get("automaticQuestionType") || "both");
  const roleId = String(formData.get("roleId") || "").trim();
  const nextNumber = Number(String(formData.get("nextNumber") || ""));
  const templateError = validateTemplate(openTemplate, roleId) || validateTemplate(reactionTemplate, roleId);
  if (templateError) redirect(messageUrl("/admin", "error", templateError));
  if (!Number.isSafeInteger(nextNumber) || nextNumber < 1 || nextNumber > 2_147_483_646) {
    redirect(messageUrl("/admin", "error", "Next number must be a whole number from 1 to 2,147,483,646."));
  }
  if (webhook && !validateDiscordWebhook(webhook)) redirect(messageUrl("/admin", "error", "Enter a valid Discord webhook URL."));
  if (botToken && (botToken.length < 30 || botToken.length > 200 || /\s/.test(botToken))) redirect(messageUrl("/admin", "error", "Enter a valid Discord bot token."));
  if (botApplicationId && !/^\d{15,22}$/.test(botApplicationId)) redirect(messageUrl("/admin", "error", "Enter a valid Discord application ID."));
  if (botChannelId && !/^\d{15,22}$/.test(botChannelId)) redirect(messageUrl("/admin", "error", "Enter a valid Discord channel ID."));
  if (!["both", "open", "reaction"].includes(automaticQuestionType)) redirect(messageUrl("/admin", "error", "Choose a valid automatic question type."));
  const sql = await dbReady();
  const encryptedWebhook = webhook ? encryptSecret(webhook) : null;
  const encryptedBotToken = botToken ? encryptSecret(botToken) : null;
  await sql`update settings set
    open_message_template = ${openTemplate},
    reaction_message_template = ${reactionTemplate},
    mention_role_id = ${roleId || null},
    next_number = ${nextNumber},
    bot_application_id = ${botApplicationId || null},
    bot_channel_id = ${botChannelId || null},
    automatic_question_type = ${automaticQuestionType},
    webhook_url_encrypted = coalesce(${encryptedWebhook}, webhook_url_encrypted),
    bot_token_encrypted = coalesce(${encryptedBotToken}, bot_token_encrypted),
    updated_at = now()
    where singleton = true`;
  revalidatePath("/admin");
  redirect(messageUrl("/admin", "ok", "Delivery settings saved."));
}

export async function sendQuestionAction(formData: FormData) {
  await requireRole("admin");
  const id = String(formData.get("id") || "") || null;
  const transport = String(formData.get("transport") || "bot");
  if (transport !== "bot" && transport !== "webhook") redirect(messageUrl("/admin", "error", "Choose a valid delivery method."));
  const mode = id ? "manual_selected" : "manual_random";
  const result = await sendQuestion(id, mode, undefined, transport);
  revalidatePath("/admin");
  redirect(messageUrl("/admin", "error" in result ? "error" : "ok", "error" in result ? (result.error || "Send failed.") : (result.warning || `Question sent with ${transport}.`)));
}
