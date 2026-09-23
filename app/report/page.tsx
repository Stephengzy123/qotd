import { redirect } from "next/navigation";
export default async function ReportPage({ searchParams }: { searchParams: Promise<{ category?: string; context?: string }> }) {
  const params = await searchParams;
  if (params.category === "suggestion") redirect("/live/suggest");
  const query = new URLSearchParams();
  if (params.category) query.set("category", params.category);
  if (params.context) query.set("context", params.context.slice(0, 500));
  redirect(`/live/report${query.size ? `?${query}` : ""}`);
}
