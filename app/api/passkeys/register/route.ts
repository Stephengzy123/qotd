import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { logEvent } from "@/lib/log";
import { completeRegistration, registrationOptions } from "@/lib/passkeys";

export const runtime = "nodejs";

// GET → creation options for the signed-in account; POST → store the new passkey.
export async function GET() {
  const session = await getSession();
  if (!session?.accountId) return NextResponse.json({ error: "Passkeys are only available for accounts created in the app." }, { status: 403 });
  return NextResponse.json(await registrationOptions({ id: session.accountId, username: session.username }));
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.accountId) return NextResponse.json({ error: "Sign in first." }, { status: 403 });
  const body = await request.json().catch(() => null) as { response?: never; name?: string } | null;
  if (!body?.response) return NextResponse.json({ error: "Missing passkey response." }, { status: 400 });
  const result = await completeRegistration({ id: session.accountId }, body.response, String(body.name || ""));
  await logEvent({ action: "add_passkey", actor: session.username, role: session.role, success: !("error" in result), details: { error: "error" in result ? result.error : undefined } });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, id: result.id });
}
