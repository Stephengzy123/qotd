"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { dbReady } from "@/lib/db";
import { hashAddress } from "@/lib/security";
import { requireRole } from "@/lib/auth";
import { logEvent } from "@/lib/log";

export async function submitIssue(_previous: { error?: string; success?: string }, form: FormData) {
  const id = String(form.get("requestId") || "");
  const category = String(form.get("category") || "");
  const context = String(form.get("context") || "").trim();
  const description = String(form.get("description") || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return { error: "Reload the page and try again." };
  if (!["announcement", "calendar", "general", "suggestion"].includes(category) || context.length > 500 || description.length < 10 || description.length > 2000) return { error: "Choose a category and enter 10–2,000 characters." };
  const confirmation = category === "suggestion" ? "Suggestion received. Thanks for helping improve the site!" : "Report received. An admin will review it.";
  try {
    const h = await headers();
    const hash = hashAddress(h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown");
    const sql = await dbReady();
    const result = await sql.begin(async tx => {
      await tx`select pg_advisory_xact_lock(hashtextextended(${hash}, 82641))`;
      if ((await tx`select id from issue_reports where id = ${id}`).length) return { success: confirmation };
      const [rate] = await tx`select count(*)::int as count from issue_reports where reporter_hash = ${hash} and created_at > now() - interval '1 hour'`;
      if (rate.count >= 10) return { error: "Too many submissions from this network. Please try again later." };
      await tx`insert into issue_reports (id, category, context, description, reporter_hash) values (${id}, ${category}, ${context}, ${description}, ${hash})`;
      return { success: confirmation };
    });
    revalidatePath("/admin/reports");
    return result;
  } catch { return { error: "Could not submit. Please try again." }; }
}

export async function updateIssue(form: FormData) {
  const session = await requireRole("admin");
  const id = String(form.get("id") || "");
  const status = String(form.get("status") || "");
  if (!/^[0-9a-f-]{36}$/i.test(id) || !["open", "resolved"].includes(status)) throw new Error("Invalid report update");
  const sql = await dbReady();
  await sql`update issue_reports set status = ${status}, resolved_at = ${status === "resolved" ? new Date() : null}, resolved_by = ${status === "resolved" ? session.username : null} where id = ${id}`;
  await logEvent({ action: "update_issue_report", actor: session.username, role: session.role, details: { id, status } });
  revalidatePath("/admin/reports");
}
