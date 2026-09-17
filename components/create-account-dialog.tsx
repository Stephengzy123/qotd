"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createAccountAction } from "@/app/actions";
import { PendingButton } from "@/components/pending-button";
import type { Role } from "@/lib/auth";

type ClubOption = { id: string; name: string; hasLeader: boolean };

const ACCOUNT_TYPES: { value: Role; label: string; description: string; badge: string }[] = [
  { value: "contributor", label: "Contributor", description: "Writes announcements and events for admin review before they go out.", badge: "mode-contributor" },
  { value: "club_leader", label: "Club member", description: "Posts to one club’s channel. Leaders post directly; assistants need a leader’s approval.", badge: "mode-leader" },
  { value: "admin", label: "Admin", description: "Reviews submissions, changes settings, and manages accounts and clubs.", badge: "mode-admin" },
];

// Overlay for creating an account: type → username (+ club and permission
// for club members). No password is collected; a setup link comes next.
export function CreateAccountDialog({ clubs }: { clubs: ClubOption[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"type" | "name">("type");
  const [role, setRole] = useState<Role | null>(null);
  const [username, setUsername] = useState("");
  const [club, setClub] = useState(clubs[0]?.id || "new");
  const [clubName, setClubName] = useState("");
  const [clubRole, setClubRole] = useState<"leader" | "assistant">("leader");
  const selected = ACCOUNT_TYPES.find((type) => type.value === role);
  const chosenClub = clubs.find((item) => item.id === club);
  const assistantAllowed = Boolean(chosenClub?.hasLeader);
  const clubReady = role !== "club_leader" || (club === "new" ? clubName.trim().length >= 2 : Boolean(chosenClub));

  useEffect(() => {
    document.body.classList.toggle("dialog-open", open);
    return () => document.body.classList.remove("dialog-open");
  }, [open]);

  useEffect(() => { if (!assistantAllowed) setClubRole("leader"); }, [assistantAllowed]);

  function show() {
    setStep("type"); setRole(null); setUsername(""); setClubName(""); setClubRole("leader"); setClub(clubs[0]?.id || "new");
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
        <div><h2 id={titleId}>Create an account</h2><p className="hint">Step {step === "type" ? 1 : 2} of 2 · {step === "type" ? "Choose the account type" : role === "club_leader" ? "Username, club, and permission" : "Choose a username"}</p></div>
        <button type="button" className="text-button" onClick={close} aria-label="Close">Close ×</button>
      </div>
      {open && <form action={createAccountAction} className="account-form">
        <input type="hidden" name="role" value={role ?? ""} />
        {step === "type" ? <>
          <div className="account-types" role="radiogroup" aria-label="Account type">
            {ACCOUNT_TYPES.map((type) => <label key={type.value} className={`account-type${role === type.value ? " active" : ""}`}>
              <input type="radio" name="roleChoice" value={type.value} checked={role === type.value} onChange={() => setRole(type.value)} onDoubleClick={() => setStep("name")} />
              <strong><span className={`mode-badge ${type.badge}`}>{type.label}</span></strong><span>{type.description}</span>
            </label>)}
          </div>
          <div className="form-footer">
            <p>You’ll get a link to send them so they can pick their own password.</p>
            <div className="composer-submit"><button type="button" className="secondary" onClick={close}>Cancel</button><button type="button" className="primary" disabled={!role} onClick={() => setStep("name")}>Continue →</button></div>
          </div>
        </> : <>
          <div className="account-name-step">
            <p className="account-summary"><span className={`mode-badge ${selected?.badge}`}>{selected?.label}</span><button type="button" className="text-button" onClick={() => setStep("type")}>Change type</button></p>
            <div>
              <label htmlFor="new-username">Username</label>
              <input id="new-username" name="username" autoComplete="off" pattern="[A-Za-z0-9._\-]{2,64}" minLength={2} maxLength={64} required autoFocus value={username} onChange={(event) => setUsername(event.target.value)} placeholder={role === "club_leader" ? "e.g. chess-sam" : "e.g. jordan"} />
              <p className="hint">2–64 letters, numbers, dots, underscores, or dashes. This is what they’ll sign in with.</p>
            </div>
            {role === "club_leader" && <>
              <div>
                <label htmlFor="club-choice">Club</label>
                <select id="club-choice" name="club" value={club} onChange={(event) => setClub(event.target.value)}>
                  {clubs.map((item) => <option key={item.id} value={item.id}>{item.name}{item.hasLeader ? "" : " (no leader yet)"}</option>)}
                  <option value="new">＋ New club…</option>
                </select>
                {club === "new" && <input name="clubName" className="stacked-input" placeholder="Club name" minLength={2} maxLength={80} required value={clubName} onChange={(event) => setClubName(event.target.value)} />}
                {club === "new" && <p className="hint">You’ll connect the club’s Discord webhook right after this.</p>}
              </div>
              <div>
                <span className="label">Permission</span>
                <div className="segmented" role="radiogroup" aria-label="Permission">
                  <label className={clubRole === "leader" ? "active" : undefined}><input type="radio" name="clubRole" value="leader" checked={clubRole === "leader"} onChange={() => setClubRole("leader")} />Leader</label>
                  <label className={clubRole === "assistant" ? "active" : undefined} aria-disabled={!assistantAllowed}><input type="radio" name="clubRole" value="assistant" checked={clubRole === "assistant"} disabled={!assistantAllowed} onChange={() => setClubRole("assistant")} />Assistant</label>
                </div>
                <p className="hint">{assistantAllowed ? "Leaders post directly and approve assistants’ drafts." : club === "new" ? "The first member of a new club is its leader." : "This club has no leader yet, so the first member must be a leader."}</p>
              </div>
            </>}
          </div>
          <div className="form-footer">
            <p>No password needed here — they set it from the setup link.</p>
            <div className="composer-submit"><button type="button" className="secondary" onClick={() => setStep("type")}>← Back</button><PendingButton className="primary" pendingText="Creating…" disabled={!role || !username.trim() || !clubReady}>Create account</PendingButton></div>
          </div>
        </>}
      </form>}
    </dialog>
  </>;
}
