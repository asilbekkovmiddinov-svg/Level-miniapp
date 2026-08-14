const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const api = fs.readFileSync(path.join(__dirname, "../miniapp/pages/promotions-admin-api.js"), "utf8");

test("admin wallet audit uses Telegram-authenticated admin endpoint", () => {
  assert.match(api, /userWalletAudit\(q, limit = 100\)/);
  assert.match(api, /\/admin\/metrics\/users\/audit\?/);
  assert.match(api, /X-Telegram-Init-Data/);
  assert.doesNotMatch(api, /X-Internal-Api-Key/);
});
