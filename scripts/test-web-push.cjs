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
const self = {
  addEventListener: (name, callback) => { handlers[name] = callback; },
  registration: { showNotification: async (...args) => shown.push(args) },
  location: { origin: 'https://example.test' },
  clients: { matchAll: async () => clients, openWindow: async url => { opened = url; } },
};
vm.runInNewContext(fs.readFileSync(path.join(root, 'public/live-sw.js'), 'utf8'), { self, URL });
(async () => {
  let pending;
  handlers.push({ data: { json: () => ({ title: 'Bot', body: 'New message', tag: 'announcement-1' }) }, waitUntil: promise => { pending = promise; } });
  await pending;
  assert.equal(shown[0][0], 'Bot');
  assert.equal(shown[0][1].body, 'New message');
  const click = () => handlers.notificationclick({ notification: { close() {} }, waitUntil: promise => { pending = promise; } });
  click(); await pending; assert.equal(opened, '/live');
  clients = [{ url: 'https://example.test/live', focus: async () => { focused = true; } }];
  opened = null; click(); await pending;
  assert.equal(focused, true); assert.equal(opened, null);
  assert.equal(handlers.fetch, undefined);
  console.log('Push endpoint validation and notification-worker checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
