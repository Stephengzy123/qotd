const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.join(__dirname, '..');
function load(file, dependencies, fetch) {
  const out = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', 'fetch', code)(name => {
    if (!(name in dependencies)) throw new Error(`Unexpected import ${name}`);
    return dependencies[name];
  }, out.exports, fetch);
  return out.exports;
}
const text = load('lib/live-text.ts', {});
assert.equal(text.removePings('# News\n<@123> <@!456> <@&789> @everyone @here\n-# <@&789>'), '# News');
assert.equal(text.removePings('Email x@here.com and **bold**'), 'Email x@here.com and **bold**');
async function scenario(options, webhook, responseOk = true, claimed = true, saved = {}) {
  const queries = [], requests = [];
  const sql = async (parts, ...values) => {
    const query = parts.join('?'); queries.push({ query, values });
    if (query.includes('select id, question')) return [{ id: 'item', question: 'Hello <@123> @everyone', scheduled_date: '2026-09-20', question_type: 'announcement', ...saved }];
    if (query.includes('from settings')) return [{ webhook_url_encrypted: webhook, mention_role_id: webhook ? '123456789012345' : null, message_template: '# News\n{announcement}\n-# {mention-role}' }];
    if (query.includes("update questions set status = 'sent'")) return claimed ? [{ id: 'item' }] : [];
    if (query.includes('insert into dispatches')) return [{ id: 'dispatch' }];
    return [];
  };
  sql.begin = callback => callback(sql);
  const mod = load('lib/qotd.ts', {
    '@/lib/webhook-destinations': {
      resolveWebhooks: async () => { if (!webhook) throw new Error('Set a Discord webhook before sending.'); return [{ id: 'primary', name: 'Primary' }]; },
      deliverWebhooks: async (_, payload) => { requests.push(payload); return [{ name: 'Primary', success: responseOk, status: responseOk ? 204 : 500, error: responseOk ? null : 'Discord returned HTTP 500.' }]; },
    },
    '@/lib/live-text': text,
    '@/lib/log': { logEvent: async () => {}, errorDetail: String },
    '@/lib/db': { dbReady: async () => sql },
    '@/lib/security': { decryptSecret: value => value },
    '@/lib/calendar': { calendarHeading: () => '', getCalendarByDate: async () => [] },
  }, async (url, request) => { requests.push(JSON.parse(request.body)); return { ok: responseOk, status: responseOk ? 204 : 500 }; });
  const result = await mod.sendAnnouncement('item', 'manual_selected', undefined, 'admin', options);
  return { result, queries, requests };
}
(async () => {
  const live = await scenario({ destination: 'live' }, null);
  assert.equal(live.result.success, true);
  assert.equal(live.requests.length, 0);
  assert.equal(live.result.message.includes('@'), false);
  assert.ok(live.queries.some(x => x.query.includes('sent_at = now()')));
  const savedLive = await scenario({}, null, true, true, { delivery_destination: 'live' });
  assert.equal(savedLive.result.success, true);
  assert.equal(savedLive.requests.length, 0);
  const savedQuiet = await scenario({}, 'https://discord.test', true, true, { remove_pings: true });
  assert.equal(savedQuiet.requests[0].content.includes('@'), false);
  const override = await scenario({ removePings: false }, 'https://discord.test', true, true, { remove_pings: true });
  assert.equal(override.requests[0].allowed_mentions.roles.length, 1);
  const quiet = await scenario({ removePings: true }, 'https://discord.test');
  assert.equal(quiet.requests.length, 1);
  assert.deepEqual(quiet.requests[0].allowed_mentions.roles, []);
  assert.equal(quiet.requests[0].content.includes('@'), false);
  const normal = await scenario({}, 'https://discord.test');
  assert.equal(normal.requests[0].allowed_mentions.roles.length, 1);
  const failed = await scenario({}, 'https://discord.test', false);
  assert.ok(failed.result.error);
  assert.ok(failed.queries.some(x => x.query.includes("status = 'approved'")));
  const duplicate = await scenario({ destination: 'live' }, null, true, false);
  assert.ok(duplicate.result.error);
  assert.equal(duplicate.queries.some(x => x.query.includes('insert into dispatches')), false);
  const missing = await scenario({}, null);
  assert.ok(missing.result.error);
  console.log('Send-option checks passed: live-only, no-ping, normal, failed, duplicate, missing webhook, mention cleanup.');
})().catch(error => { console.error(error); process.exitCode = 1; });
