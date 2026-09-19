"use client";

import { useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import { removePasskeyAction } from "@/app/account/actions";
import { PendingButton } from "@/components/pending-button";

type Passkey = { id: string; name: string | null; device_type: string | null; backed_up: boolean; created_at: string; last_used_at: string | null };

function when(value: string | null) {
  return value ? new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "never";
}

export function PasskeyManager({ passkeys }: { passkeys: Passkey[] }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error?: string; ok?: string }>({});
  const supported = typeof window !== "undefined" && "PublicKeyCredential" in window;

  async function add() {
    setBusy(true);
    setMessage({});
    try {
      const options = await (await fetch("/api/passkeys/register", { cache: "no-store" })).json();
      if (options.error) throw new Error(options.error);
      const response = await startRegistration({ optionsJSON: options });
      const name = window.prompt("Name this passkey (e.g. “MacBook” or “iPhone”)", "") || "";
      const save = await fetch("/api/passkeys/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ response, name }) });
      const data = await save.json();
      if (!save.ok) throw new Error(data.error || "The passkey could not be saved.");
      window.location.assign("/account?ok=" + encodeURIComponent("Passkey added. You can use it to sign in from now on."));
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      setMessage({ error: name === "NotAllowedError" ? "Cancelled — no passkey was added." : name === "InvalidStateError" ? "This device already has a passkey for your account." : err instanceof Error ? err.message : "The passkey could not be added." });
      setBusy(false);
    }
  }

  return (
    <div className="panel settings-form">
      <p className="hint">A passkey lets you sign in with Face ID, Touch ID, Windows Hello, or a security key — no password to type. Add one per device you use.</p>
      {passkeys.length ? <div className="activity-list passkey-list">{passkeys.map((key) => <div key={key.id}><span className="activity-dot success" /><div><strong>{key.name || (key.device_type === "multiDevice" ? "Synced passkey" : "Device passkey")}</strong><p>Added {when(key.created_at)} · last used {when(key.last_used_at)}{key.backed_up ? " · synced" : ""}</p></div><div className="recent-actions"><form action={removePasskeyAction}><input type="hidden" name="id" value={key.id} /><PendingButton className="danger" pendingText="Removing…" confirmMessage="Remove this passkey? You can add it again later.">Remove</PendingButton></form></div></div>)}</div> : <div className="empty-state compact"><p>No passkeys yet.</p></div>}
      {message.error && <p className="hint error-text" role="alert">{message.error}</p>}
      <div className="align-right">{supported ? <button type="button" className="primary" onClick={add} disabled={busy} data-pending={busy || undefined}>{busy ? "Follow the prompt…" : "＋ Add a passkey"}</button> : <span className="hint">This browser doesn’t support passkeys.</span>}</div>
    </div>
  );
}
