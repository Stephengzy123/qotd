"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createAccountAction } from "@/app/actions";
import { PendingButton } from "@/components/pending-button";
import type { Role } from "@/lib/auth";

const ACCOUNT_TYPES: { value: Role; label: string; description: string }[] = [
  { value: "contributor", label: "Contributor", description: "Writes announcements and events for admin review before they go out." },
  { value: "club_leader", label: "Club leader", description: "Posts directly to their own club channel. You connect the channel's webhook next." },
  { value: "admin", label: "Admin", description: "Reviews submissions, changes settings, and manages accounts." },
];

// Two-step overlay: pick the account type, then the username. No password is
// collected; the account page that follows shows a setup link to share.
export function CreateAccountDialog() {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"type" | "name">("type");
  const [role, setRole] = useState<Role | null>(null);
  const [username, setUsername] = useState("");
  const selected = ACCOUNT_TYPES.find((type) => type.value === role);

  useEffect(() => {
    document.body.classList.toggle("dialog-open", open);
    return () => document.body.classList.remove("dialog-open");
  }, [open]);

  function show() {
    setStep("type");
    setRole(null);
    setUsername("");
    setOpen(true);
    dialog.current?.showModal();
  }

  function close() {
    if (username.trim() && !window.confirm("Discard this account?")) return;
    dialog.current?.close();
  }

  return <>
    <button type="button" className="primary" onClick={show}>＋ Create account</button>
    <dialog ref={dialog} className="composer-dialog account-dialog" aria-labelledby={titleId} onClose={() => setOpen(false)} onCancel={(event) => { event.preventDefault(); close(); }}>
      <div className="composer-dialog-header">
        <div><h2 id={titleId}>Create an account</h2><p className="hint">Step {step === "type" ? 1 : 2} of 2 · {step === "type" ? "Choose the account type" : "Choose a username"}</p></div>
        <button type="button" className="text-button" onClick={close} aria-label="Close">Close ×</button>
      </div>
      {open && <form action={createAccountAction} className="account-form">
        <input type="hidden" name="role" value={role ?? ""} />
        {step === "type" ? <>
          <div className="account-types" role="radiogroup" aria-label="Account type">
            {ACCOUNT_TYPES.map((type) => <label key={type.value} className={`account-type${role === type.value ? " active" : ""}`}>
              <input type="radio" name="roleChoice" value={type.value} checked={role === type.value} onChange={() => setRole(type.value)} onDoubleClick={() => setStep("name")} />
              <strong>{type.label}</strong><span>{type.description}</span>
            </label>)}
          </div>
          <div className="form-footer">
            <p>You’ll get a link to send them so they can pick their own password.</p>
            <div className="composer-submit"><button type="button" className="secondary" onClick={close}>Cancel</button><button type="button" className="primary" disabled={!role} onClick={() => setStep("name")}>Continue →</button></div>
          </div>
        </> : <>
          <div className="account-name-step">
            <p className="account-summary"><span className="count-badge">{selected?.label}</span><button type="button" className="text-button" onClick={() => setStep("type")}>Change type</button></p>
            <div>
              <label htmlFor="new-username">Username</label>
              <input id="new-username" name="username" autoComplete="off" pattern="[A-Za-z0-9._\-]{2,64}" minLength={2} maxLength={64} required autoFocus value={username} onChange={(event) => setUsername(event.target.value)} placeholder={role === "club_leader" ? "e.g. chess-club" : "e.g. jordan"} />
              <p className="hint">2–64 letters, numbers, dots, underscores, or dashes. This is what they’ll sign in with.</p>
            </div>
            {role === "club_leader" && <p className="hint">Next you’ll connect the club’s Discord channel by pasting its webhook URL.</p>}
          </div>
          <div className="form-footer">
            <p>No password needed here — they set it from the setup link.</p>
            <div className="composer-submit"><button type="button" className="secondary" onClick={() => setStep("type")}>← Back</button><PendingButton className="primary" pendingText="Creating…" disabled={!role || !username.trim()}>Create account</PendingButton></div>
          </div>
        </>}
      </form>}
    </dialog>
  </>;
}
