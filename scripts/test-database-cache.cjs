const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file, deps, DateType = Date) {
  const exports = {};
  new Function('require', 'exports', 'Date', ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText)(name => {
    if (name === 'server-only') return {};
    if (name === 'node:crypto') return require(name);
    if (!(name in deps)) throw Error(`Unexpected import ${name}`);
    return deps[name];
  }, exports, DateType);
  return exports;
}

(async () => {
  const originalEnv = { ...process.env };
  process.env.UPSTASH_REDIS_REST_URL = 'https://cache.example';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test';
  let now = 1000, redisDown = false, reads = 0;
  class Clock extends Date { static now() { return now; } }
  const values = new Map();
  class Redis {
    async get(key) { if (redisDown) throw Error('Redis down'); return structuredClone(values.get(key) ?? null); }
    async set(key, value, options) {
      if (redisDown) throw Error('Redis down');
      if (options?.nx && values.has(key)) return null;
      values.set(key, structuredClone(value)); return 'OK';
    }
    multi() {
      const commands = [];
      const batch = {
        set: (key, value) => { commands.push([key, value]); return batch; },
        exec: async () => {
          if (redisDown) throw Error('Redis down');
          for (const [key, value] of commands) values.set(key, structuredClone(value));
          return commands.map(() => 'OK');
        },
      };
      return batch;
    }
  }
  try {
    const cache = load('lib/shared-cache.ts', { '@upstash/redis': { Redis } }, Clock);
    const source = async () => { reads++; return { messages: ['visible'] }; };
    assert.deepEqual(await cache.cachedRead('feed', source), { messages: ['visible'] });
    await cache.cachedRead('feed', source);
    assert.equal(reads, 1, 'Repeated polls must not query the source');
    await cache.invalidateSharedCache('public');
    await cache.cachedRead('feed', source);
    assert.equal(reads, 2);

    // A loader already in flight cannot publish stale data into a new revision.
    let finish;
    const inFlight = cache.cachedRead('racing', () => new Promise(resolve => { finish = resolve; }));
    while (!finish) await new Promise(resolve => setImmediate(resolve));
    await cache.invalidateSharedCache('public');
    finish('old'); await inFlight;
    assert.equal(await cache.cachedRead('racing', async () => 'new'), 'new');
    await cache.cachedRead('privacy', async () => 'previously visible');
    await cache.invalidateSharedCache('public');
    await assert.rejects(cache.cachedRead('privacy', async () => { throw Error('Source down'); }), /Source down/, 'Invalidated content must not be resurrected from a previous revision during an outage');

    await cache.cachedRead('outage', source, 1);
    now += 2000;
    let failures = 0;
    const offline = async () => { failures++; throw Error('DB exhausted'); };
    assert.deepEqual(await cache.cachedRead('outage', offline, 1), { messages: ['visible'] });
    await cache.cachedRead('outage', offline, 1);
    assert.equal(failures, 1, 'Outage polling must back off before trying the DB again');
    await assert.rejects(cache.cachedRead('cold-outage', offline), /DB exhausted/);
    await assert.rejects(cache.cachedRead('cold-outage', offline), /temporarily unavailable/);
    assert.equal(failures, 2, 'A failed cold load also backs off');

    const hint = await cache.readScheduleHint();
    await cache.writeScheduleHint(hint.revision, 12345);
    assert.equal((await cache.readScheduleHint()).nextCheckAt, 12345);
    await cache.invalidateSharedCache('schedule');
    assert.equal((await cache.readScheduleHint()).nextCheckAt, null, 'Editing a schedule expires the old wake time');
    await cache.writeScheduleHint(hint.revision, 99999);
    assert.equal((await cache.readScheduleHint()).nextCheckAt, null, 'A stale cron run cannot overwrite a newly edited schedule');
    await cache.prepareScheduleChange();
    assert.equal((await cache.readScheduleHint()).revision, null, 'A cron racing an edit must not store the pre-edit schedule');
    for (const key of values.keys()) if (key.endsWith('schedule:editing')) values.delete(key);
    assert.equal((await cache.readScheduleHint()).nextCheckAt, null);

    redisDown = true;
    assert.equal(await cache.cachedRead('redis-down', async () => 'DB fallback'), 'DB fallback');
    assert.equal((await cache.readScheduleHint()).revision, null);
    await assert.rejects(cache.prepareScheduleChange(), /scheduling cache is unavailable/);
    redisDown = false;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.KV_REST_API_TOKEN;
    assert.equal(await cache.cachedRead('no-redis', async () => 'direct'), 'direct');
  } finally { process.env = originalEnv; }

  const recorded = [];
  const clock = load('lib/delivery-clock.ts', {
    '@/lib/db': { dbReady: async () => async () => [{ next_exact: new Date('2026-09-24T23:05:00Z') }] },
    '@/lib/shared-cache': { writeScheduleHint: async (...args) => recorded.push(args) },
  });
  assert.equal(new Date(clock.nextPacificDelivery(new Date('2026-03-08T00:00:00Z'))).toISOString(), '2026-03-08T02:00:00.000Z');
  assert.equal(new Date(clock.nextPacificDelivery(new Date('2026-03-08T10:00:00Z'))).toISOString(), '2026-03-09T01:00:00.000Z');
  assert.equal(new Date(clock.nextPacificDelivery(new Date('2026-11-01T08:00:00Z'))).toISOString(), '2026-11-02T02:00:00.000Z');
  assert.equal(new Date(clock.nextPacificDelivery(new Date('2026-11-01T08:00:00Z'), 6)).toISOString(), '2026-11-01T14:00:00.000Z');
  await clock.rememberNextDelivery('r1', new Date('2026-09-24T20:00:00Z'));
  assert.equal(new Date(recorded.at(-1)[1]).toISOString(), '2026-09-24T23:05:00.000Z', 'Exact sends wake before the next default send');

  const order = [];
  const revalidation = load('lib/revalidate.ts', {
    'next/cache': { revalidatePath: () => { order.push('path'); } },
    '@/lib/shared-cache': { invalidateSharedCache: async (...scopes) => { assert.deepEqual(scopes, ['public', 'schedule']); order.push('cache'); } },
  });
  await revalidation.revalidatePath('/admin', 'layout');
  assert.deepEqual(order, ['cache', 'path'], 'Mutation invalidation must finish before the redirect/page refresh');

  let importCalls = 0;
  const calendar = load('lib/admin-calendar.ts', {
    '@/lib/shared-cache': { cachedRead: (_name, loader) => loader() },
    '@/lib/calendar': { getCalendarEvents: async (_secret, from) => {
      importCalls++;
      return Array.from({ length: 20 }, (_, i) => ({ date: from, title: `Rotation ${i}` }));
    } },
    '@/lib/db': { dbReady: async () => async (parts, ...values) => {
      const text = parts.join('?');
      if (text.includes('from settings')) return [{ calendar_feed_url_encrypted: 'never-return-this-secret' }];
      if (text.includes('select id, event_title, question')) throw Error('Public calendar must not query admin backfill records');
      if (text.includes('from questions')) {
        assert.equal(values[0], true, 'Public details query must enforce the sent/visible projection');
        return [{ id: 'approved', occurrence_date: '2026-09-23', title: 'Upcoming event', details: '', status: 'approved', scheduled_date: '2026-09-22' }];
      }
      return [];
    } },
  });
  const calendarRows = await calendar.loadPublicCalendar('2025-08-01', '2028-07-31', true);
  assert.equal(importCalls, 36);
  assert.equal(calendarRows.filter(row => row.kind === 'imported').length, 720, 'Multi-year exports must not truncate at 500 rotations');
  assert.equal(calendarRows.find(row => row.kind === 'announcement').details, '');
  assert.ok(calendarRows.every(row => !('meta' in row)));
  assert.ok(!JSON.stringify(calendarRows).includes('never-return-this-secret'));

  let deliveries = 0, menuChecks = 0, updates = 0;
  let nextCheckAt = Date.now() + 3600_000;
  let deliveryFails = false;
  const cooldowns = [];
  const cron = load('app/api/cron/daily/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
    '@/lib/shared-cache': {
      readScheduleHint: async () => ({ revision: 'r1', nextCheckAt }),
      invalidateSharedCache: async () => {},
      writeScheduleHint: async (...args) => cooldowns.push(args),
    },
    '@/lib/delivery-clock': { rememberNextDelivery: async () => { updates++; } },
    '@/lib/scheduled-delivery': { sendDueAnnouncements: async () => { deliveries++; if (deliveryFails) throw Error('DB down'); return { success: true, sent: 0, failures: [] }; } },
    '@/lib/lunch-menu': { syncLunchMenus: async () => { menuChecks++; return { skipped: true, changed: 0 }; } },
    '@/lib/log': { logEvent: async () => {} },
  });
  const previousSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'test-cron';
  const request = { headers: new Headers({ authorization: 'Bearer test-cron' }), nextUrl: { pathname: '/api/cron/daily' } };
  try {
    assert.equal((await cron.GET(request)).status, 200);
    assert.equal(deliveries, 0, 'A future wake time must skip every DB-backed operation');
    assert.equal(menuChecks, 0);
    nextCheckAt = Date.now() - 1;
    assert.equal((await cron.GET(request)).status, 200);
    assert.equal(deliveries, 1); assert.equal(menuChecks, 1); assert.equal(updates, 1);
    deliveryFails = true;
    assert.equal((await cron.GET(request)).status, 503);
    assert.ok(cooldowns.at(-1)[1] > Date.now() + 14 * 60_000);
    assert.equal((await cron.GET({ headers: new Headers(), nextUrl: request.nextUrl })).status, 401);
    assert.equal(deliveries, 2, 'Unauthorized requests must not wake the DB');
  } finally {
    if (previousSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previousSecret;
  }
  console.log('Database cache checks passed: repeat reads, mutation races, outage backoff, schedule edits, DST, and DB-free cron skips.');
})().catch(error => { console.error(error); process.exitCode = 1; });
