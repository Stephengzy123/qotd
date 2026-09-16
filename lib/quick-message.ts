import { removePings } from "@/lib/live-text";

export function quickMessage(body: string) {
  return removePings(body.trim());
}
