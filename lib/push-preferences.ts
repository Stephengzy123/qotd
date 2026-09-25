export const PUSH_CATEGORIES = ["announcement", "event", "reminder", "human"] as const;
export type PushCategory = (typeof PUSH_CATEGORIES)[number];
export type PushPreferences = Record<PushCategory, boolean>;

export const defaultPushPreferences = (): PushPreferences => ({ announcement: true, event: true, reminder: true, human: true });

export function normalizePushPreferences(input: unknown): PushPreferences {
  if (!input || typeof input !== "object" || Array.isArray(input)) return defaultPushPreferences();
  const value = input as Record<string, unknown>;
  return Object.fromEntries(PUSH_CATEGORIES.map(category => [category, typeof value[category] === "boolean" ? value[category] : true])) as PushPreferences;
}

export function validatePushPreferences(input: unknown): PushPreferences {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid notification preferences.");
  const value = input as Record<string, unknown>;
  if (PUSH_CATEGORIES.some(category => typeof value[category] !== "boolean")) throw new Error("Invalid notification preferences.");
  return normalizePushPreferences(input);
}

export function pushCategory(questionType: unknown, senderName: unknown): PushCategory {
  if (senderName) return "human";
  return questionType === "event" || questionType === "reminder" ? questionType : "announcement";
}
