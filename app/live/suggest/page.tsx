import type { Metadata } from "next";
import { LiveFeedbackPage } from "@/components/live-feedback-page";
import "../live.css";

export const metadata: Metadata = { title: "Suggest a feature | Live Announcements", manifest: "/live.webmanifest" };

export default function SuggestPage() {
  return <LiveFeedbackPage category="suggestion" />;
}
