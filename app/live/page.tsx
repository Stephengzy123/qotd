import { LiveFeed } from "@/components/live-feed";
import { getSession } from "@/lib/auth";
import { webhookOptions } from "@/lib/webhook-destinations";
import { dbReady } from "@/lib/db";
import { getWebhookDetails } from "@/lib/webhook-details";
import { addDays, pacificParts } from "@/lib/qotd";
import { getCalendarEvents } from "@/lib/calendar";
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
  const settings = (await sql`select webhook_url_encrypted, mention_role_id, live_channel_name, calendar_feed_url_encrypted from settings where singleton = true`)[0];
  const profile = await getWebhookDetails(settings?.webhook_url_encrypted as string | undefined);
  const destinations = session?.role === "admin" ? await webhookOptions() : [];
  const today = pacificParts().localDate;
  const calendarEvents = await getCalendarEvents(settings?.calendar_feed_url_encrypted as string | undefined, addDays(today, -31), addDays(today, 92)).catch(() => []);
  return <LiveFeed destinations={destinations} isAdmin={session?.role === "admin"} canRunScheduledBackup={Boolean(session)} roleId={session?.role === "admin" ? settings?.mention_role_id : null} botName={profile.status === "connected" ? profile.name : "Announcements"} channelName={settings?.live_channel_name || "Announcements"} avatarUrl={profile.status === "connected" ? profile.avatarUrl : null} calendarEvents={calendarEvents} calendarToday={today} />;
}
