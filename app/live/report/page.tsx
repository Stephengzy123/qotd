import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LiveFeedbackPage } from "@/components/live-feedback-page";
import "../live.css";

export const metadata: Metadata = { title: "Report an issue | Live Announcements", manifest: "/live.webmanifest" };

export default async function ReportPage({ searchParams }: { searchParams: Promise<{ category?: string; context?: string }> }) {
  const params = await searchParams;
  if (params.category === "suggestion") redirect("/live/suggest");
  const category = ["announcement", "calendar"].includes(params.category || "") ? params.category! : "general";
  return <LiveFeedbackPage category={category} context={(params.context || "").slice(0, 500)} />;
}
