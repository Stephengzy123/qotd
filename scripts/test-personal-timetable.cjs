const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file, deps = {}) {
  const result = {};
  new Function('require', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText)(key => {
    if (key === 'server-only') return {};
    if (key === 'node:crypto') return require(key);
    if (!(key in deps)) throw Error(`Unexpected import ${key}`);
    return deps[key];
  }, result);
  return result;
}
const timetable = load('lib/timetable.ts');
const personal = load('lib/personal-timetable.ts', {
  '@/lib/timetable': timetable, '@/lib/calendar-subscription': load('lib/calendar-subscription.ts'),
  '@/lib/timetable-personalization': load('lib/timetable-personalization.ts'),
});
const classes = Object.fromEntries([...'ABCDEFGH'].map(letter => [letter, `Class ${letter}`]));
const token = 'ab'.repeat(32), otherToken = 'cd'.repeat(32);
assert.notEqual(personal.tokenHash(token), token);
assert.throws(() => personal.tokenHash('guess'));
assert.throws(() => personal.validateClasses({ ...classes, A: 'bad\nBEGIN:VEVENT' }));
assert.throws(() => personal.validateClasses({ ...classes, A: 'a'.repeat(101) }));
assert.equal(personal.validateClasses({ ...classes, A: ' Maths ' }).A, 'Maths');
const personalized = personal.personalizeSchedule(timetable.scheduleForDate(timetable.DEFAULT_TIMETABLE, '2026-09-23', ['C', 'D', 'A', 'B']), { ...classes, 'room:C': 'B201' });
assert.equal(personalized.filter(period => period.kind === 'class')[0].label, 'Class C (B201)');
assert.equal(personalized.find(period => period.kind === 'activity').label, 'X Block');
assert.equal(personal.pacificTimestamp('2026-09-23', '08:30'), '20260923T153000Z');
assert.equal(personal.pacificTimestamp('2026-12-02', '08:30'), '20261202T163000Z');
const config = structuredClone(timetable.DEFAULT_TIMETABLE);
config.wednesday[2].infoUrl = 'https://example.org/advisory';
const rotations = [{ date: '2026-09-23', title: 'Day 1 (CDAB)' }, { date: '2026-09-24', title: 'XB' }];
const render = (names = classes, identity = 'one') => personal.personalTimetableCalendar(identity, names, config, rotations,
  [{ menu_date: '2026-09-23', items: [{ category: 'SR OPTION 1', dish: 'Pasta, salad' }] }], 'https://school.example', new Date('2026-09-23T00:00:00Z'));
const ics = render();
assert.ok(ics.indexOf('SUMMARY:Class C') < ics.indexOf('SUMMARY:Class A'));
assert.ok(ics.includes('DTEND:20260923T163000Z')); // Wednesday first class ends 09:30 PDT.
assert.ok(ics.includes('SUMMARY:Flex Day'));
assert.ok(ics.includes('SR OPTION 1: Pasta\\, salad'));
assert.ok(ics.includes('URL:https://example.org/advisory'));
assert.ok(ics.includes('X-WR-CALDESC:Personal timetable only'));
const uids = text => text.match(/^UID:.*$/gm);
assert.deepEqual(uids(render({ ...classes, A: 'Renamed' })), uids(ics));
assert.notDeepEqual(uids(render(classes, 'two')), uids(ics));
assert.ok(render({ ...classes, A: '' }).includes('SUMMARY:Block A'));
assert.ok(render({ ...classes, A: '中'.repeat(100) }).split('\r\n').every(line => Buffer.byteLength(line) <= 75));
assert.ok(!ics.includes('VALUE=DATE'));
const withRoom = personal.validateClasses({ ...classes, 'room:A': ' T215 ' });
assert.equal(withRoom['room:A'], 'T215');
assert.ok(render(withRoom).includes('SUMMARY:Class A (T215)'));
assert.ok(render(withRoom).includes('LOCATION:T215'));
assert.deepEqual(uids(render(withRoom)), uids(ics));
assert.ok(!render({ ...withRoom, A: 'Math (T215)' }).includes('(T215) (T215)'));
assert.ok(render({ ...classes, A: '', 'room:A': 'Gym' }).includes('SUMMARY:Block A (Gym)'));
assert.ok(render({ ...classes, 'room:A': 'Hall, East' }).includes('LOCATION:Hall\\, East'));
assert.throws(() => personal.validateClasses({ ...classes, 'room:A': 'x\nSUMMARY:bad' }));
assert.throws(() => personal.validateClasses({ ...classes, 'room:A': 'a'.repeat(61) }));

(async () => {
  const { types } = await import('../node_modules/postgres/src/types.js');
  const driver = require('postgres')({ prepare: false }); // No connection made; use the real typed JSON parameter.
  const roundTrip = value => types.json.parse(types.json.serialize(value));
  assert.equal(typeof roundTrip(JSON.stringify(classes)), 'string'); // Reproduces the original bug.
  assert.deepEqual(personal.restoreClasses(roundTrip(JSON.stringify(classes))), classes);
  let owner = 'alice', authorized = true, calls = 0;
  const records = new Map();
  const sql = async (parts, ...values) => {
    calls++;
    const query = parts.join('?');
    const [hash, ownerKey, json] = values;
    if (query.includes('insert into personal_timetables')) {
      const old = records.get(hash);
      if (old && (old.owner !== ownerKey || old.revoked)) return [];
      assert.equal(json.type, 3802, 'Save must pass a typed sql.json parameter, not pre-stringified text');
      records.set(hash, { owner: ownerKey, classes: roundTrip(json.value) });
      return [{ token_hash: hash }];
    }
    if (query.includes('set revoked_at')) {
      if (records.get(hash)?.owner === ownerKey) records.get(hash).revoked = true;
      return [];
    }
    if (query.includes('from personal_timetables')) {
      const record = records.get(hash);
      return record && !record.revoked && (!ownerKey || record.owner === ownerKey) ? [{ classes: record.classes }] : [];
    }
    if (query.includes('from settings')) return [{ timetable_config: JSON.stringify(config), calendar_feed_url_encrypted: 'encrypted' }];
    if (query.includes('from lunch_menus')) return [];
    throw Error(`Unexpected SQL: ${query}`);
  };
  sql.json = driver.json;
  const auth = { requireRole: async role => { assert.equal(role, 'admin'); if (!authorized) throw Error('unauthorized'); return { username: owner }; } };
  const { personalTimetableAction: action } = load('app/admin/calendar/export/actions.ts', {
    '@/lib/auth': auth, '@/lib/db': { dbReady: async () => sql }, '@/lib/personal-timetable': personal,
  });
  authorized = false;
  await assert.rejects(action('save', token, classes), /unauthorized/);
  assert.equal(calls, 0);
  authorized = true;
  assert.deepEqual((await action('save', token, classes)).classes, classes);
  await action('save', token, { ...classes, A: 'Updated' });
  assert.equal(records.size, 1);
  assert.equal((await action('load', token)).classes.A, 'Updated');
  records.get(personal.tokenHash(token)).classes = JSON.stringify({ ...classes, A: 'Recovered' });
  assert.equal((await action('load', token)).classes.A, 'Recovered');
  owner = 'bob';
  assert.ok((await action('load', token)).error);
  assert.ok((await action('save', token, classes)).error);
  await action('revoke', token);
  assert.equal(records.size, 1);
  await action('save', otherToken, classes);
  let feedFailure = false;
  const { GET } = load('app/api/calendar/timetable/[token]/route.ts', {
    '@/lib/db': { dbReady: async () => sql }, '@/lib/timetable': timetable, '@/lib/personal-timetable': personal,
    '@/lib/calendar': { getCalendarEvents: async (_, from, to) => { if (feedFailure) throw Error('offline'); return rotations.filter(row => row.date >= from && row.date <= to); } },
  });
  const request = new Request('https://school.example/api/calendar/timetable/test.ics');
  const get = value => GET(request, { params: Promise.resolve({ token: `${value}.ics` }) });
  assert.equal((await get('guess')).status, 404);
  assert.equal((await get('ef'.repeat(32))).status, 404);
  const feed = await get(token);
  assert.equal(feed.status, 200);
  assert.match(feed.headers.get('cache-control'), /private/);
  assert.ok((await feed.text()).includes('SUMMARY:Recovered'));
  assert.ok(!(await (await get(otherToken)).text()).includes('SUMMARY:Recovered'));
  owner = 'alice';
  await action('save', token, { ...classes, A: 'Updated again' });
  assert.equal(typeof records.get(personal.tokenHash(token)).classes, 'object');
  assert.equal((await action('load', token)).classes.A, 'Updated again');
  assert.ok((await (await get(token)).text()).includes('SUMMARY:Updated again'));
  await action('save', token, withRoom);
  assert.equal((await action('load', token)).classes['room:A'], 'T215');
  assert.ok((await (await get(token)).text()).includes('LOCATION:T215'));
  feedFailure = true;
  assert.equal((await get(token)).status, 503);
  feedFailure = false;
  owner = 'alice'; await action('revoke', token);
  assert.equal((await get(token)).status, 404);
  assert.ok((await action('save', token, classes)).error); // A stale tab cannot resurrect a revoked link.
  console.log('Personal timetable: ICS, DST, isolation, auth, stable updates, revocation and failure tests passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
