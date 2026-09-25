const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

let rows = [];
let fail = false;
const exportsObject = {};
const compiled = ts.transpileModule(fs.readFileSync('app/api/live-update/route.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
new Function('require', 'exports', compiled)(name => {
  if (name === 'next/server') return { NextResponse: { json: (body, options = {}) => Response.json(body, options) } };
  if (name === '@/lib/db') return { dbReady: async () => {
    if (fail) throw Error('Database unavailable');
    return async () => rows;
  } };
  throw Error(`Unexpected import ${name}`);
}, exportsObject);

(async () => {
  let response = await exportsObject.GET();
  assert.deepEqual(await response.json(), { update: null });
  assert.equal(response.headers.get('cache-control'), 'no-store');

  rows = [{ id: 'notice-1', title: 'New calendar', body: 'Try the daily view.', published_at: new Date('2026-09-24T12:00:00Z') }];
  response = await exportsObject.GET();
  assert.deepEqual(await response.json(), { update: {
    id: 'notice-1', title: 'New calendar', body: 'Try the daily view.', publishedAt: '2026-09-24T12:00:00.000Z',
  } });
  assert.equal(response.headers.get('cache-control'), 'no-store');

  rows = [{ id: null, title: 'Unpublished draft', body: 'Private', published_at: null }];
  response = await exportsObject.GET();
  assert.deepEqual(await response.json(), { update: null });

  fail = true;
  response = await exportsObject.GET();
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  console.log('Live update checks passed: published-only response, no-store caching, and graceful failure.');
})().catch(error => { console.error(error); process.exitCode = 1; });

let admin = false;
let inserted = [];
let revalidated = [];
let entryExists = true;
const actionExports = {};
const actionCompiled = ts.transpileModule(fs.readFileSync('app/update-history/actions.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
new Function('require', 'exports', actionCompiled)(name => {
  if (name === 'next/cache') return { revalidatePath: path => revalidated.push(path) };
  if (name === 'next/navigation') return { redirect: path => { throw Error(`redirect:${path}`); } };
  if (name === '@/lib/auth') return { requireRole: async () => {
    if (!admin) throw Error('Forbidden');
    return { username: 'admin', role: 'admin' };
  } };
  if (name === '@/lib/db') return { dbReady: async () => (parts, ...values) => {
    const query = parts.join('?');
    inserted.push({ query, values });
    return Promise.resolve(query.includes('update update_history_entries') && entryExists ? [{ id: values.at(-1) }] : []);
  } };
  if (name === '@/lib/log') return { logEvent: async () => {} };
  throw Error(`Unexpected import ${name}`);
}, actionExports);

(async () => {
  const form = new FormData();
  form.set('title', 'Calendar improvements');
  form.set('body', '**Long-form** update\n'.repeat(400));
  await assert.rejects(actionExports.publishHistoryEntry(form), /Forbidden/);
  assert.equal(inserted.length, 0);
  admin = true;
  await assert.rejects(actionExports.publishHistoryEntry(form), /redirect:\/update-history\?ok=/);
  assert.equal(inserted.length, 1);
  assert.match(inserted[0].query, /insert into update_history_entries/);
  assert.doesNotMatch(inserted[0].query, /update settings/);
  assert.equal(inserted[0].values[1], form.get('body').trim());
  assert.deepEqual(revalidated, ['/update-history']);
  const empty = new FormData();
  empty.set('title', 'Title');
  await assert.rejects(actionExports.publishHistoryEntry(empty), /redirect:\/update-history\?error=/);
  assert.equal(inserted.length, 1);
  const edit = new FormData();
  edit.set('id', '12345678-1234-1234-1234-123456789abc');
  edit.set('title', 'Edited calendar improvements');
  edit.set('body', '**Revised** notes\n'.repeat(400));
  admin = false;
  await assert.rejects(actionExports.editHistoryEntry(edit), /Forbidden/);
  assert.equal(inserted.length, 1);
  admin = true;
  await assert.rejects(actionExports.editHistoryEntry(edit), /redirect:\/update-history\?ok=/);
  assert.equal(inserted.length, 2);
  assert.match(inserted[1].query, /update update_history_entries/);
  assert.match(inserted[1].query, /edited_at = now\(\)/);
  assert.doesNotMatch(inserted[1].query, /published_at\s*=/);
  assert.equal(inserted[1].values[1], edit.get('body').trim());
  assert.deepEqual(revalidated, ['/update-history', '/update-history']);
  edit.set('id', 'not-an-id');
  await assert.rejects(actionExports.editHistoryEntry(edit), /redirect:\/update-history\?error=/);
  assert.equal(inserted.length, 2);
  edit.set('id', '12345678-1234-1234-1234-123456789abc');
  entryExists = false;
  await assert.rejects(actionExports.editHistoryEntry(edit), /redirect:\/update-history\?error=/);
  console.log('Update history checks passed: admin-only publishing and editing, long Markdown, unchanged publish dates, and validation.');
})().catch(error => { console.error(error); process.exitCode = 1; });
