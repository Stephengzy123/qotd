// Older rows can contain a JSON string instead of a JSON object. Decode those
// at read time so existing history stays intact without a data migration.
export function describeDetails(details: unknown): string {
  for (let depth = 0; depth < 3 && typeof details === "string"; depth += 1) {
    try { details = JSON.parse(details); }
    catch { return details as string; }
  }
  if (details === null || details === undefined) return "";
  if (typeof details !== "object" || Array.isArray(details)) {
    return typeof details === "string" ? details : JSON.stringify(details);
  }
  return Object.entries(details)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`)
    .join(" · ");
}
