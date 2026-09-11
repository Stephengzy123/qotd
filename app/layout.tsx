import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Announcement Handler",
  description: "Collect, review, and schedule Discord announcements.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
