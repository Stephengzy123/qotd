const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function load(file, dependencies = {}) {
  const exports = {};
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'exports', compiled)(name => {
    if (name === 'server-only') return {};
    if (name === 'react/jsx-runtime') return require(name);
    if (name === 'react') return React;
    if (!(name in dependencies)) throw new Error(`Unexpected import ${name}`);
    return dependencies[name];
  }, exports);
  return exports;
}

const { DiscordMarkdown } = load('components/discord-preview.tsx');
const render = (value, highlight) => renderToStaticMarkup(React.createElement(DiscordMarkdown, { value, highlight }));
assert.match(render('## Photo Day\n**Photo day** tomorrow', 'photo day'), /<mark class="discord-search-match">Photo Day<\/mark>/);
assert.match(render('**Photo day** tomorrow', 'photo day'), /<strong><mark class="discord-search-match">Photo day<\/mark><\/strong>/);
assert.match(render('[Photo day](https://example.com)', 'photo day'), /<a[^>]*><mark class="discord-search-match">Photo day<\/mark><\/a>/);
assert.match(render('Use 100% <script>', '100% <script>'), /<mark class="discord-search-match">100% &lt;script&gt;<\/mark>/);
assert.doesNotMatch(render('Photo day', ''), /<mark/);

const row = (id, time, message) => ({ id, sent_time: time, message, question_type: 'announcement', hidden_from_live: false,
  sender_name: null, sender_avatar_url: null, reply_to_dispatch_id: null, reply_message: null, reply_sender_name: null,
  reply_sent_time: null, calendar_fallback_date: null });
const recent = row('11111111-1111-4111-8111-111111111111', '2026-09-24T17:00:00Z', 'Photo day');
const older = row('22222222-2222-4222-8222-222222222222', '2026-09-23T17:00:00Z', 'Photo day reminder');
let queries = [];
const sql = (parts, ...values) => {
  const query = { text: parts.join('?'), values };
  if (query.text.includes('select d.id')) { queries.push(query); return Promise.resolve([recent, older]); }
  return query;
};
const { getLiveMessages, parseLiveCursor } = load('lib/live-messages.ts', {
  '@/lib/db': { dbReady: async () => sql }, '@/lib/live-text': { liveMessageText: value => value },
});
(async () => {
  const searched = await getLiveMessages('all', null, null, false, 'photo day');
  assert.deepEqual(searched.messages.map(item => item.id), [recent.id, older.id]);
  const fragments = queries.at(-1).values.filter(value => value?.text);
  assert.ok(fragments.some(value => value.text.includes('strpos(lower(d.message), lower(') && value.values.includes('photo day')));
  assert.ok(queries.at(-1).text.includes('d.success = true and d.hidden_from_live'));
  const before = parseLiveCursor(searched.messages.at(-1).cursor);
  await getLiveMessages('event', before, null, false, 'photo day');
  assert.ok(queries.at(-1).values.some(value => value?.text?.includes('(d.created_at, d.id) <')));
  assert.ok(queries.at(-1).values.some(value => value?.text?.includes('d.question_type')));
  const regular = await getLiveMessages('all', null, null);
  assert.deepEqual(regular.messages.map(item => item.id), [older.id, recent.id]);
  console.log('Live search checks passed: paged database query, sent/visible scope, and formatted highlights.');
})().catch(error => { console.error(error); process.exitCode = 1; });
