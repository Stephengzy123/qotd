"use client";

import { useEffect, useState } from "react";

type Theme = "system" | "light" | "dark";

export function AdminThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const saved = window.localStorage.getItem("announcement-admin-theme");
    const next: Theme = saved === "light" || saved === "dark" ? saved : "system";
    setTheme(next);
    document.querySelector<HTMLElement>(".admin-frame")?.setAttribute("data-theme", next);
  }, []);

  function choose(next: Theme) {
    setTheme(next);
    window.localStorage.setItem("announcement-admin-theme", next);
    document.querySelector<HTMLElement>(".admin-frame")?.setAttribute("data-theme", next);
  }

  return <div className="admin-theme-toggle" role="group" aria-label="Color theme">
    {(["system", "light", "dark"] as Theme[]).map(option => <button key={option} type="button" className={theme === option ? "active" : undefined} aria-pressed={theme === option} onClick={() => choose(option)}>{option === "system" ? "Auto" : option[0].toUpperCase() + option.slice(1)}</button>)}
  </div>;
}
