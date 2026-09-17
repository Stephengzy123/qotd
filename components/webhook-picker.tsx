import type { WebhookOption } from "@/lib/webhook-destinations";

export function WebhookPicker({ options, selected = ["primary", "club-default"], disabled = false }: { options: WebhookOption[]; selected?: string[]; disabled?: boolean }) {
  return <fieldset disabled={disabled} className="webhook-picker"><legend>Discord destinations</legend>
    <input type="hidden" name="webhookSelection" value="1" />
    {options.map(option => <label key={option.id}><input type="checkbox" name="webhookIds" value={option.id} defaultChecked={selected.includes(option.id)} /> {option.name}</label>)}
    {!options.length && <p className="hint">No Discord destinations assigned.</p>}
    <small>Choose up to 10 destinations for this post.</small>
  </fieldset>;
}
