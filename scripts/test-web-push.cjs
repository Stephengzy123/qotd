const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'lib/push-validation.ts'), 'utf8');
const moduleObject = { exports: {} };
new Function('exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(moduleObject.exports);
const { validPushEndpoint, parsePushSubscription } = moduleObject.exports;
for (const endpoint of ['https://fcm.googleapis.com/fcm/send/example', 'https://updates.push.services.mozilla.com/wpush/v2/example', 'https://web.push.apple.com/example', 'https://wns2.notify.windows.com/example']) assert.equal(validPushEndpoint(endpoint), true);
for (const endpoint of ['http://fcm.googleapis.com/x', 'https://localhost/x', 'https://127.0.0.1/x', 'https://fcm.googleapis.com.evil.test/x', 'https://user:pass@fcm.googleapis.com/x', 'https://fcm.googleapis.com:8443/x']) assert.equal(validPushEndpoint(endpoint), false);
assert.ok(parsePushSubscription({ endpoint: 'https://fcm.googleapis.com/example', keys: { p256dh: 'A'.repeat(87), auth: 'A'.repeat(22) } }));
for (const value of [null, {}, { endpoint: 'https://fcm.googleapis.com/x', keys: { auth: 'bad', p256dh: 'bad' } }]) assert.equal(parsePushSubscription(value), null);

const handlers = {};
const shown = [];
let opened = null, focused = false, clients = [];
let badgeCount = 0, savedState;
// Minimal asynchronous IndexedDB double for this worker's single record.
const indexedDB = { open() {
  const request = {};
  queueMicrotask(() => {
    request.result = { close() {}, transaction() {
      const tx = {};
      tx.objectStore = () => ({
        get() {
          const read = {};
          queueMicrotask(() => { read.result = savedState; read.onsuccess(); queueMicrotask(() => tx.oncomplete()); });
          return read;
        },
        put(value) { savedState = structuredClone(value); },
      });
      return tx;
    } };
    request.onsuccess();
  });
  return request;
} };
const self = {
  addEventListener: (name, callback) => { handlers[name] = callback; },
  registration: { showNotification: async (...args) => shown.push(args) },
  location: { origin: 'https://example.test' },
  navigator: { setAppBadge: async count => { badgeCount = count; }, clearAppBadge: async () => { badgeCount = 0; } },
  clients: { matchAll: async () => clients, openWindow: async url => { opened = url; } },
};
vm.runInNewContext(fs.readFileSync(path.join(root, 'public/live-sw.js'), 'utf8'), { self, URL, indexedDB });
(async () => {
  let pending;
  handlers.push({ data: { json: () => ({ title: 'Bot', body: 'New message', tag: 'announcement-1' }) }, waitUntil: promise => { pending = promise; } });
  await pending;
  assert.equal(shown[0][0], 'Bot');
  assert.equal(shown[0][1].body, 'New message');
  assert.equal(badgeCount, 1);
  const push = tag => handlers.push({ data: { json: () => ({ tag }) }, waitUntil: promise => { pending = promise; } });
  push('announcement-1'); await pending; assert.equal(badgeCount, 1);
  push('announcement-2'); await pending; assert.equal(badgeCount, 2);
  handlers.message({ data: { type: 'LIVE_READ' }, source: { url: 'https://example.test/live' }, waitUntil: promise => { pending = promise; } });
  await pending; assert.equal(badgeCount, 0);
  const click = () => handlers.notificationclick({ notification: { close() {} }, waitUntil: promise => { pending = promise; } });
  click(); await pending; assert.equal(opened, '/live');
  clients = [{ url: 'https://example.test/live', focus: async () => { focused = true; } }];
  opened = null; click(); await pending;
  assert.equal(focused, true); assert.equal(opened, null);
  clients[0].focused = true; clients[0].visibilityState = 'visible';
  push('announcement-3'); await pending; assert.equal(badgeCount, 0);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/live.webmanifest'), 'utf8'));
  assert.equal(manifest.start_url, '/live'); assert.equal(manifest.scope, '/live'); assert.equal(manifest.display, 'standalone');
  for (const icon of manifest.icons) {
    const png = fs.readFileSync(path.join(root, 'public', icon.src));
    const [width, height] = icon.sizes.split('x').map(Number);
    assert.equal(png.readUInt32BE(16), width); assert.equal(png.readUInt32BE(20), height);
  }
  assert.equal(handlers.fetch, undefined);
  console.log('Push validation, worker, badge counting/reset/deduplication, manifest, and icon checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
