import { LiveFeed } from "@/components/live-feed";
import "./live.css";

export const metadata = { title: "Live announcements", description: "Announcements and events already sent by the bot." };
export default function LivePage() { return <LiveFeed />; }
