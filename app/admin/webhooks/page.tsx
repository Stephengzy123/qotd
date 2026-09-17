import { requireRole } from "@/lib/auth";
import { dbReady } from "@/lib/db";
import { saveWebhookAction } from "./actions";
import { PendingButton } from "@/components/pending-button";
import { WebhookProfile } from "@/components/webhook-profile";
import { Notice } from "@/components/notice";
import { Suspense } from "react";

export default async function WebhooksPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireRole("admin");
  const params = await searchParams;
  const sql = await dbReady();
  const [webhooks, leaders, assignments] = await Promise.all([
    sql<{ id: string; name: string; webhook_url_encrypted: string; primary_enabled: boolean }[]>`select id, name, webhook_url_encrypted, primary_enabled from saved_webhooks order by name, id`,
    sql<{ id: string; username: string }[]>`select id, username from accounts where role = 'club_leader' order by username`,
    sql<{ webhook_id: string; account_id: string }[]>`select webhook_id, account_id from webhook_assignments`,
  ]);
  const forms = [{ id: "", name: "", webhook_url_encrypted: "", primary_enabled: false }, ...webhooks];
  return <main className="app-shell"><header className="topbar"><strong>Discord webhooks</strong><a href="/admin">← Admin</a></header>
    <h1>Saved Discord destinations</h1><p>Assign each webhook to primary announcements, club leaders, or both. Senders choose destinations per post. Club posts never appear on /live.</p>
    <p className="hint">Existing primary and club-channel webhooks remain available. Uncheck all assignments below to stop offering a secondary webhook.</p>
    <Notice ok={params.ok} error={params.error} />
    {forms.map(webhook => <form key={webhook.id || "new"} action={saveWebhookAction} className="panel settings-form">
      <h2>{webhook.id ? webhook.name : "Add webhook"}</h2><input type="hidden" name="id" value={webhook.id} />
      <label>Name<input name="name" required maxLength={80} defaultValue={webhook.name} placeholder="e.g. Robotics announcements" /></label>
      <label>Webhook URL<input name="url" type="password" autoComplete="off" required={!webhook.id} placeholder={webhook.id ? "Leave blank to keep saved URL" : "https://discord.com/api/webhooks/…"} /></label>
      {webhook.id && <Suspense fallback={<p>Loading webhook profile…</p>}><WebhookProfile encryptedUrl={webhook.webhook_url_encrypted} /></Suspense>}
      <fieldset className="webhook-picker"><legend>Available to</legend>
        <label><input type="checkbox" name="primary" defaultChecked={webhook.primary_enabled} /> Primary announcements (admins)</label>
        {leaders.map(leader => <label key={leader.id}><input type="checkbox" name="accounts" value={leader.id} defaultChecked={assignments.some(a => a.webhook_id === webhook.id && a.account_id === leader.id)} /> {leader.username}</label>)}
      </fieldset><PendingButton className="primary" pendingText="Saving…">Save webhook and assignments</PendingButton>
    </form>)}
  </main>;
}
