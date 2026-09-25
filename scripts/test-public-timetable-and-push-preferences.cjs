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
const prefs = load('lib/push-preferences.ts');
assert.deepEqual(prefs.normalizePushPreferences(null), { announcement: true, event: true, reminder: true, human: true });
assert.deepEqual(prefs.normalizePushPreferences({ event: false }), { announcement: true, event: false, reminder: true, human: true });
assert.throws(() => prefs.validatePushPreferences({ event: false }));
assert.equal(prefs.pushCategory('announcement', 'Staff'), 'human');
assert.equal(prefs.pushCategory('event', null), 'event');
assert.equal(prefs.pushCategory('reminder', null), 'reminder');
assert.equal(prefs.pushCategory(null, null), 'announcement');

const timetable = load('lib/timetable.ts');
const personal = load('lib/personal-timetable.ts', {
  '@/lib/timetable': timetable,
  '@/lib/calendar-subscription': load('lib/calendar-subscription.ts'),
  '@/lib/timetable-personalization': load('lib/timetable-personalization.ts'),
});
const classes = Object.fromEntries([...'ABCDEFGH'].map(letter => [letter, `Class ${letter}`]));
const read = '11'.repeat(32), edit = '22'.repeat(32), stolen = '33'.repeat(32);
const rows = new Map();
const sql = async (parts, ...values) => {
  const query = parts.join('?');
  if (query.includes('pg_advisory_xact_lock')) return [];
  if (query.includes('count(*)')) return [{ n: 0 }];
  if (query.includes('insert into personal_timetables')) {
    const [hash, owner, json] = values;
    if (rows.has(hash) && (rows.get(hash).owner !== owner || rows.get(hash).revoked)) return [];
    rows.set(hash, { owner, classes: json.value });
    return [{ token_hash: hash }];
  }
  const [hash, owner] = values;
  const row = rows.get(hash);
  if (query.includes('set revoked_at')) { if (row && row.owner === owner && !row.revoked) { row.revoked = true; return [{ token_hash: hash }]; } return []; }
  if (query.includes('from personal_timetables')) return row && row.owner === owner && !row.revoked ? [{ classes: row.classes, token_hash: hash }] : [];
  throw Error(`Unexpected SQL: ${query}`);
};
sql.begin = callback => callback(sql);
sql.json = value => ({ value });
const action = load('app/live/timetable/actions.ts', {
  'next/headers': { headers: async () => new Headers({ 'x-forwarded-for': '127.0.0.1' }) },
  '@/lib/db': { dbReady: async () => sql }, '@/lib/security': { hashAddress: value => value }, '@/lib/personal-timetable': personal,
}).publicTimetableAction;
(async () => {
  assert.deepEqual((await action('save', read, edit, classes)).classes, classes);
  assert.equal(rows.size, 1);
  assert.equal((await action('load', read, stolen)).error !== undefined, true);
  assert.equal((await action('save', read, stolen, classes)).error !== undefined, true);
  assert.equal((await action('revoke', read, stolen)).error !== undefined, true);
  assert.deepEqual((await action('load', read, edit)).classes, classes);
  assert.deepEqual(await action('revoke', read, edit), {});
  assert.equal((await action('load', read, edit)).error !== undefined, true);
  console.log('Public timetable ownership and notification preference defaults passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
