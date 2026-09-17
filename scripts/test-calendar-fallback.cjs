const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(file, deps) {
  const out = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', code)(name => {
    if (!(name in deps)) throw new Error(`Unexpected dependency: ${name}`);
    return deps[name];
  }, out.exports);
  return out.exports;
}
const text = load('lib/live-text.ts', {});
const qotd = load('lib/qotd.ts', {
  '@/lib/webhook-destinations': {}, '@/lib/log': {}, '@/lib/live-text': text, '@/lib/db': {}, '@/lib/security': {}, '@/lib/calendar': {},
});
async function fallbackCase({ existing = false, feed = true, titles = ['A B C D', 'Assembly'], race = false, outage = false } = {}) {
  const inserts = [], dates = [];
  const sql = async (parts, ...values) => {
    const query = parts.join('?');
    if (query.includes('union all')) {
      assert.match(query, /status in \('approved', 'sent'\)/);
      assert.match(query, /question_type = 'announcement'/);
      return existing ? [{ id: 'existing' }] : [];
    }
    if (query.includes('from settings')) return [{ calendar_feed_url_encrypted: feed ? 'encrypted' : null }];
    if (query.includes('insert into dispatches')) {
      assert.match(query, /where not exists/);
      assert.match(query, /on conflict \(calendar_fallback_date\) do nothing/);
      assert.match(query, /'announcement', 'live'/);
      inserts.push(values);
      return race ? [] : [{ id: 'fallback' }];
    }
    throw new Error(query);
  };
  const mod = load('lib/calendar-fallback.ts', {
    'server-only': {}, '@/lib/db': { dbReady: async () => sql }, '@/lib/qotd': qotd,
    '@/lib/live-text': text, '@/lib/calendar': {
      calendarHeading: titles => titles.map(x => `## ${x}`).join('\n'),
      getCalendarByDate: async (_, date) => { dates.push(date); if (outage) throw new Error('offline'); return titles; },
    },
  });
  const result = await mod.sendCalendarFallback('2026-09-18', '2026-09-17');
  return { result, inserts, dates };
}
async function run(now, { trigger = 'cron', fails = false } = {}) {
  const calls = [], pushes = [];
  const mod = load('lib/scheduled-delivery.ts', {
    'server-only': {}, '@/lib/db': { dbReady: async () => async () => [] },
    '@/lib/qotd': qotd, '@/lib/log': { logEvent: async () => {}, errorDetail: String },
    '@/lib/web-push': { scheduleLivePush: id => pushes.push(id) },
    '@/lib/calendar-fallback': { sendCalendarFallback: async (...args) => { calls.push(args); if (fails) throw new Error('offline'); return { dispatchId: 'fallback' }; } },
  });
  return { result: await mod.sendDueAnnouncements(new Date(now), trigger), calls, pushes };
}
(async () => {
  const normal = await fallbackCase();
  assert.equal(normal.result.dispatchId, 'fallback');
  assert.equal(normal.inserts[0][1], '# <:sgs:1372767087612657724> Block Rotation for September 18\n\n## A B C D\n## Assembly');
  assert.deepEqual(normal.dates, ['2026-09-18']);
  for (const options of [{ existing: true }, { feed: false }, { titles: [] }, { race: true }]) {
    assert.equal((await fallbackCase(options)).result, null);
  }
  await assert.rejects(() => fallbackCase({ outage: true }), /offline/);
  assert.ok(!(await fallbackCase({ titles: ['Assembly @everyone <@&123>'] })).inserts[0][1].includes('@'));
  const summer = await run('2026-09-18T01:30:00Z');
  assert.deepEqual(summer.calls, [['2026-09-18', '2026-09-17']]);
  assert.deepEqual(summer.pushes, ['fallback']);
  const winter = await run('2026-12-02T02:30:00Z', { trigger: 'page_load' });
  assert.deepEqual(winter.calls, [['2026-12-02', '2026-12-01']]);
  assert.equal((await run('2026-09-18T02:00:00Z')).calls.length, 0);
  assert.equal((await run('2026-09-18T01:30:00Z', { fails: true })).result.success, false);
  console.log('Calendar fallback checks passed: formatting, suppression, no events/feed, duplicate claim, no pings, failures, Pacific window, page-load fallback.');
})().catch(error => { console.error(error); process.exitCode = 1; });
