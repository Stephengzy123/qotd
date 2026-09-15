/* Notification-only worker: deliberately no fetch handler or offline cache. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("push", event => {
  let data = {};
  try { data = event.data?.json() || {}; } catch {}
  event.waitUntil(self.registration.showNotification(data.title || "Announcements", {
    body: data.body || "A new announcement was sent.",
    icon: data.icon || undefined,
    tag: data.tag || "announcement",
    data: { url: "/live" },
  }));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const live = windows.find(client => new URL(client.url).origin === self.location.origin && new URL(client.url).pathname === "/live");
    if (live) return live.focus();
    return self.clients.openWindow("/live");
  })());
});
