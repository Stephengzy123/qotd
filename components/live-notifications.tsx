"use client";
import { useEffect, useState } from "react";

async function save(subscription: PushSubscription, method: "POST" | "DELETE") {
  const response = await fetch("/api/push", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription.toJSON()) });
  if (!response.ok) throw new Error(await response.text());
}

export function LiveNotifications() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(true);
  const [status, setStatus] = useState("");
  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        if (!window.isSecureContext || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
          setStatus("Use a supported browser. On iPhone/iPad, add this site to your Home Screen first."); return;
        }
        const response = await fetch("/api/push", { cache: "no-store" });
        if (!response.ok) throw new Error("Could not load notification settings. Reload to retry.");
        const config = await response.json();
        await navigator.serviceWorker.register("/live-sw.js", { scope: "/live", updateViaCache: "none" });
        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        if (cancelled) return;
        setRegistration(reg); setSubscription(existing); setKey(config.publicKey || "");
        if (!config.publicKey) setStatus("Notifications are not configured yet.");
        else if (Notification.permission === "denied") setStatus("Notifications are blocked. Allow them in browser settings.");
        else if (existing) await save(existing, "POST");
      } catch (error) { if (!cancelled) setStatus(error instanceof Error ? error.message : "Could not load notifications."); }
      finally { if (!cancelled) setBusy(false); }
    }
    void init();
    return () => { cancelled = true; };
  }, []);

  async function toggle() {
    if (!registration) return;
    setBusy(true); setStatus("");
    try {
      if (subscription) {
        await save(subscription, "DELETE");
        await subscription.unsubscribe();
        setSubscription(null); setStatus("Notifications off for this browser.");
      } else {
        if (await Notification.requestPermission() !== "granted") {
          setStatus("Notifications weren’t enabled. Allow them in browser settings."); return;
        }
        const raw = atob(key.replace(/-/g, "+").replace(/_/g, "/"));
        const bytes = Uint8Array.from(raw, character => character.charCodeAt(0));
        const created = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
        try { await save(created, "POST"); }
        catch (error) { await created.unsubscribe(); throw error; }
        setSubscription(created); setStatus("Notifications on—even when this tab is closed.");
      }
    } catch (error) { setStatus(error instanceof Error ? error.message : "Could not change notifications. Try again."); }
    finally { setBusy(false); }
  }
  return <div className="live-notifications">
    <button type="button" disabled={busy || !registration || (!key && !subscription)} onClick={toggle} aria-pressed={Boolean(subscription)}>
      {busy ? "Checking…" : subscription ? "Disable notifications" : "Enable notifications"}
    </button>
    {status && <small role="status">{status}</small>}
  </div>;
}
