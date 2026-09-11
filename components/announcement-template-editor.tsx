"use client";

import { useState } from "react";
import { DiscordMarkdown } from "@/components/discord-preview";

type TemplateEditorProps = {
  initialTemplate: string;
  defaultTemplate: string;
  fieldName: "announcementTemplate" | "eventTemplate";
  label: string;
  event?: boolean;
};

export function AnnouncementTemplateEditor({ initialTemplate, defaultTemplate, fieldName, label, event = false }: TemplateEditorProps) {
  const [template, setTemplate] = useState(initialTemplate);
  const [defaultRestored, setDefaultRestored] = useState(false);
  const preview = template
    .replaceAll("{date}", "September 11")
    .replaceAll("{title}", "Fall Festival")
    .replaceAll("{announcement}", "Your announcement will appear here.")
    .replaceAll("{mention-role}", "<@&123456789012345678>");

  return (
    <div className="template-grid">
      <div>
        <div className="field-heading">
          <label htmlFor={fieldName}>{label}</label>
          <button type="button" className="text-button" onClick={() => { setTemplate(defaultTemplate); setDefaultRestored(true); }}>Reset to default</button>
        </div>
        <textarea id={fieldName} name={fieldName} rows={8} maxLength={500} required value={template} onChange={(changeEvent) => { setTemplate(changeEvent.target.value); setDefaultRestored(false); }} />
        {defaultRestored && <p className="inline-feedback" role="status">Default restored. Save settings to apply it.</p>}
        <p className="hint token-help"><code>{"{announcement}"}</code> · {event && <><code>{"{title}"}</code> · </>}<code>{"{date}"}</code> · <code>{"{mention-role}"}</code></p>
      </div>
      <div>
        <span className="label">Preview</span>
        <div className="discord-preview"><DiscordMarkdown value={preview} /></div>
      </div>
    </div>
  );
}
