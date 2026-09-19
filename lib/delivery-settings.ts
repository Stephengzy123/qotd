import { resolveWebhooks } from "@/lib/webhook-destinations";

export async function readDeliverySettings(form: FormData) {
  const destination = String(form.get("destination") || "discord");
  if (destination !== "discord" && destination !== "live") throw new Error("Choose a valid send destination.");
  const removePings = form.get("removePings") === "on";
  const webhookIds = [...new Set(form.getAll("webhookIds").map(String))];
  if (destination === "discord") await resolveWebhooks(webhookIds);
  if (webhookIds.length > 10 || webhookIds.some(id => id !== "primary" && !/^[0-9a-f-]{36}$/i.test(id))) throw new Error("Choose valid Discord destinations (maximum 10).");
  return { destination, removePings, webhookIds };
}
