"use client";

import { FormEvent, useState } from "react";
import { updateLiveChannelName } from "@/app/live/actions";

export function LiveChannelName({ initialName, editable }: { initialName: string; editable: boolean }) {
  const [name, setName] = useState(initialName);
  const [draft, setDraft] = useState(initialName);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError("");
    try {
      const result = await updateLiveChannelName(draft);
      setName(result.name); setDraft(result.name); setEditing(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save the channel name."); }
    finally { setSaving(false); }
  }
  if (!editable) return <h1>{name}</h1>;
  if (!editing) return <div className="live-channel-name"><h1>{name}</h1><button type="button" onClick={() => { setDraft(name); setEditing(true); }}>Edit</button></div>;
  return <form className="live-channel-edit" onSubmit={save}><label className="sr-only" htmlFor="live-channel-name">Channel name</label><input id="live-channel-name" value={draft} onChange={(event) => setDraft(event.target.value)} minLength={1} maxLength={60} required autoFocus /><button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</button><button type="button" disabled={saving} onClick={() => { setDraft(name); setError(""); setEditing(false); }}>Cancel</button>{error && <p role="alert">{error}</p>}</form>;
}
