// Only browser-operated push services may receive outbound requests.
export function validPushEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && !url.port && !url.username && !url.password && !url.hash &&
      (url.hostname === "fcm.googleapis.com" || url.hostname === "updates.push.services.mozilla.com" ||
        url.hostname === "web.push.apple.com" || url.hostname.endsWith(".notify.windows.com"));
  } catch { return false; }
}

export function parsePushSubscription(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const { endpoint, keys } = value as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (typeof endpoint !== "string" || endpoint.length > 2048 || !validPushEndpoint(endpoint) || !keys) return null;
  const { p256dh, auth } = keys;
  if (typeof p256dh !== "string" || !/^[A-Za-z0-9_-]{87}=?$/.test(p256dh) ||
      typeof auth !== "string" || !/^[A-Za-z0-9_-]{22}(?:==)?$/.test(auth)) return null;
  return { endpoint, keys: { p256dh, auth } };
}
