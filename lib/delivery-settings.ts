import { resolveWebhooks } from "@/lib/webhook-destinations";
import { parsePacificDateTime, type SendScheduleMode } from "@/lib/qotd";

export async function readDeliverySettings(form: FormData) {
  const destination = String(form.get("destination") || "discord");
  if (destination !== "discord" && destination !== "live") throw new Error("Choose a valid send destination.");
  const removePings = form.get("removePings") === "on";
  const webhookIds = [...new Set(form.getAll("webhookIds").map(String))];
  if (destination === "discord") await resolveWebhooks(webhookIds);
  if (webhookIds.length > 10 || webhookIds.some(id => id !== "primary" && !/^[0-9a-f-]{36}$/i.test(id))) throw new Error("Choose valid Discord destinations (maximum 10).");
  return { destination, removePings, webhookIds };
}

export function readSendScheduleSettings(form: FormData) {
  const mode = String(form.get("sendScheduleMode") || "auto") as SendScheduleMode;
  if (mode !== "auto" && mode !== "disabled" && mode !== "exact") throw new Error("Choose a valid automatic-send setting.");
  if (mode !== "exact") return { mode, sendAt: null as Date | null };
  const sendAt = parsePacificDateTime(String(form.get("sendAt") || ""));
  if (!sendAt) throw new Error("Choose a valid future Pacific date and time. Times during the daylight-saving changeover are unavailable.");
  if (sendAt.getTime() <= Date.now()) throw new Error("Choose a Pacific date and time in the future.");
  return { mode, sendAt };
}
