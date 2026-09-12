"use client";

import { useEffect, useState } from "react";

export function NoticeToast({ message, error }: { message: string; error: boolean }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("ok");
    url.searchParams.delete("error");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    const timer = window.setTimeout(() => setVisible(false), error ? 10000 : 6000);
    return () => window.clearTimeout(timer);
  }, [error]);
  if (!visible) return null;
  return <div className={`notice notice-toast ${error ? "notice-error" : "notice-ok"}`} role={error ? "alert" : "status"}>
    <span>{message}</span><button type="button" className="text-button" aria-label="Dismiss notification" onClick={() => setVisible(false)}>×</button>
  </div>;
}
