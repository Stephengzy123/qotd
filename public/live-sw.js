/* Notification-only worker: deliberately no fetch handler or offline cache. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
// Persistent count shared across worker restarts; tags prevent duplicate pushes
// from incrementing the badge twice. No messages or admin pages are cached.
function updateUnread(tag, reset) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("live-announcements-badge", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("state");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction("state", "readwrite");
      const store = transaction.objectStore("state");
      let count = 0;
      const read = store.get("unread");
      read.onsuccess = () => {
        const state = read.result || { count: 0, tags: [] };
        count = reset ? 0 : state.count + (tag && state.tags.includes(tag) ? 0 : 1);
        store.put({ count, tags: tag ? [...state.tags.filter(value => value !== tag), tag].slice(-100) : state.tags }, "unread");
      };
      transaction.oncomplete = () => { db.close(); resolve(count); };
      transaction.onabort = () => { db.close(); reject(transaction.error); };
    };
  });
}
// Serialize badge changes so a read acknowledgement cannot race a new push.
let badgeWork = Promise.resolve();
function badge(tag, reset = false) {
  badgeWork = badgeWork.then(async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const reading = windows.some(client => new URL(client.url).pathname === "/live" && client.focused && client.visibilityState === "visible");
    const count = await updateUnread(tag, reset || reading);
    if (count && self.navigator.setAppBadge) await self.navigator.setAppBadge(count);
    else if (self.navigator.clearAppBadge) await self.navigator.clearAppBadge();
  }).catch(() => {}); // Unsupported badges must never prevent notifications.
  return badgeWork;
}
self.addEventListener("message", event => {
  if (event.data?.type === "LIVE_READ" && event.source?.url && new URL(event.source.url).origin === self.location.origin && new URL(event.source.url).pathname === "/live") {
    event.waitUntil(badge(null, true));
  }
});
self.addEventListener("push", event => {
  let data = {};
  try { data = event.data?.json() || {}; } catch {}
  event.waitUntil(Promise.all([badge(data.tag), self.registration.showNotification(data.title || "Announcements", {
    body: data.body || "A new announcement was sent.",
    icon: data.icon || "/live-icon-192.png",
    tag: data.tag || "announcement",
    data: { url: "/live" },
  })]));
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
