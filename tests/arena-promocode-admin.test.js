const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const {
    ArenaPromocodeAdminApi,
    ArenaPromocodeAdminError,
    arenaPromocodeAdminEscape,
} = require("../miniapp/pages/arena-promocode-admin.js");

function response(payload, status = 200) {
    return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

test("admin API uses Telegram auth for create and status actions", async () => {
    const calls = [];
    const api = new ArenaPromocodeAdminApi({
        baseUrl: "https://backend.example/",
        initDataProvider: () => "admin-init-data",
        fetchImpl: async (url, options) => {
            calls.push({ url, options });
            return response([]);
        },
    });

    await api.list();
    await api.create({ code: "ARENA10", ticket_amount: 10, usage_limit: 100, expires_at: null });
    await api.deactivate("safe-id");
    await api.activate("safe-id");

    assert.deepEqual(calls.map((call) => [new URL(call.url).pathname, call.options.method]), [
        ["/admin/arena-promocodes", "GET"],
        ["/admin/arena-promocodes", "POST"],
        ["/admin/arena-promocodes/safe-id/deactivate", "POST"],
        ["/admin/arena-promocodes/safe-id/activate", "POST"],
    ]);
    assert.ok(calls.every((call) => call.options.headers["X-Telegram-Init-Data"] === "admin-init-data"));
    assert.deepEqual(JSON.parse(calls[1].options.body), {
        code: "ARENA10", ticket_amount: 10, usage_limit: 100, expires_at: null,
    });
});

test("admin API fails closed without Telegram initData", async () => {
    const api = new ArenaPromocodeAdminApi({
        initDataProvider: () => "",
        fetchImpl: async () => { throw new Error("must not run"); },
    });
    await assert.rejects(() => api.list(), (error) => {
        assert.ok(error instanceof ArenaPromocodeAdminError);
        assert.equal(error.status, 401);
        return true;
    });
});

test("promocode admin is mounted and routed through the authenticated admin UI", () => {
    const html = fs.readFileSync("miniapp/index.html", "utf8");
    const app = fs.readFileSync("miniapp/app.js", "utf8");
    const promotions = fs.readFileSync("miniapp/pages/promotions-admin.js", "utf8");
    const source = fs.readFileSync("miniapp/pages/arena-promocode-admin.js", "utf8");

    assert.match(html, /id="arenaPromocodeAdminPage"/);
    assert.match(html, /pages\/arena-promocode-admin\.js/);
    assert.match(app, /query\.get\("admin"\) === "arena-promocodes"/);
    assert.match(app, /case "arena-promocodes-admin"/);
    assert.match(promotions, /openPage\('arena-promocodes-admin'\)/);
    assert.match(source, /\/admin\/arena-promocodes/);
    assert.doesNotMatch(source, /X-Internal-Api-Key|ADMIN_TELEGRAM_IDS/);
    assert.equal(arenaPromocodeAdminEscape('<script>"'), "&lt;script&gt;&quot;");
});
