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
  if (query.includes('set public_edit_hash = ?')) {
    const [editHash, hash, owner] = values;
    const row = rows.get(hash);
    if (!row || row.owner !== owner || row.revoked || (row.publicEditHash && row.publicEditHash !== editHash)) return [];
    row.publicEditHash = editHash;
    return [{ classes: row.classes }];
  }
  if (query.includes('set public_edit_hash = null')) {
    const [hash, editHash] = values;
    const row = rows.get(hash);
    if (!row || row.revoked || row.publicEditHash !== editHash) return [];
    row.publicEditHash = null;
    return [{ token_hash: hash }];
  }
  if (query.includes('insert into personal_timetables')) {
    const [hash, owner, json] = values;
    const editHash = values.at(-1);
    const old = rows.get(hash);
    if (old && (old.revoked || (old.owner !== owner && old.publicEditHash !== editHash))) return [];
    rows.set(hash, { owner: old?.owner || owner, publicEditHash: old?.publicEditHash || null, classes: json.value });
    return [{ token_hash: hash }];
  }
  const [hash, owner, editHash] = values;
  const row = rows.get(hash);
  if (query.includes('set revoked_at')) { if (row && row.owner === owner && !row.revoked) { row.revoked = true; return [{ token_hash: hash }]; } return []; }
  if (query.includes('select owner_key from personal_timetables')) return row && !row.revoked ? [{ owner_key: row.owner }] : [];
  if (query.includes('from personal_timetables')) return row && !row.revoked && (row.owner === owner || row.publicEditHash === editHash) ? [{ classes: row.classes, token_hash: hash, owner_key: row.owner }] : [];
  throw Error(`Unexpected SQL: ${query}`);
};
sql.begin = callback => callback(sql);
sql.json = value => ({ value });
const action = load('app/live/timetable/actions.ts', {
  'next/headers': { headers: async () => new Headers({ 'x-forwarded-for': '127.0.0.1' }) },
  '@/lib/auth': { getSession: async () => session },
  '@/lib/db': { dbReady: async () => sql }, '@/lib/security': { hashAddress: value => value }, '@/lib/personal-timetable': personal,
});
let session = null;
(async () => {
  assert.deepEqual((await action.publicTimetableAction('save', read, edit, classes)).classes, classes);
  assert.equal(rows.size, 1);
  assert.equal((await action.publicTimetableAction('load', read, stolen)).error !== undefined, true);
  assert.equal((await action.publicTimetableAction('save', read, stolen, classes)).error !== undefined, true);
  assert.equal((await action.publicTimetableAction('revoke', read, stolen)).error !== undefined, true);
  assert.deepEqual((await action.publicTimetableAction('load', read, edit)).classes, classes);
  assert.deepEqual(await action.publicTimetableAction('revoke', read, edit), {});
  assert.equal((await action.publicTimetableAction('load', read, edit)).error !== undefined, true);

  const oldRead = '44'.repeat(32), oldEdit = '55'.repeat(32);
  const oldHash = personal.tokenHash(oldRead);
  rows.set(oldHash, { owner: 'username:admin', publicEditHash: null, classes: { ...classes, 'room:A': 'T215' } });
  assert.ok((await action.claimAdminTimetableAction(oldRead, oldEdit)).error, 'Unauthenticated callers cannot claim an admin timetable');
  session = { role: 'admin', username: 'other' };
  assert.ok((await action.claimAdminTimetableAction(oldRead, oldEdit)).error, 'Another admin cannot claim this timetable');
  session = { role: 'admin', username: 'admin' };
  assert.equal((await action.claimAdminTimetableAction(oldRead, oldEdit)).classes['room:A'], 'T215');
  assert.equal((await action.publicTimetableAction('load', oldRead, oldEdit)).linkedAdmin, true);
  assert.ok((await action.publicTimetableAction('load', oldRead, stolen)).error, 'The read-only ICS token cannot edit');
  assert.equal((await action.publicTimetableAction('save', oldRead, oldEdit, { ...classes, A: 'Updated' })).linkedAdmin, true);
  assert.equal(rows.get(oldHash).classes.A, 'Updated');
  assert.ok((await action.claimAdminTimetableAction(oldRead, stolen)).error, 'Claiming with a new edit token cannot silently evict the original');
  assert.deepEqual(await action.publicTimetableAction('revoke', oldRead, oldEdit), { detached: true });
  assert.equal(rows.get(oldHash).revoked, undefined, 'Disconnecting must not revoke the old ICS link');
  assert.equal(rows.get(oldHash).publicEditHash, null);
  console.log('Public timetable ownership, admin-link sharing, safe disconnect, and notification defaults passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
