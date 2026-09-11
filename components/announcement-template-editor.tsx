"use client";

import { useState } from "react";
import { DiscordMarkdown } from "@/components/discord-preview";

export function AnnouncementTemplateEditor({ initialTemplate, defaultTemplate }: { initialTemplate: string; defaultTemplate: string }) {
  const [template, setTemplate] = useState(initialTemplate);
  const [defaultRestored, setDefaultRestored] = useState(false);
  const preview = template
    .replaceAll("{date}", "September 11")
    .replaceAll("{announcement}", "Your announcement will appear here.")
    .replaceAll("{mention-role}", "<@&123456789012345678>");

  return (
    <div className="template-grid">
      <div>
        <div className="field-heading">
          <label htmlFor="template">Message format</label>
          <button type="button" className="text-button" onClick={() => { setTemplate(defaultTemplate); setDefaultRestored(true); }}>Reset to default</button>
        </div>
        <textarea id="template" name="template" rows={8} maxLength={500} required value={template} onChange={(event) => { setTemplate(event.target.value); setDefaultRestored(false); }} />
        {defaultRestored && <p className="inline-feedback" role="status">Default restored. Save settings to apply it.</p>}
        <p className="hint token-help"><code>{"{date}"}</code> · <code>{"{announcement}"}</code> · <code>{"{mention-role}"}</code></p>
      </div>
      <div>
        <span className="label">Preview</span>
        <div className="discord-preview"><DiscordMarkdown value={preview} /></div>
      </div>
    </div>
  );
}
