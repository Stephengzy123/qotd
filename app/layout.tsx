import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "QoTD Handler",
  description: "Collect, review, and deliver your community’s question of the day.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
