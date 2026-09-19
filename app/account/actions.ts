"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { logEvent } from "@/lib/log";
import { deletePasskey } from "@/lib/passkeys";

export async function removePasskeyAction(formData: FormData) {
  const session = await getSession();
  if (!session?.accountId) redirect("/login");
  const id = String(formData.get("id") || "");
  const removed = await deletePasskey(session.accountId, id);
  await logEvent({ action: "remove_passkey", actor: session.username, role: session.role, success: removed });
  revalidatePath("/account");
  redirect(`/account?${removed ? "ok" : "error"}=${encodeURIComponent(removed ? "Passkey removed." : "That passkey was already removed.")}`);
}
