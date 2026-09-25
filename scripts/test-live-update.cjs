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
