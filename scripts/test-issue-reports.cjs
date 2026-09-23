const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
let inserted = 0, rate = 0, duplicate = false, admin = false;
const sql = async (parts) => {
  const query = parts.join('?');
  if (query.includes('select id')) return duplicate ? [{ id: 'existing' }] : [];
  if (query.includes('count(*)')) return [{ count: rate }];
  if (query.includes('insert into')) inserted++;
  return [];
};
sql.begin = callback => callback(sql);
const deps = {
  'next/headers': { headers: async () => new Headers() },
  'next/cache': { revalidatePath: () => {} },
  '@/lib/db': { dbReady: async () => sql },
  '@/lib/security': { hashAddress: () => 'hashed-address' },
  '@/lib/auth': { requireRole: async () => { if (!admin) throw Error('Forbidden'); return { username: 'admin', role: 'admin' }; } },
  '@/lib/log': { logEvent: async () => {} },
};
const exportsObject = {};
new Function('require', 'exports', ts.transpileModule(fs.readFileSync('app/report/actions.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(key => deps[key], exportsObject);
const form = () => { const f = new FormData(); f.set('requestId', '12345678-1234-1234-1234-123456789abc'); f.set('category', 'general'); f.set('description', 'The calendar date looks wrong.'); return f; };
(async () => {
  assert.ok((await exportsObject.submitIssue({}, form())).success);
  assert.equal(inserted, 1);
  duplicate = true;
  assert.ok((await exportsObject.submitIssue({}, form())).success);
  assert.equal(inserted, 1);
  duplicate = false; rate = 10;
  assert.ok((await exportsObject.submitIssue({}, form())).error);
  assert.equal(inserted, 1);
  const invalid = form(); invalid.set('category', 'invented');
  assert.ok((await exportsObject.submitIssue({}, invalid)).error);
  rate = 0;
  const suggestion = form(); suggestion.set('category', 'suggestion');
  assert.match((await exportsObject.submitIssue({}, suggestion)).success, /Suggestion received/);
  assert.equal(inserted, 2);
  const update = new FormData(); update.set('id', '12345678-1234-1234-1234-123456789abc'); update.set('status', 'resolved');
  await assert.rejects(exportsObject.updateIssue(update), /Forbidden/);
  admin = true; await exportsObject.updateIssue(update);
  console.log('Report checks passed: public submission, replay protection, rate limit, validation, admin-only resolution.');
})().catch(error => { console.error(error); process.exitCode = 1; });
