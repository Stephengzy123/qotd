import type { Metadata } from "next";
import { PublicTimetablePage } from "@/components/public-timetable-page";
import { getSession } from "@/lib/auth";
import { dbReady } from "@/lib/db";
import { restoreClasses } from "@/lib/personal-timetable";
import "../live.css";

export const metadata: Metadata = { title: "My Timetable | Live Announcements" };
export const dynamic = "force-dynamic";

export default async function TimetablePage() {
  const session = await getSession();
  if (session?.role !== "admin") return <PublicTimetablePage />;
  const owner = session.accountId ? `account:${session.accountId}` : `username:${session.username}`;
  const sql = await dbReady();
  const row = (await sql<{ classes: unknown }[]>`select classes from personal_timetables where owner_key = ${owner} and revoked_at is null order by updated_at desc limit 1`)[0];
  let adminClasses: Record<string, string> | undefined;
  try { if (row) adminClasses = restoreClasses(row.classes); } catch { /* Invalid old data should not block the public editor. */ }
  return <PublicTimetablePage adminStorageKey={`personal-timetable:${session.accountId || session.username}`} adminClasses={adminClasses} />;
}
