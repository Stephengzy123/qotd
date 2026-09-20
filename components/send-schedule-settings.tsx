"use client";

import { useState } from "react";
import type { SendScheduleMode } from "@/lib/qotd";

export function SendScheduleSettings({ initialMode = "auto", initialSendAt = "" }: { initialMode?: SendScheduleMode; initialSendAt?: string }) {
  const [mode, setMode] = useState<SendScheduleMode>(initialMode);
  return <fieldset className="send-schedule-settings">
    <legend>Automatic send</legend>
    <label className="schedule-choice"><input type="radio" name="sendScheduleMode" value="auto" checked={mode === "auto"} onChange={() => setMode("auto")} /> <span><strong>Automatic</strong><small>Use the normal calculated 6 PM Pacific schedule.</small></span></label>
    <label className="schedule-choice"><input type="radio" name="sendScheduleMode" value="exact" checked={mode === "exact"} onChange={() => setMode("exact")} /> <span><strong>Specific time</strong><small>Override the normal announcement date, days-early, and event rules.</small></span></label>
    {mode === "exact" && <label className="schedule-exact">Send at <input name="sendAt" type="datetime-local" defaultValue={initialSendAt} required /><small>Pacific time · Vercel runs it within the selected minute.</small></label>}
    <label className="schedule-choice"><input type="radio" name="sendScheduleMode" value="disabled" checked={mode === "disabled"} onChange={() => setMode("disabled")} /> <span><strong>Disabled</strong><small>Keep it approved, but do not send it automatically.</small></span></label>
  </fieldset>;
}
