import { requireRole } from "@/lib/auth";
import { dbReady } from "@/lib/db";
import { deleteWebhookAction, saveWebhookAction } from "./actions";
import { PendingButton } from "@/components/pending-button";
import { WebhookProfile } from "@/components/webhook-profile";
import { AdminShell } from "@/components/admin-shell";
import { Suspense } from "react";

export default async function WebhooksPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const session = await requireRole("admin");
  const params = await searchParams;
  const sql = await dbReady();
  const [webhooks, leaders, assignments] = await Promise.all([
    sql<{ id: string; name: string; webhook_url_encrypted: string; primary_enabled: boolean }[]>`select id, name, webhook_url_encrypted, primary_enabled from saved_webhooks order by name, id`,
    sql<{ id: string; username: string }[]>`select a.id, a.username from accounts a join club_members m on m.account_id = a.id where a.role = 'club_leader' and m.club_role = 'leader' order by a.username`,
    sql<{ webhook_id: string; account_id: string }[]>`select webhook_id, account_id from webhook_assignments`,
  ]);
  const forms = [{ id: "", name: "", webhook_url_encrypted: "", primary_enabled: false }, ...webhooks];
  return <AdminShell page="webhooks" username={session.username} title="Discord destinations" description="Assign destinations to announcements or club managers. Senders choose per post." notice={params}>
    {forms.map(webhook => <form key={webhook.id || "new"} action={saveWebhookAction} className="panel settings-form">
      <h2>{webhook.id ? webhook.name : "Add webhook"}</h2><input type="hidden" name="id" value={webhook.id} />
      <label>Name<input name="name" required maxLength={80} defaultValue={webhook.name} placeholder="e.g. Robotics announcements" /></label>
      <label>Webhook URL<input name="url" type="password" autoComplete="off" required={!webhook.id} placeholder={webhook.id ? "Leave blank to keep saved URL" : "https://discord.com/api/webhooks/…"} /></label>
      {webhook.id && <Suspense fallback={<p>Loading webhook profile…</p>}><WebhookProfile encryptedUrl={webhook.webhook_url_encrypted} /></Suspense>}
      <fieldset className="webhook-picker"><legend>Available to</legend>
        <label><input type="checkbox" name="primary" defaultChecked={webhook.primary_enabled} /> Primary announcements (admins)</label>
        {leaders.map(leader => <label key={leader.id}><input type="checkbox" name="accounts" value={leader.id} defaultChecked={assignments.some(a => a.webhook_id === webhook.id && a.account_id === leader.id)} /> {leader.username}</label>)}
      </fieldset><div className="row-buttons"><PendingButton className="primary" pendingText="Saving…">Save webhook and assignments</PendingButton>{webhook.id && <PendingButton formAction={deleteWebhookAction} formNoValidate className="danger" pendingText="Deleting…" confirmMessage={`Delete “${webhook.name}”? It will be removed from all assignments.`}>Delete webhook</PendingButton>}</div>
    </form>)}
  </AdminShell>;
}
