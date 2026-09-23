import { IssueReportForm } from "@/components/issue-report-form";
export default async function ReportPage({ searchParams }: { searchParams: Promise<{ category?: string; context?: string }> }) {
  const params = await searchParams;
  const category = ["announcement", "calendar"].includes(params.category || "") ? params.category! : "general";
  return <main style={{ maxWidth: 700, margin: "2rem auto", padding: "1rem" }}><a href="/live">← Live announcements</a><h1>Report an issue</h1><p>Wrong dates, announcement corrections, menu issues, or anything else that needs our attention.</p><section className="panel" style={{ padding: "1.25rem" }}><IssueReportForm category={category} context={(params.context || "").slice(0, 500)} /></section></main>;
}
