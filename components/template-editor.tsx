"use client";

import { useState } from "react";

export function TemplateEditor({ initialValue }: { initialValue: string }) {
  const [value, setValue] = useState(initialValue);
  const preview = value
    .replaceAll("{date}", "Tuesday, September 9, 2026")
    .replaceAll("{question}", "What small habit has made your life noticeably better?")
    .replaceAll("{number}", "42");

  return (
    <div className="template-grid">
      <div>
        <label htmlFor="template">Message format</label>
        <textarea id="template" name="template" rows={7} maxLength={1800} required value={value} onChange={(event) => setValue(event.target.value)} />
        <p className="hint">Use <code>{"{question}"}</code>, <code>{"{date}"}</code>, and <code>{"{number}"}</code>. Discord markdown is supported.</p>
      </div>
      <div>
        <span className="label">Preview</span>
        <div className="discord-preview">
          <p>{preview || "Your message preview will appear here."}</p>
        </div>
      </div>
    </div>
  );
}
