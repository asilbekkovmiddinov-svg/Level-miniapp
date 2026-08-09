const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "../miniapp/pages/promotions-admin.js"), "utf8");
const api = fs.readFileSync(path.join(__dirname, "../miniapp/pages/promotions-admin-api.js"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "../miniapp/promotions-admin.css"), "utf8");

test("admin dashboard loads protected user metrics with existing Telegram admin client", () => {
    assert.match(api, /userMetrics\(\) \{ return this\.request\("\/admin\/metrics\/users"\); \}/);
    assert.match(source, /promotionsAdminApi\.userMetrics\(\)/);
    assert.match(source, /Promise\.all\(\[/);
    assert.doesNotMatch(api, /X-Internal-Api-Key|adminTelegramIds|allowlist/i);
});

test("admin dashboard renders total and trailing-30-day active users", () => {
    assert.match(source, /JAMI FOYDALANUVCHILAR/);
    assert.match(source, /OYLIK FAOL FOYDALANUVCHILAR/);
    assert.match(source, /metrics\.total_users/);
    assert.match(source, /metrics\.monthly_active_users/);
    assert.match(source, /metrics\.active_window_days \|\| 30/);
});

test("user metrics cards remain compact on narrow screens", () => {
    assert.match(css, /\.pac-user-metrics\{display:grid;grid-template-columns:1fr 1fr/);
    assert.match(css, /@media\(max-width:380px\)\{\.pac-user-metrics/);
});


test("total users card opens an admin-only searchable directory", () => {
    assert.match(source, /onclick="openAdminUserDirectory\(\)"/);
    assert.match(api, /userList\(\{ q = "", status = "ALL", page = 1, perPage = 20 \} = \{\}\)/);
    assert.match(api, /\/admin\/metrics\/users\/list/);
    assert.match(source, /Username yoki Telegram ID/);
    assert.match(source, /option value="ACTIVE">Faol/);
    assert.match(source, /option value="INACTIVE">Nofaol/);
});

test("user directory renders safe profile fields and pagination", () => {
    assert.match(source, /user\.username/);
    assert.match(source, /user\.telegram_id/);
    assert.match(source, /user\.last_seen_at/);
    assert.match(source, /user\.is_active/);
    assert.match(source, /changeAdminUserPage/);
    assert.match(css, /\.pac-users-overlay/);
    assert.match(css, /@media\(max-width:380px\).*\.pac-users-sheet/s);
});
