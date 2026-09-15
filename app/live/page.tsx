import { LiveFeed } from "@/components/live-feed";
import { getSession } from "@/lib/auth";
import { dbReady } from "@/lib/db";
import { getWebhookDetails } from "@/lib/webhook-details";
import "./live.css";

export const metadata = { title: "Live announcements" };
export default async function LivePage() {
  const session = await getSession();
  const sql = await dbReady();
  const settings = (await sql`select webhook_url_encrypted from settings where singleton = true`)[0];
  const profile = await getWebhookDetails(settings?.webhook_url_encrypted as string | undefined);
  return <LiveFeed isAdmin={session?.role === "admin"} botName={profile.status === "connected" ? profile.name : "Announcements"} avatarUrl={profile.status === "connected" ? profile.avatarUrl : null} />;
}
