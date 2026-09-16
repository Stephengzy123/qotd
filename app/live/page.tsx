import { LiveFeed } from "@/components/live-feed";
import { getSession } from "@/lib/auth";
import { dbReady } from "@/lib/db";
import { getWebhookDetails } from "@/lib/webhook-details";
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
  const session = await getSession();
  const sql = await dbReady();
  const settings = (await sql`select webhook_url_encrypted, mention_role_id from settings where singleton = true`)[0];
  const profile = await getWebhookDetails(settings?.webhook_url_encrypted as string | undefined);
  return <LiveFeed isAdmin={session?.role === "admin"} roleId={session?.role === "admin" ? settings?.mention_role_id : null} botName={profile.status === "connected" ? profile.name : "Announcements"} avatarUrl={profile.status === "connected" ? profile.avatarUrl : null} />;
}
