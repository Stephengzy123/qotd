import type { Metadata } from "next";
import { PublicTimetablePage } from "@/components/public-timetable-page";
import "../live.css";

export const metadata: Metadata = { title: "My Timetable | Live Announcements" };

export default function TimetablePage() { return <PublicTimetablePage />; }
