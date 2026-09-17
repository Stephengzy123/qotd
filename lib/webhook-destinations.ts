import { dbReady } from "@/lib/db";
import { decryptSecret, validateDiscordWebhook } from "@/lib/security";

export type WebhookOption = { id: string; name: string };
type Target = WebhookOption & { webhook_url_encrypted: string };

// Only call on the server. Never pass Target records to a Client Component.
export async function availableWebhooks(accountId?: string): Promise<Target[]> {
  const sql = await dbReady();
  const saved = accountId
    ? await sql<Target[]>`select w.id, w.name, w.webhook_url_encrypted from saved_webhooks w
        join webhook_assignments a on a.webhook_id = w.id
        join accounts u on u.id = a.account_id
        where a.account_id = ${accountId} and u.role = 'club_leader' order by w.name, w.id`
    : await sql<Target[]>`select id, name, webhook_url_encrypted from saved_webhooks where primary_enabled = true order by name, id`;
  const legacy = accountId
    ? (await sql`select c.webhook_url_encrypted from club_channels c join accounts a on a.id = c.account_id where c.account_id = ${accountId} and a.role = 'club_leader'`)[0]
    : (await sql`select webhook_url_encrypted from settings where singleton = true`)[0];
  return legacy?.webhook_url_encrypted
    ? [{ id: accountId ? "club-default" : "primary", name: accountId ? "Original club channel" : "Primary announcements", webhook_url_encrypted: legacy.webhook_url_encrypted }, ...saved]
    : saved;
}

export async function webhookOptions(accountId?: string): Promise<WebhookOption[]> {
  return (await availableWebhooks(accountId)).map(({ id, name }) => ({ id, name }));
}

export function selectedWebhookIds(form: FormData): string[] | undefined {
  return form.has("webhookSelection") ? form.getAll("webhookIds").map(String) : undefined;
}

export async function resolveWebhooks(ids: string[], accountId?: string) {
  const unique = [...new Set(ids)];
  if (!unique.length || unique.length > 10) throw new Error("Choose between 1 and 10 Discord destinations.");
  const available = await availableWebhooks(accountId);
  const selected = unique.map(id => available.find(target => target.id === id));
  if (selected.some(target => !target)) throw new Error("A selected destination is no longer assigned. Reload and choose again.");
  // Deduplicate the actual Discord webhook ID, even if the URL was saved twice.
  const seen = new Set<string>();
  return selected.flatMap(target => {
    let url: URL;
    try {
      const value = decryptSecret(target!.webhook_url_encrypted);
      if (!validateDiscordWebhook(value)) throw new Error();
      url = new URL(value);
    } catch { throw new Error("A selected webhook could not be read. Ask an admin to update it."); }
    const key = url.pathname.match(/\/webhooks\/(\d+)\//)?.[1] || url.pathname;
    if (seen.has(key)) return [];
    seen.add(key);
    url.searchParams.set("wait", "true");
    return [{ id: target!.id, name: target!.name, url }];
  });
}

export async function deliverWebhooks(targets: Awaited<ReturnType<typeof resolveWebhooks>>, payload: object) {
  return Promise.all(targets.map(async target => {
    let status: number | null = null;
    let error: string | null = null;
    try {
      const response = await fetch(target.url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), redirect: "error", signal: AbortSignal.timeout(10000) });
      status = response.status;
      if (!response.ok) error = `Discord returned HTTP ${status}.`;
    } catch { error = "Delivery could not be confirmed. Check Discord before retrying."; }
    // Never return or log the secret URL.
    return { id: target.id, name: target.name, success: !error, status, error };
  }));
}
