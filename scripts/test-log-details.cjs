const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(file, deps = {}) {
  const out = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', code)(name => {
    if (!(name in deps)) throw new Error(`Unexpected dependency: ${name}`);
    return deps[name];
  }, out.exports);
  return out.exports;
}
const { describeDetails } = load('lib/log-details.ts');
const details = { destination: 'live', ping: false, sent: 0, failures: [], nested: { ok: true }, empty: '', missing: null };
const expected = 'destination: live · ping: false · sent: 0 · failures: [] · nested: {"ok":true}';
for (const value of [details, JSON.stringify(details), JSON.stringify(JSON.stringify(details))]) assert.equal(describeDetails(value), expected);
for (const value of [null, undefined, {}, 'null', '']) assert.equal(describeDetails(value), '');
assert.equal(describeDetails('{broken'), '{broken');
assert.equal(describeDetails('plain text'), 'plain text');
assert.equal(describeDetails(false), 'false');
assert.equal(describeDetails(0), '0');
assert.equal(describeDetails(['one', 'two']), '["one","two"]');
const saved = [];
const sql = async (_parts, ...values) => saved.push(values);
sql.json = value => {
  assert.equal(typeof value, 'object', 'JSON must not be pre-stringified');
  return { json: JSON.parse(JSON.stringify(value)) };
};
const { logEvent } = load('lib/log.ts', { '@/lib/db': { db: () => sql } });
(async () => {
  await logEvent({ action: 'test', details });
  assert.deepEqual(saved[0][4], { json: details });
  await logEvent({ action: 'test' });
  assert.equal(saved[1][4], null);
  console.log('Log checks passed: object/string history, malformed data, false/zero, arrays, JSON-object writes, null details.');
})().catch(error => { console.error(error); process.exitCode = 1; });
