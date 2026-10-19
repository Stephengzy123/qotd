import { LiveFeed } from "@/components/live-feed";
import { getSession } from "@/lib/auth";
import { webhookOptions } from "@/lib/webhook-destinations";
import { dbReady } from "@/lib/db";
import { publicLiveIdentity } from "@/lib/public-data";
import { pacificParts } from "@/lib/qotd";
import "./live.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Live Announcements",
  applicationName: "Live Announcements",
  manifest: "/live.webmanifest",
  appleWebApp: { capable: true, title: "Live Announcements", statusBarStyle: "default" },
  icons: { icon: "/live-icon-192.png", apple: "/live-icon-180.png" },
};
export const viewport: Viewport = { themeColor: "#22252b" };
export default async function LivePage() {
  const [session, identity] = await Promise.all([getSession(), publicLiveIdentity()]);
  let roleId: string | null = null;
  if (session?.role === "admin") {
    const sql = await dbReady();
    roleId = (await sql`select mention_role_id from settings where singleton = true`)[0]?.mention_role_id || null;
  }
  const destinations = session?.role === "admin" ? await webhookOptions() : [];
  const today = pacificParts().localDate;
  return <LiveFeed destinations={destinations} isAdmin={session?.role === "admin"} roleId={roleId} {...identity} calendarToday={today} />;
}
