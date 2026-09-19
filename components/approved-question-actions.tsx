"use client";
import { useActionState } from "react";
import { deleteApprovedQuestionAction, saveDeliverySettingsAction, sendQuestionAction, unapproveQuestionAction } from "@/app/actions";
import { PendingButton } from "@/components/pending-button";
import { DeliverySettingsFields, type DeliveryFieldsProps } from "@/components/delivery-settings-fields";

export function ApprovedQuestionActions({ id, question, ...delivery }: DeliveryFieldsProps & { id: string; question: string }) {
  const [result, save] = useActionState<{ success?: string; error?: string }, FormData>(saveDeliverySettingsAction, {});
  return <details className="item-manage"><summary className="secondary">Manage</summary><div className="item-manage-panel">
    <form action={save} className="stack"><input type="hidden" name="id" value={id} /><DeliverySettingsFields {...delivery} />
      <div className="row-buttons"><PendingButton className="primary" pendingText="Saving…">Save settings</PendingButton><PendingButton formAction={sendQuestionAction} className="secondary" pendingText="Sending…" confirmMessage="Save these settings and send this announcement now?">Save & send now</PendingButton></div>
      {result.success && <p role="status" className="inline-feedback">{result.success}</p>}{result.error && <p role="alert" className="send-error">{result.error}</p>}
    </form><div className="row-buttons item-other-actions">
      <form action={unapproveQuestionAction}><input type="hidden" name="id" value={id} /><PendingButton className="secondary" pendingText="Moving…">Unapprove</PendingButton></form>
      <form action={deleteApprovedQuestionAction}><input type="hidden" name="id" value={id} /><PendingButton className="danger" pendingText="Deleting…" confirmMessage="Permanently delete this announcement?">Delete</PendingButton></form>
    </div></div></details>;
}
