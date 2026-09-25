"use client";

import { useEffect, useState, type ReactNode } from "react";

export function LiveThemeShell({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<"light" | "dark" | undefined>();
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => {
      let preference = "system";
      try { preference = localStorage.getItem("announcement-live-theme") || "system"; } catch {}
      setTheme(preference === "light" || preference === "dark" ? preference : media.matches ? "dark" : "light");
    };
    sync();
    media.addEventListener("change", sync);
    window.addEventListener("storage", sync);
    return () => { media.removeEventListener("change", sync); window.removeEventListener("storage", sync); };
  }, []);
  return <main className="live-shell live-feedback live-history" data-theme={theme}>{children}</main>;
}
