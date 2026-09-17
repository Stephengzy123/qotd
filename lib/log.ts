// No "server-only" marker: lib/qotd.ts is shared with client components and
// relies on tree shaking to drop these server-side helpers, like lib/db.ts.
import { db } from "@/lib/db";

export type LogEntry = {
  action: string;
  actor?: string | null;
  role?: string | null;
  success?: boolean;
  details?: Record<string, unknown> | null;
};

// Writes every event to the server console and the activity_log table.
// Logging must never break the action that triggered it.
export async function logEvent(entry: LogEntry) {
  const success = entry.success ?? true;
  const record = { time: new Date().toISOString(), action: entry.action, actor: entry.actor ?? null, role: entry.role ?? null, success, details: entry.details ?? null };
  (success ? console.log : console.warn)(`[activity] ${JSON.stringify(record)}`);
  try {
    const sql = db();
    await sql`
      insert into activity_log (action, actor, actor_role, success, details)
      values (${record.action}, ${record.actor}, ${record.role}, ${success}, ${record.details ? sql.json(record.details as Parameters<typeof sql.json>[0]) : null}::jsonb)
    `;
  } catch (error) {
    console.error(`[activity] failed to persist log entry: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function errorDetail(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
