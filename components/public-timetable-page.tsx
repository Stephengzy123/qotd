"use client";

import { useEffect, useState } from "react";
import { PersonalTimetableExport, PUBLIC_TIMETABLE_STORAGE_KEY } from "@/components/personal-timetable-export";

export function PublicTimetablePage({ adminStorageKey, adminClasses }: { adminStorageKey?: string; adminClasses?: Record<string, string> }) {
  const [theme, setTheme] = useState<"light" | "dark" | undefined>();
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => {
      let choice = "system";
      try { choice = localStorage.getItem("announcement-live-theme") || "system"; } catch {}
      setTheme(choice === "light" || choice === "dark" ? choice : media.matches ? "dark" : "light");
    };
    sync(); media.addEventListener("change", sync); window.addEventListener("storage", sync);
    return () => { media.removeEventListener("change", sync); window.removeEventListener("storage", sync); };
  }, []);
  return <main className="live-shell live-feedback" data-theme={theme}><div className="live-feedback-inner live-timetable-inner">
    <a href="/live">← Live announcements</a>
    <h1>My timetable</h1>
    <p>Add your classes for blocks A–H. The school rotation determines their order each day; school templates supply times, including Wednesdays and Flex Days.</p>
    <p><a href="/live/calendar">View your daily schedule on the calendar</a></p>
    <PersonalTimetableExport storageKey={PUBLIC_TIMETABLE_STORAGE_KEY} publicMode adminStorageKey={adminStorageKey} adminClasses={adminClasses} />
  </div></main>;
}
