"use client";

import { useEffect, useState } from "react";

type Theme = "system" | "light" | "dark";

export function AdminThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const saved = window.localStorage.getItem("announcement-admin-theme");
    setTheme(saved === "light" || saved === "dark" ? saved : "system");
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = (preference: Theme) => {
      const resolved = preference === "system" ? (mediaQuery.matches ? "dark" : "light") : preference;
      document.querySelector<HTMLElement>(".admin-frame")?.setAttribute("data-theme", resolved);
    };

    applyTheme(theme);

    const onSystemThemeChange = () => {
      if (theme === "system") applyTheme("system");
    };
    mediaQuery.addEventListener("change", onSystemThemeChange);
    return () => mediaQuery.removeEventListener("change", onSystemThemeChange);
  }, [theme]);

  function choose(next: Theme) {
    setTheme(next);
    window.localStorage.setItem("announcement-admin-theme", next);
    const resolved = next === "system"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : next;
    document.querySelector<HTMLElement>(".admin-frame")?.setAttribute("data-theme", resolved);
  }

  return <div className="admin-theme-toggle" role="group" aria-label="Color theme">
    {(["system", "light", "dark"] as Theme[]).map(option => <button key={option} type="button" className={theme === option ? "active" : undefined} aria-pressed={theme === option} onClick={() => choose(option)}>{option === "system" ? "Auto" : option[0].toUpperCase() + option.slice(1)}</button>)}
  </div>;
}
