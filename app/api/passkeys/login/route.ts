import { NextResponse } from "next/server";
import { createSession, homePath } from "@/lib/auth";
import { logEvent } from "@/lib/log";
import { authenticationOptions, completeAuthentication } from "@/lib/passkeys";

export const runtime = "nodejs";

// GET → request options; POST → verify the assertion and start a session.
export async function GET() {
  return NextResponse.json(await authenticationOptions());
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { response?: never } | null;
  if (!body?.response) return NextResponse.json({ error: "Missing passkey response." }, { status: 400 });
  const result = await completeAuthentication(body.response);
  if (result.error !== undefined) {
    await logEvent({ action: "login", success: false, details: { method: "passkey", reason: result.error } });
    return NextResponse.json({ error: result.error }, { status: 401 });
  }
  await createSession(result.account.role, result.account.username);
  await logEvent({ action: "login", actor: result.account.username, role: result.account.role, details: { method: "passkey" } });
  return NextResponse.json({ ok: true, redirect: homePath(result.account.role) });
}
