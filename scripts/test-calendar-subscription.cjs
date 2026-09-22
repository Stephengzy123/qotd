const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const moduleExports = {};
const code = ts.transpileModule(fs.readFileSync('lib/calendar-subscription.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
new Function('require', 'exports', code)(require, moduleExports);
const { subscriptionCalendar } = moduleExports;
const rows = [
  { id: 'event-1', kind: 'announcement', title: 'Trip', date: '2026-09-29', endDate: '2026-10-02' },
  { id: 'import-1', kind: 'imported', title: 'Day 1 (ABCD)', date: '2026-09-29' },
  { id: 'manual-1', kind: 'manual', title: 'Assembly', date: '2026-09-29', details: 'Bring a blazer' },
  { id: 'lunch-1', kind: 'lunch', title: 'Lunch', date: '2026-09-29', items: [{ category: 'Option 1', dish: 'Rice, tofu; sauce\n(dairy)' }, { category: 'Dessert', dish: '🍎'.repeat(40) }] },
];
const render = (feed, events = rows) => subscriptionCalendar(events, feed, 'https://example.com', new Date('2026-09-21T12:00:00Z'));
const events = render('events');
assert.match(events, /SUMMARY:Trip/);
assert.match(events, /SUMMARY:Assembly/);
assert.doesNotMatch(events, /SUMMARY:Lunch|SUMMARY:Day 1/);
assert.match(events, /DTEND;VALUE=DATE:20261003/);
assert.match(events, /SUMMARY:Trip\r\nDESCRIPTION:\r\n/);
assert.match(render('rotations'), /SUMMARY:Day 1/);
assert.doesNotMatch(render('rotations'), /SUMMARY:Trip/);
const lunch = render('lunch');
assert.match(lunch.replace(/\r\n /g, ''), /Option 1: Rice\\, tofu\\; sauce\\n\(dairy\)/);
assert.match(lunch.replace(/\r\n /g, ''), /Dessert:/);
for (const line of lunch.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75);
const uid = text => text.match(/UID:([^\r]+)/)[1];
assert.equal(uid(render('events')), uid(render('events', [{ ...rows[0], date: '2026-10-01', title: 'Updated trip' }])));
assert.equal(uid(render('lunch')), uid(render('lunch', [{ ...rows[3], items: [] }])));
assert.equal(uid(render('rotations')), uid(render('rotations', [{ ...rows[1], id: 'new-position' }])));
console.log('Subscription checks passed: categories, privacy projection, dates, stable IDs, menus, escaping and UTF-8 line folding.');
