const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function load(file, deps) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("require", "exports", code)(name => {
    if (!(name in deps)) throw new Error(`Unexpected dependency: ${name}`);
    return deps[name];
  }, exports);
  return exports;
}

(async () => {
  const queries = [], sends = [], pushes = [];
  const sql = async (parts, ...values) => { queries.push({ query: parts.join("?"), values }); return [{ id: "exact-item" }]; };
  const scheduler = load("lib/scheduled-delivery.ts", {
    "server-only": {},
    "@/lib/db": { dbReady: async () => sql },
    "@/lib/qotd": {
      pacificParts: () => ({ localDate: "2030-09-20", hour: 12, minute: 15 }),
      addDays: () => "2030-09-21",
      sendAnnouncement: async id => { sends.push(id); return { dispatchId: "dispatch" }; },
    },
    "@/lib/web-push": { scheduleLivePush: id => pushes.push(id) },
    "@/lib/log": { logEvent: async () => {}, errorDetail: String },
    "@/lib/calendar-fallback": { sendCalendarFallback: async () => { throw new Error("Calendar fallback must only run in the default window"); } },
  });
  const result = await scheduler.sendDueAnnouncements(new Date("2030-09-20T19:15:00Z"));
  assert.deepEqual(sends, ["exact-item"]);
  assert.deepEqual(pushes, ["dispatch"]);
  assert.equal(result.sent, 1);
  assert.match(queries[0].query, /send_schedule_mode = 'exact' and send_at <=/);
  assert.match(queries[0].query, /send_schedule_mode = 'auto'/);
  console.log("Scheduled override checks passed: exact sends work outside the default hour and still use the atomic dispatcher.");
})().catch(error => { console.error(error); process.exitCode = 1; });
