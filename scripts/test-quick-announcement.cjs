const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.join(__dirname, '..');
function load(file, dependencies, fetch) {
  const output = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', 'fetch', code)(name => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
    return dependencies[name];
  }, output, fetch);
  return output;
}
const text = load('lib/live-text.ts', {});
const formatter = load('lib/quick-message.ts', { '@/lib/live-text': text });
const role = '123456789012345';
assert.equal(formatter.quickMessage('**Hello**'), '**Hello**');
assert.equal(formatter.quickMessage(`Hi <@&${role}>`), 'Hi');
assert.equal(formatter.quickMessage('Hello <@123> @everyone'), 'Hello');

async function harness({ admin = true, destination = 'discord', ping = true, fail = false, nickname = 'Test Admin', body = '# Quick message' } = {}) {
  const stored = new Map(), requests = [], notifications = [], writes = [];
  const sql = async (parts, ...values) => {
    const query = parts.join('?');
    if (query.includes('from settings')) return [{ webhook_url_encrypted: 'encrypted', mention_role_id: role }];
    if (query.includes('insert into dispatches')) {
      if (stored.has(values[0])) return [];
      stored.set(values[0], values); writes.push(values); return [{ id: values[0] }];
    }
    if (query.includes('update dispatches')) { writes.push(values); return []; }
    throw new Error(`Unexpected SQL: ${query}`);
  };
  const action = load('app/admin/quick-action.ts', {
    '@/lib/auth': { requireRole: async required => { assert.equal(required, 'admin'); if (!admin) throw new Error('Forbidden'); return { username: 'admin', role: 'admin' }; } },
    '@/lib/db': { dbReady: async () => sql },
    '@/lib/security': { decryptSecret: () => 'https://discord.com/api/webhooks/123/token', validateDiscordWebhook: () => true },
    '@/lib/webhook-details': { getWebhookDetails: async () => ({ status: 'connected', avatarUrl: 'https://cdn.discordapp.com/avatar.png' }) },
    '@/lib/quick-message': formatter,
    '@/lib/web-push': { scheduleLivePush: id => notifications.push(id) },
    '@/lib/log': { logEvent: async () => {} },
    'next/cache': { revalidatePath: () => {} },
  }, async (url, options) => { requests.push({ url: String(url), ...JSON.parse(options.body) }); return { ok: !fail, status: fail ? 400 : 200 }; }).quickAnnounceAction;
  const form = new FormData();
  Object.entries({ nickname, message: body, destination, requestId: '00000000-0000-4000-8000-000000000001', ...(ping ? { ping: 'on' } : {}) }).forEach(([key, value]) => form.set(key, value));
  return { action, form, requests, notifications, writes };
}
(async () => {
  const normal = await harness();
  assert.ok((await normal.action({}, normal.form)).success);
  assert.equal(normal.requests[0].username, 'Test Admin');
  assert.equal(normal.requests[0].content, '# Quick message');
  assert.ok(normal.requests[0].url.endsWith('wait=true'));
  assert.deepEqual(normal.requests[0].allowed_mentions.parse, []);
  assert.deepEqual(normal.requests[0].allowed_mentions.roles, []);
  assert.equal(normal.notifications.length, 1);
  assert.ok((await normal.action({}, normal.form)).error);
  assert.equal(normal.requests.length, 1);
  const quiet = await harness({ ping: true, body: 'Hello @everyone <@123>' });
  await quiet.action({}, quiet.form);
  assert.equal(quiet.requests[0].content, 'Hello');
  assert.deepEqual(quiet.requests[0].allowed_mentions.parse, []);
  const live = await harness({ destination: 'live' });
  assert.ok((await live.action({}, live.form)).success);
  assert.equal(live.requests.length, 0); assert.equal(live.notifications.length, 1);
  const defaults = await harness(); defaults.form.delete('destination');
  assert.ok((await defaults.action({}, defaults.form)).success);
  assert.equal(defaults.requests.length, 0);
  const failed = await harness({ fail: true });
  assert.ok((await failed.action({}, failed.form)).error);
  assert.equal(failed.notifications.length, 0);
  const unauthorised = await harness({ admin: false });
  await assert.rejects(unauthorised.action({}, unauthorised.form), /Forbidden/);
  assert.equal(unauthorised.writes.length, 0); assert.equal(unauthorised.requests.length, 0);
  for (const input of [{ nickname: '' }, { body: '' }, { body: 'x'.repeat(2001) }, { destination: 'invalid' }]) {
    const invalid = await harness(input); assert.ok((await invalid.action({}, invalid.form)).error); assert.equal(invalid.requests.length, 0);
  }
  console.log('Quick announcement checks passed: admin authorization, nickname, raw Markdown, pings, length, live-only, failed sends, duplicate prevention.');
})().catch(error => { console.error(error); process.exitCode = 1; });
