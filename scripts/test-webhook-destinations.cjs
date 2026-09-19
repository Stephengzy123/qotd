const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(file, deps, fetch) {
  const output = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', 'fetch', code)(name => {
    if (!(name in deps)) throw new Error(`Unexpected import ${name}`);
    return deps[name];
  }, output, fetch);
  return output;
}
const hook = (id, name, discordId) => ({ id, name, webhook_url_encrypted: `https://discord.com/api/webhooks/${discordId}/secret` });
const primary = hook('primary', 'Primary', '111');
const secondary = hook('secondary', 'Secondary', '222');
const club = hook('club', 'Club', '333');
let memberRole = "leader";
let revoked = false, stored = [], claimed = new Set(), requests = [];
const sql = async (parts, ...values) => {
  const query = parts.join('?');
  if (query.includes('join webhook_assignments')) {
    assert.match(query, /a.account_id = \?/); assert.match(query, /u.role = 'club_leader'/);
    return values[0] === 'leader-a' && !revoked ? [club, hook('duplicate', 'Same channel', '333')] : [];
  }
  if (query.includes('from saved_webhooks')) { assert.match(query, /primary_enabled = true/); return [secondary]; }
  if (query.includes('select c.*, m.club_role')) return [{ id: 'club-id', name: 'Club', club_role: memberRole }];
  if (query.includes('from clubs c')) return [];
  if (query.includes('from settings')) return [primary];
  if (query.includes('insert into club_send_requests')) {
    if (claimed.has(values[0])) return [];
    claimed.add(values[0]); return [{ id: values[0] }];
  }
  if (query.includes('insert into club_posts')) { stored.push(values); return []; }
  throw new Error(`Unexpected SQL (including any live-feed writes): ${query}`);
};
const mod = load('lib/webhook-destinations.ts', {
  '@/lib/db': { dbReady: async () => sql },
  '@/lib/security': { decryptSecret: value => value, validateDiscordWebhook: value => value.startsWith('https://discord.com/api/webhooks/') },
}, async (url, options) => {
  requests.push({ url: String(url), payload: JSON.parse(options.body) });
  if (String(url).includes('/222/')) return { ok: false, status: 500 };
  return { ok: true, status: 200 };
});
const clubs = load('lib/clubs.ts', {
  'server-only': {}, '@/lib/db': { dbReady: async () => sql },
  '@/lib/security': {}, '@/lib/log': { errorDetail: String, logEvent: async () => {} },
  '@/lib/webhook-destinations': mod,
});
(async () => {
  assert.deepEqual(await mod.webhookOptions(), [{ id: 'primary', name: 'Primary announcements' }, { id: 'secondary', name: 'Secondary' }]);
  assert.deepEqual((await mod.webhookOptions('leader-b')), []);
  await assert.rejects(() => mod.resolveWebhooks([], 'leader-a'), /Choose/);
  await assert.rejects(() => mod.resolveWebhooks(Array.from({ length: 11 }, (_, i) => String(i))), /Choose/);
  await assert.rejects(() => mod.resolveWebhooks(['primary'], 'leader-a'), /no longer assigned/);
  await assert.rejects(() => mod.resolveWebhooks(['club'], 'leader-b'), /no longer assigned/);
  await assert.rejects(() => mod.resolveWebhooks(['club']), /no longer assigned/);
  await assert.rejects(() => mod.resolveWebhooks(['club', 'forged'], 'leader-a'), /no longer assigned/);
  assert.equal(requests.length, 0);
  const targets = await mod.resolveWebhooks(['club', 'club', 'duplicate'], 'leader-a');
  assert.equal(targets.length, 1);
  assert.ok(String(targets[0].url).endsWith('wait=true'));
  const form = new FormData(); assert.equal(mod.selectedWebhookIds(form), undefined);
  form.set('webhookSelection', '1'); assert.deepEqual(mod.selectedWebhookIds(form), []);
  form.append('webhookIds', 'secondary'); assert.deepEqual(mod.selectedWebhookIds(form), ['secondary']);
  const results = await mod.deliverWebhooks(await mod.resolveWebhooks(['primary', 'secondary']), { content: 'test' });
  assert.equal(results[0].success, true); assert.equal(results[1].success, false);
  assert.equal(JSON.stringify(results).includes('secret'), false);
  const id = '00000000-0000-4000-8000-000000000001';
  const account = { accountId: 'leader-a', username: 'leader', role: 'club_leader' };
  const clubInfo = { id: 'club-id', name: 'Club' };
  memberRole = 'assistant';
  assert.match((await clubs.postClubMessage(clubInfo, account, 'Hello', ['club'], id)).error, /managers/);
  assert.equal(stored.length, 0);
  memberRole = 'leader';
  assert.equal((await clubs.postClubMessage(clubInfo, account, 'Hello', ['club', 'duplicate'], id)).success, true);
  const count = requests.length;
  assert.match((await clubs.postClubMessage(clubInfo, account, 'Hello', ['club'], id)).error, /already submitted/);
  assert.equal(requests.length, count);
  assert.equal(stored.length, 1); assert.equal(stored[0][8], 'Club');
  assert.deepEqual(requests.at(-1).payload.allowed_mentions, { parse: ['users', 'roles'] });
  revoked = true;
  await assert.rejects(() => mod.resolveWebhooks(['club'], 'leader-a'), /no longer assigned/);
  assert.equal(requests.length, count);
  // Action authorization must run before accepting any account/destination input.
  for (const file of ['app/club/actions.ts', 'app/admin/webhooks/actions.ts']) {
    const action = load(file, {
      'next/navigation': { redirect: () => { throw new Error('redirect'); } },
      'next/cache': { revalidatePath: () => {} },
      '@/lib/auth': { requireRole: async role => { assert.equal(role, file.includes('/club/') ? 'club_leader' : 'admin'); throw new Error('Forbidden'); } },
      '@/lib/clubs': clubs, '@/lib/log': {}, '@/lib/db': { dbReady: () => { throw new Error('Must not access database'); } }, '@/lib/security': {},
    });
    await assert.rejects(() => (action.postClubMessageAction || action.saveWebhookAction)(new FormData()), /Forbidden/);
  }
  console.log('Webhook checks passed: scoped assignments, forged/stale/empty selections, deduplication, per-target outcomes, secret filtering, club-only history, replay protection.');
})().catch(error => { console.error(error); process.exitCode = 1; });
