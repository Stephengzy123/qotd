const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file, deps = {}) {
  const result = {};
  new Function('require', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText)(key => {
    if (key === 'server-only') return {};
    if (!(key in deps)) throw Error(`Unexpected import ${key}`);
    return deps[key];
  }, result);
  return result;
}
const timetable = load('lib/timetable.ts');
const { DEFAULT_TIMETABLE: defaults, validateTimetable, normalizeTimetable, rotationLetters, rotationForDate, scheduleForDate } = timetable;
const copy = () => structuredClone(defaults);
assert.deepEqual(validateTimetable(copy()), defaults);
assert.deepEqual(normalizeTimetable({}), defaults);
for (const [title, letters] of [['Day 1 (ABCD)', 'ABCD'], ['Day 1 (CDAB)', 'CDAB'], ['Day 2 (EFGH)', 'EFGH'], ['Day 1 (XB)', 'X'], ['XB', 'X']]) {
  assert.equal(rotationLetters(title).join(''), letters);
  const schedule = scheduleForDate(defaults, '2026-09-21', rotationLetters(title));
  if (letters === 'X') assert.equal(schedule[0].label, 'Flex Day');
  else assert.equal(schedule.filter(row => row.kind === 'class').map(row => row.letter).join(''), letters);
}
assert.equal(rotationLetters('Meet in room ABCD'), null);
assert.equal(rotationLetters('Day 1 (AAAA)'), null);
assert.equal(rotationLetters('Wednesday X Block'), null);
assert.equal(scheduleForDate(defaults, '2026-09-23', ['C','D','A','B'])[0].end, '09:30');
assert.equal(scheduleForDate(defaults, '2026-09-23', ['X'])[0].label, 'Flex Day');
assert.deepEqual(scheduleForDate(defaults, '2026-09-21', null), []);
assert.deepEqual(scheduleForDate(defaults, '2026-09-26', ['A','B','C','D']), []);
const event = title => ({date: '2026-09-21', title});
assert.equal(rotationForDate([event('Day 1 (ABCD)'), event('Day 1 (CDAB)')], '2026-09-21'), null);
assert.equal(rotationForDate([event('Day 1 (ABCD)'), event('School closed')], '2026-09-21'), null);
assert.deepEqual(rotationForDate([event('Day 1 (CDAB)'), event('Day 1 (CDAB)')], '2026-09-21').letters, ['C','D','A','B']);
for (const mutate of [
  c => { c.monday = []; },
  c => { delete c.friday; },
  c => { c.monday[0].start = '25:00'; },
  c => { c.monday[0].end = '08:00'; },
  c => { c.monday[1].start = '09:00'; },
  c => { c.monday[0].label = ''; },
  c => { c.monday[0].kind = 'typo'; },
  c => { c.monday[0].kind = 'activity'; },
  c => { c.flex[0].kind = 'class'; },
  c => { c.monday = Array(17).fill(c.monday[0]); },
]) { const config = copy(); mutate(config); assert.throws(() => validateTimetable(config)); }

let admin = false, writes = 0, saved, revalidated = false;
const actions = load('app/admin/timetable/actions.ts', {
  '@/lib/auth': { requireRole: async role => { assert.equal(role, 'admin'); if (!admin) throw Error('Forbidden'); return {username:'tester', role:'admin'}; } },
  '@/lib/db': { dbReady: async () => async (_sql, value) => { writes++; saved = JSON.parse(value); return []; } },
  '@/lib/timetable': timetable,
  '@/lib/log': {logEvent: async () => {}},
  'next/cache': {revalidatePath: path => { assert.ok(['/admin/timetable', '/admin/calendar'].includes(path)); revalidated = true; }},
});
const form = data => { const result = new FormData(); result.set('config', data); return result; };
(async () => {
  await assert.rejects(actions.saveTimetableAction({}, form(JSON.stringify(defaults))), /Forbidden/);
  assert.equal(writes, 0);
  admin = true;
  for (const data of ['{broken', 'null', '{}', JSON.stringify({...defaults, monday: []})]) {
    assert.ok((await actions.saveTimetableAction({}, form(data))).error);
    assert.equal(writes, 0);
  }
  assert.ok((await actions.saveTimetableAction({}, form(JSON.stringify(defaults)))).success);
  assert.equal(writes, 1);
  assert.deepEqual(saved, defaults);
  assert.equal(revalidated, true);
  console.log('Timetable checks passed: rotated class order, weekday times, Flex, absent/conflicting rotations, validation, admin authorization and saving.');
})().catch(error => { console.error(error); process.exitCode = 1; });
