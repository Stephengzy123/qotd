"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { dbReady } from "@/lib/db";
import { encryptSecret, validateDiscordWebhook } from "@/lib/security";
import { logEvent } from "@/lib/log";

export async function saveWebhookAction(form: FormData) {
  const session = await requireRole("admin");
  const id = String(form.get("id") || "");
  const name = String(form.get("name") || "").trim();
  const url = String(form.get("url") || "").trim();
  const primary = form.get("primary") === "on";
  const accounts = [...new Set(form.getAll("accounts").map(String))];
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const fail = (message: string): never => redirect(`/admin/webhooks?error=${encodeURIComponent(message)}`);
  if ((id && !uuid.test(id)) || !name || name.length > 80 || /[\x00-\x1f]/.test(name)) fail("Enter a name of 1–80 characters.");
  if ((!id && !url) || (url && !validateDiscordWebhook(url))) fail("Enter a valid Discord webhook URL.");
  if (accounts.length > 100 || accounts.some(value => !uuid.test(value))) fail("Invalid account selection.");
  const sql = await dbReady();
  const result = await sql.begin(async tx => {
    const leaders = accounts.length ? await tx`select a.id from accounts a join club_members m on m.account_id = a.id where a.id = any(${accounts}::uuid[]) and a.role = 'club_leader' and m.club_role = 'leader' for share` : [];
    if (leaders.length !== accounts.length) return null;
    const rows = id
      ? await tx`update saved_webhooks set name = ${name}, primary_enabled = ${primary}, webhook_url_encrypted = coalesce(${url ? encryptSecret(url) : null}, webhook_url_encrypted) where id = ${id} returning id`
      : await tx`insert into saved_webhooks (name, webhook_url_encrypted, primary_enabled) values (${name}, ${encryptSecret(url)}, ${primary}) returning id`;
    if (!rows[0]) return null;
    const savedId = rows[0].id as string;
    await tx`delete from webhook_assignments where webhook_id = ${savedId}`;
    for (const account of accounts) await tx`insert into webhook_assignments (webhook_id, account_id) values (${savedId}, ${account})`;
    return savedId;
  });
  if (!result) fail("An account or webhook changed. Reload and try again.");
  await logEvent({ action: "save_webhook_assignments", actor: session.username, role: session.role, details: { webhookId: result, name, primary, accountIds: accounts, urlChanged: Boolean(url) } });
  revalidatePath("/admin"); revalidatePath("/admin/webhooks"); revalidatePath("/club"); revalidatePath("/live");
  redirect("/admin/webhooks?ok=Webhook%20saved.");
}
