"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { clearSession, createSession, requireRole, verifyCredentials } from "@/lib/auth";
import { dbReady } from "@/lib/db";
import { encryptSecret, hashAddress, validateDiscordWebhook } from "@/lib/security";
import { sendQuestion, validateTemplate } from "@/lib/qotd";

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
  if (question.length < 8 || question.length > 500) {
    redirect(messageUrl("/contribute", "error", "Questions must be between 8 and 500 characters."));
  }
  if (note.length > 500) redirect(messageUrl("/contribute", "error", "Notes must be 500 characters or fewer."));
  const ipHash = await clientHash();
  const sql = await dbReady();
  const recent = Number((await sql`
    select count(*)::int as count from questions
    where submitter_ip_hash = ${ipHash} and created_at > now() - interval '1 hour'
  `)[0].count);
  if (recent >= 8) redirect(messageUrl("/contribute", "error", "You’ve submitted several questions recently. Please try again in a little while."));
  await sql`insert into questions (question, contributor_note, submitter_ip_hash) values (${question}, ${note || null}, ${ipHash})`;
  revalidatePath("/admin");
  redirect(messageUrl("/contribute", "ok", "Thanks — your question is ready for review."));
}

export async function reviewQuestionAction(formData: FormData) {
  await requireRole("admin");
  const id = String(formData.get("id") || "");
  const question = String(formData.get("question") || "").trim();
  const intent = String(formData.get("intent") || "save");
  if (!id || question.length < 8 || question.length > 500) redirect(messageUrl("/admin", "error", "Check the question length and try again."));
  const status = intent === "approve" ? "approved" : intent === "reject" ? "rejected" : "pending";
  const sql = await dbReady();
  await sql`update questions set question = ${question}, status = ${status}, updated_at = now() where id = ${id} and status <> 'sent'`;
  revalidatePath("/admin");
  redirect(messageUrl("/admin", "ok", status === "approved" ? "Question approved." : status === "rejected" ? "Question rejected." : "Changes saved."));
}

export async function addApprovedQuestionAction(formData: FormData) {
  const session = await requireRole("admin");
  const question = String(formData.get("question") || "").trim();
  if (question.length < 8 || question.length > 500) {
    redirect(messageUrl("/admin", "error", "Questions must be between 8 and 500 characters."));
  }
  const sql = await dbReady();
  await sql`
    insert into questions (question, status, submitter_ip_hash)
    values (${question}, 'approved', ${hashAddress(`admin:${session.username}`)})
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
  const template = String(formData.get("template") || "").trim();
  const webhook = String(formData.get("webhook") || "").trim();
  const roleId = String(formData.get("roleId") || "").trim();
  const templateError = validateTemplate(template, roleId);
  if (templateError) redirect(messageUrl("/admin", "error", templateError));
  if (webhook && !validateDiscordWebhook(webhook)) redirect(messageUrl("/admin", "error", "Enter a valid Discord webhook URL."));
  const sql = await dbReady();
  if (webhook) {
    await sql`update settings set message_template = ${template}, mention_role_id = ${roleId || null}, webhook_url_encrypted = ${encryptSecret(webhook)}, updated_at = now() where singleton = true`;
  } else {
    await sql`update settings set message_template = ${template}, mention_role_id = ${roleId || null}, updated_at = now() where singleton = true`;
  }
  revalidatePath("/admin");
  redirect(messageUrl("/admin", "ok", "Delivery settings saved."));
}

export async function sendQuestionAction(formData: FormData) {
  await requireRole("admin");
  const id = String(formData.get("id") || "") || null;
  const mode = id ? "manual_selected" : "manual_random";
  const result = await sendQuestion(id, mode);
  revalidatePath("/admin");
  redirect(messageUrl("/admin", "error" in result ? "error" : "ok", "error" in result ? (result.error || "Send failed.") : "Question sent to Discord."));
}
