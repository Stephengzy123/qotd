"use client";

import { deleteApprovedQuestionAction, sendQuestionAction, unapproveQuestionAction } from "@/app/actions";
import { PendingButton } from "@/components/pending-button";

export function ApprovedQuestionActions({ id, question }: { id: string; question: string }) {
  return (
    <div className="approved-actions">
      <form action={sendQuestionAction}>
        <input type="hidden" name="id" value={id} />
        <PendingButton className="send-button" aria-label={`Send: ${question}`} pendingText="Sending…">Send</PendingButton>
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
