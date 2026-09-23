"use client";
import { useActionState, useEffect, useState } from "react";
import { submitIssue } from "@/app/report/actions";
import { PendingButton } from "@/components/pending-button";

export function IssueReportForm({ category, context }: { category: string; context: string }) {
  const suggestion = category === "suggestion";
  const [id, setId] = useState("");
  const [result, action] = useActionState<{ error?: string; success?: string }, FormData>(submitIssue, {});
  useEffect(() => setId(crypto.randomUUID()), []);
  if (result.success) return <div role="status"><p>{result.success}</p><a href="/live" className="secondary">Back to announcements</a><a href="/live/calendar" className="secondary">View calendar</a></div>;
  return <form action={action} className="stack">
    <input type="hidden" name="requestId" value={id} />
    {suggestion ? <input type="hidden" name="category" value="suggestion" /> : <><label htmlFor="issue-category">What is this about?</label><select id="issue-category" name="category" defaultValue={category}><option value="general">General / something else</option><option value="announcement">Announcement</option><option value="calendar">Calendar or lunch menu</option></select><label htmlFor="issue-context">Related item (optional)</label><input id="issue-context" name="context" defaultValue={context} maxLength={500} /></>}
    <label htmlFor="issue-description">{suggestion ? "What would you like added or improved?" : "What is wrong?"}</label><textarea id="issue-description" name="description" rows={6} minLength={10} maxLength={2000} required placeholder={suggestion ? "Describe your idea and how it would help." : "Tell us what happened and what needs correcting."} />
    <p className="hint">{suggestion ? "Suggestions" : "Reports"} are visible only to admins. No account is required. Avoid including sensitive personal information.</p>
    {result.error && <p role="alert" className="send-error">{result.error}</p>}
    <PendingButton className="primary" disabled={!id} pendingText="Submitting…">{suggestion ? "Submit suggestion" : "Submit report"}</PendingButton>
  </form>;
}
