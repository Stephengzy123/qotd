const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
function load(file, deps) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("require", "exports", code)(name => { if (!(name in deps)) throw Error("Unexpected dependency " + name); return deps[name]; }, exports);
  return exports;
}
let authorized = true, editable = true, resolutions = 0;
const writes = [];
const delivery = load("lib/delivery-settings.ts", {
  "@/lib/webhook-destinations": { resolveWebhooks: async ids => {
    resolutions++;
    if (!ids.length || ids.includes("forged")) throw Error("Unassigned destination");
    return [];
  } }
});
const actions = load("app/actions.ts", {
  "@/lib/delivery-settings": delivery,
  "@/lib/auth": { requireRole: async role => { assert.equal(role, "admin"); if (!authorized) throw Error("Forbidden"); return { username: "admin", role }; } },
  "@/lib/db": { dbReady: async () => async (parts, ...values) => {
    assert.match(parts.join("?"), /status in \('pending', 'approved'\)/);
    writes.push(values);
    return editable ? [{ id: "item" }] : [];
  } },
  "next/cache": { revalidatePath: () => {} }, "next/navigation": {}, "next/headers": {},
  "@/lib/log": { logEvent: async () => {} }, "@/lib/security": {}, "@/lib/calendar": {},
  "@/lib/accounts": {}, "@/lib/clubs": {},
  "@/lib/qotd": { sendAnnouncement: () => { throw Error("Saving must never send"); } },
  "@/lib/web-push": { scheduleLivePush: () => { throw Error("Saving must never push"); } }
});
(async () => {
  const form = new FormData();
  form.set("id", "00000000-0000-4000-8000-000000000001");
  form.set("destination", "discord"); form.set("removePings", "on"); form.append("webhookIds", "primary");
  assert.ok((await actions.saveDeliverySettingsAction({}, form)).success);
  assert.deepEqual(writes[0].slice(0, 3), ["discord", true, ["primary"]]);
  form.set("destination", "live"); form.delete("removePings");
  const prior = resolutions;
  assert.ok((await actions.saveDeliverySettingsAction({}, form)).success);
  assert.deepEqual(writes[1].slice(0, 3), ["live", false, ["primary"]]);
  assert.equal(resolutions, prior);
  editable = false;
  assert.match((await actions.saveDeliverySettingsAction({}, form)).error, /sent or removed/);
  form.set("destination", "forged");
  assert.match((await actions.saveDeliverySettingsAction({}, form)).error, /valid send destination/);
  authorized = false;
  await assert.rejects(() => actions.saveDeliverySettingsAction({}, form), /Forbidden/);
  console.log("Saved delivery checks passed: persistence, clearing pings, retaining hidden choices, no send/push, sent-item protection, authorization.");
})().catch(error => { console.error(error); process.exitCode = 1; });
