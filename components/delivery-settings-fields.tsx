"use client";
import { useState } from "react";
import { WebhookPicker } from "@/components/webhook-picker";
import type { WebhookOption } from "@/lib/webhook-destinations";

export type DeliveryFieldsProps = { destinations: WebhookOption[]; initialDestination?: "discord" | "live"; initialRemovePings?: boolean; selected?: string[] };
export function DeliverySettingsFields({ destinations, initialDestination = "discord", initialRemovePings = false, selected }: DeliveryFieldsProps) {
  const [destination, setDestination] = useState(initialDestination);
  const [removePings, setRemovePings] = useState(initialRemovePings);
  return <div className="delivery-settings-fields">
    <label>Send to<select name="destination" value={destination} onChange={event => setDestination(event.target.value as "discord" | "live")}><option value="discord">Discord + /live</option><option value="live">/live only</option></select></label>
    <div hidden={destination === "live"}><WebhookPicker options={destinations} selected={selected} /></div>
    <label className="checkbox-label"><input type="checkbox" name="removePings" checked={removePings} onChange={event => setRemovePings(event.target.checked)} /> Remove all pings</label>
    {destination === "live" && <p className="hint">Pings are always removed on /live. Your Discord choices are kept for later.</p>}
  </div>;
}
