"use client";

import { useEffect, useState } from "react";

type InstallPrompt = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function LiveInstall() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [invite, setInvite] = useState(false);

  useEffect(() => {
    const display = window.matchMedia("(display-mode: standalone)");
    const update = () => setInstalled(display.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    const offer = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    const complete = () => { setInstalled(true); setPrompt(null); };
    update(); setReady(true);
    if (!display.matches && !(navigator as Navigator & { standalone?: boolean }).standalone) {
      try { setInvite(localStorage.getItem("live-install-offered-v1") !== "yes"); }
      catch { setInvite(true); }
    }
    const clearUnread = () => {
      if (document.visibilityState !== "visible" || !document.hasFocus()) return;
      const badges = navigator as Navigator & { clearAppBadge?: () => Promise<void> };
      void badges.clearAppBadge?.().catch(() => {});
      if ("serviceWorker" in navigator) void navigator.serviceWorker.ready.then(registration => {
        if (document.visibilityState === "visible" && document.hasFocus()) registration.active?.postMessage({ type: "LIVE_READ" });
      }).catch(() => {});
    };
    clearUnread();
    window.addEventListener("focus", clearUnread);
    document.addEventListener("visibilitychange", clearUnread);
    display.addEventListener("change", update);
    window.addEventListener("beforeinstallprompt", offer);
    window.addEventListener("appinstalled", complete);
    return () => {
      window.removeEventListener("focus", clearUnread);
      document.removeEventListener("visibilitychange", clearUnread);
      display.removeEventListener("change", update);
      window.removeEventListener("beforeinstallprompt", offer);
      window.removeEventListener("appinstalled", complete);
    };
  }, []);

  function dismissInvite() {
    setInvite(false);
    try { localStorage.setItem("live-install-offered-v1", "yes"); } catch {}
  }

  async function install() {
    if (!prompt) return;
    dismissInvite();
    setBusy(true); setStatus("");
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === "accepted") setStatus("Open Live Announcements from your apps. Allow its system notification prompt if shown.");
    } catch { setStatus("Use your browser’s install menu to try again."); }
    finally { setPrompt(null); setBusy(false); }
  }

  if (!ready) return null;
  if (installed) return <details className="live-install"><summary>App notifications</summary><p>If alerts are missing, allow Live Announcements in your device’s notification settings. Installing may require a separate permission from Chrome.</p></details>;
  return <div className="live-install">
    {invite && <aside aria-label="Install Live Announcements" className="live-install-invite"><strong>Install Live Announcements?</strong><p>Keep it in your apps with notifications and unread badges on supported devices.</p><button type="button" onClick={dismissInvite}>Not now</button></aside>}
    {prompt ? <button type="button" disabled={busy} onClick={install}>{busy ? "Installing…" : "Install app"}</button> :
      <details><summary>Install app</summary><p>Chrome/Edge: use the install icon in the address bar or the browser’s install menu. iPhone/iPad: Safari → Share → Add to Home Screen. Mac Safari: File → Add to Dock.</p><p>Open the installed app and enable notifications. Supported browsers can show the app’s name and icon instead of Chrome.</p></details>}
    {status && <small role="status">{status}</small>}
  </div>;
}
