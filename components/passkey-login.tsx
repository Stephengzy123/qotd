"use client";

import { useState } from "react";
import { startAuthentication } from "@simplewebauthn/browser";

// One-tap sign-in with a passkey saved on this device. Falls back silently
// to the password form when the browser has no WebAuthn support.
export function PasskeyLogin() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const supported = typeof window !== "undefined" && "PublicKeyCredential" in window;
  if (!supported) return null;

  async function signIn() {
    setBusy(true);
    setError("");
    try {
      const options = await (await fetch("/api/passkeys/login", { cache: "no-store" })).json();
      const response = await startAuthentication({ optionsJSON: options });
      const verify = await fetch("/api/passkeys/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ response }) });
      const data = await verify.json();
      if (!verify.ok) throw new Error(data.error || "Passkey sign-in failed.");
      window.location.assign(data.redirect || "/");
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      setError(name === "NotAllowedError" ? "Sign-in was cancelled." : err instanceof Error ? err.message : "Passkey sign-in failed.");
      setBusy(false);
    }
  }

  return (
    <div className="passkey-login">
      <button type="button" className="secondary passkey-button" onClick={signIn} disabled={busy} data-pending={busy || undefined}>{busy ? "Waiting for your passkey…" : "Sign in with a passkey"}</button>
      {error && <p className="hint error-text" role="alert">{error}</p>}
      <div className="or-rule"><span>or use a password</span></div>
    </div>
  );
}
