"use client";

import { useEffect, useState } from "react";
import { DiscordMarkdown } from "@/components/discord-preview";

function displayDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "selected date";
  return new Intl.DateTimeFormat("en-US", {
    month: "long", day: "numeric", timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

function applyCalendarToken(template: string, calendar: string) {
  return template.split("\n").flatMap((line) => {
    if (line.trim() === "{calendar}") return calendar ? [line.replace("{calendar}", calendar)] : [];
    return [line.replaceAll("{calendar}", calendar)];
  }).join("\n");
}

type AnnouncementPreviewProps = {
  type: "announcement" | "event" | "reminder";
  announcement: string;
  eventTitle: string;
  scheduledDate: string;
  announcementTemplate: string;
  eventTemplate: string;
};

export function AnnouncementPreview({ type, announcement, eventTitle, scheduledDate, announcementTemplate, eventTemplate }: AnnouncementPreviewProps) {
  const [calendar, setCalendar] = useState("");
  const [calendarStatus, setCalendarStatus] = useState<"idle" | "loading" | "ready" | "unavailable">("idle");
  const template = type !== "announcement" ? eventTemplate : announcementTemplate;
  const preview = applyCalendarToken(template, type === "announcement" ? calendar : "")
    .replaceAll("{date}", displayDate(scheduledDate))
    .replaceAll("{announcement}", announcement || "Your announcement will appear here.")
    .replaceAll("{title}", eventTitle || "Event title")
    .replaceAll("{mention-role}", "<@&123456789012345678>");

  useEffect(() => {
    if (type !== "announcement" || !/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) {
      setCalendar("");
      setCalendarStatus("idle");
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setCalendarStatus("loading");
      try {
        const response = await fetch(`/api/calendar-preview?date=${encodeURIComponent(scheduledDate)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Calendar preview failed");
        const result = await response.json() as { calendar?: string };
        setCalendar(result.calendar || "");
        setCalendarStatus("ready");
      } catch (error) {
        if (controller.signal.aborted) return;
        setCalendar("");
        setCalendarStatus("unavailable");
      }
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [scheduledDate, type]);

  return (
        <div>
          <span className="label">Preview</span>
          <div className="discord-preview"><DiscordMarkdown value={preview} /></div>
          {type === "announcement" && calendarStatus === "loading" && <p className="hint" role="status">Checking the calendar…</p>}
          {type === "announcement" && calendarStatus === "ready" && calendar && <p className="hint" role="status">Calendar information for this date is included above.</p>}
          {type === "announcement" && calendarStatus === "unavailable" && <p className="hint" role="status">Calendar preview is temporarily unavailable. Your submission still works.</p>}
          <p className="hint">The role shown here is a placeholder. The configured role is used when sent. Discord may show a confirmation before opening masked links.</p>
        </div>
  );
}
