"use client";

import { deleteApprovedQuestionAction, sendQuestionAction, unapproveQuestionAction } from "@/app/actions";

export function ApprovedQuestionActions({ id, question }: { id: string; question: string }) {
  return (
    <div className="approved-actions">
      <form action={sendQuestionAction}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="transport" value="bot" />
        <button className="send-button" aria-label={`Send with bot: ${question}`}>Bot</button>
      </form>
      <form action={sendQuestionAction}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="transport" value="webhook" />
        <button className="send-button" aria-label={`Send with webhook: ${question}`}>Webhook</button>
      </form>
      <form action={unapproveQuestionAction}>
        <input type="hidden" name="id" value={id} />
        <button className="send-button">Unapprove</button>
      </form>
      <form action={deleteApprovedQuestionAction} onSubmit={(event) => {
        if (!window.confirm("Permanently delete this question?")) event.preventDefault();
      }}>
        <input type="hidden" name="id" value={id} />
        <button className="send-button delete-link">Delete</button>
      </form>
    </div>
  );
}
