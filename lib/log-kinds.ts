// Groups log actions into a handful of families so the log page can color them.
export type LogKind = "auth" | "review" | "send" | "account" | "settings" | "system";

export function logKind(action: string): LogKind {
  if (/^(login|logout|complete_setup)$/.test(action)) return "auth";
  if (/announcement|question|club_post|dispatch|send|notification/.test(action)) return /approve|reject|edit|submit|unapprove|delete_announcement|add_approved/.test(action) ? "review" : "send";
  if (/account|setup_link|user/.test(action)) return "account";
  if (/settings|webhook|template|live_visibility/.test(action)) return "settings";
  return "system";
}

export function labelAction(action: string) {
  return action.replaceAll("_", " ");
}
