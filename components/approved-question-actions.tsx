"use client";

import { deleteApprovedQuestionAction, sendQuestionAction, unapproveQuestionAction } from "@/app/actions";
import { PendingButton } from "@/components/pending-button";
import { useState } from "react";
import { WebhookPicker } from "@/components/webhook-picker";
import type { WebhookOption } from "@/lib/webhook-destinations";

export function ApprovedQuestionActions({ id, question, destinations, selected }: { id: string; question: string; destinations: WebhookOption[]; selected?: string[] }) {
  const [destination, setDestination] = useState("discord");
  return (
    <div className="approved-actions">
      <form action={sendQuestionAction} className="send-options">
        <input type="hidden" name="id" value={id} />
        <label>Send to<select name="destination" value={destination} onChange={event => setDestination(event.target.value)}>
          <option value="discord">Discord + /live</option><option value="live">/live only</option>
        </select></label>
        <WebhookPicker options={destinations} selected={selected} disabled={destination === "live"} />
        <label><input type="checkbox" name="removePings" disabled={destination === "live"} /> Remove all pings{destination === "live" ? " (automatic)" : ""}</label>
        <PendingButton className="send-button" aria-label={`Send: ${question}`} pendingText="Sending…" confirmMessage={destination === "live" ? "Publish to /live only and notify subscribers? This marks it as sent; it will not be sent to Discord later." : undefined}>{destination === "live" ? "Publish to /live" : "Send"}</PendingButton>
      </form>
      <form action={unapproveQuestionAction}>
        <input type="hidden" name="id" value={id} />
        <PendingButton className="send-button" pendingText="Moving…">Unapprove</PendingButton>
      </form>
      <form action={deleteApprovedQuestionAction}>
        <input type="hidden" name="id" value={id} />
        <PendingButton className="send-button delete-link" pendingText="Deleting…" confirmMessage="Permanently delete this announcement?">Delete</PendingButton>
      </form>
    </div>
  );
}
