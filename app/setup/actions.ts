"use server";

import { redirect } from "next/navigation";
import { completeSetup } from "@/lib/accounts";
import { createSession, homePath } from "@/lib/auth";
import { logEvent } from "@/lib/log";

export async function completeSetupAction(formData: FormData) {
  const token = String(formData.get("token") || "");
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirm") || "");
  const path = `/setup/${encodeURIComponent(token)}`;
  if (password !== confirm) {
    redirect(`${path}?error=${encodeURIComponent("The two passwords don’t match.")}`);
  }
  const result = await completeSetup(token, password);
  if (result.error !== undefined) {
    await logEvent({ action: "complete_setup", success: false, details: { reason: result.error } });
    redirect(`${path}?error=${encodeURIComponent(result.error)}`);
  }
  await createSession(result.role, result.username);
  await logEvent({ action: "complete_setup", actor: result.username, role: result.role });
  redirect(`${homePath(result.role)}?ok=${encodeURIComponent("Your password is set and you’re signed in.")}`);
}
