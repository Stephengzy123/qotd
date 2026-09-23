"use client";

import { useEffect, useState } from "react";
import { IssueReportForm } from "@/components/issue-report-form";

export function LiveFeedbackPage({ category, context = "" }: { category: string; context?: string }) {
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
  const suggestion = category === "suggestion";
  return <main className="live-shell live-feedback" data-theme={theme}>
    <div className="live-feedback-inner">
      <a href="/live">← Live announcements</a>
      <h1>{suggestion ? "Suggest a feature" : "Report an issue"}</h1>
      <p>{suggestion ? "What would make the announcements or calendar more useful for you?" : "Wrong dates, announcement corrections, menu issues, or anything else that needs our attention."}</p>
      <section className="panel"><IssueReportForm key={category} category={category} context={context} /></section>
    </div>
  </main>;
}
