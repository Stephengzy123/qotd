"use client";

import { useActionState, useState } from "react";
import { saveTimetableAction } from "@/app/admin/timetable/actions";
import type { TimetableConfig, TimetablePeriod } from "@/lib/timetable";

const labels: Record<keyof TimetableConfig, string> = { monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday", thursday: "Thursday", friday: "Friday", flex: "Flex / XB day" };

export function TimetableEditor({ initial }: { initial: TimetableConfig }) {
  const [config, setConfig] = useState(initial);
  const [result, action, pending] = useActionState(saveTimetableAction, {});
  function update(template: keyof TimetableConfig, index: number, field: keyof TimetablePeriod, value: string) {
    setConfig((current) => ({ ...current, [template]: current[template].map((period, row) => row === index ? { ...period, [field]: value } : period) }));
  }
  function add(template: keyof TimetableConfig) {
    setConfig((current) => ({ ...current, [template]: [...current[template], { label: "New activity", start: "", end: "", kind: "activity" }] }));
  }
  function remove(template: keyof TimetableConfig, index: number) {
    setConfig((current) => ({ ...current, [template]: current[template].filter((_, row) => row !== index) }));
  }
  return <form action={action} className="timetable-editor">
    <input type="hidden" name="config" value={JSON.stringify(config)} />
    {(Object.keys(labels) as (keyof TimetableConfig)[]).map((template) => <section className="panel timetable-template" key={template}>
      <div className="section-title"><div><h2>{labels[template]}</h2><p className="hint">{template === "flex" ? "XB replaces the day's class schedule with these activities." : "Four class slots use the rotation's letter order. Activities do not consume a letter."} Enter rows in time order. All times are Vancouver time.</p></div><div className="row-buttons"><button type="button" className="secondary" disabled={pending} onClick={() => setConfig(current => ({ ...current, [template]: [...current[template]].sort((a, b) => a.start.localeCompare(b.start)) }))}>Sort by time</button><button type="button" className="secondary" disabled={pending || config[template].length >= 16} onClick={() => add(template)}>＋ Add period</button></div></div>
      <div className="timetable-rows"><div className="timetable-row timetable-head"><span>Period</span><span>Start</span><span>End</span><span>Type</span><span /></div>{config[template].map((period, index) => <div className="timetable-row" key={`${template}-${index}`}>
        <input disabled={pending} required aria-label={`${labels[template]} period ${index + 1} label`} value={period.label} onChange={(event) => update(template, index, "label", event.target.value)} maxLength={80} />
        <input disabled={pending} required aria-label={`${labels[template]} period ${index + 1} start time`} type="time" value={period.start} onChange={(event) => update(template, index, "start", event.target.value)} />
        <input disabled={pending} required aria-label={`${labels[template]} period ${index + 1} end time`} type="time" value={period.end} onChange={(event) => update(template, index, "end", event.target.value)} />
        <select disabled={pending} aria-label={`${labels[template]} period ${index + 1} type`} value={period.kind} onChange={(event) => update(template, index, "kind", event.target.value as TimetablePeriod["kind"])}>{template !== "flex" && <option value="class">Class slot</option>}<option value="activity">Activity / break</option></select>
        <button disabled={pending} type="button" className="text-button" onClick={() => remove(template, index)} aria-label={`Remove ${period.label}`}>Remove</button>
      </div>)}</div>
    </section>)}
    {result.error && <p role="alert" className="error-text">{result.error}</p>}
    {result.success && <p role="status">{result.success}</p>}
    <div className="settings-save"><p className="hint">Save the school-wide period templates.</p><button disabled={pending} className="primary" type="submit">{pending ? "Saving…" : "Save timetable"}</button></div>
  </form>;
}
