const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const Core = require("../miniapp/pages/promotions-user-core.js");
const { PromotionsUserApi } = require("../miniapp/pages/promotions-user-api.js");

const now = Date.parse("2026-07-19T12:00:00Z");

test("active promotions sort by priority and expired entries disappear", () => {
    const items = Core.normalize([
        { id: 1, title: "Expired", priority: 99, end_at: "2026-07-19T11:59:59Z" },
        { id: 2, title: "Second", priority: 5 },
        { id: 3, title: "First", priority: 20, end_at: "2026-07-20T00:00:00Z" },
    ], now);
    assert.deepEqual(items.map((item) => item.id), [3, 2]);
});

test("countdown updates deterministically and reports expiry", () => {
    assert.equal(Core.countdown("2026-07-20T13:02:03Z", now), "1 kun 01:02:03");
    assert.equal(Core.remaining("2026-07-19T11:00:00Z", now).expired, true);
    assert.equal(Core.countdown(null, now), "Doimiy taklif");
});

test("action routing covers backend button_action contract", () => {
    assert.deepEqual(Core.resolveAction({ button_action: "COIN_SHOP" }), { type: "page", target: "shop" });
    assert.deepEqual(Core.resolveAction({ button_action: "REFERRAL" }), { type: "page", target: "referral" });
    assert.deepEqual(Core.resolveAction({ button_action: "ARENA" }), { type: "page", target: "arena" });
    assert.deepEqual(Core.resolveAction({ button_action: "WHEEL" }), { type: "page", target: "wheel" });
    assert.deepEqual(Core.resolveAction({ button_action: "PROFILE" }), { type: "page", target: "profile" });
    assert.deepEqual(Core.resolveAction({ button_action: "URL", button_target: "https://example.com" }), { type: "url", target: "https://example.com" });
    assert.deepEqual(Core.resolveAction({ button_action: "CUSTOM", button_target: "page:wallet" }), { type: "page", target: "wallet" });
    assert.equal(Core.resolveAction({ button_action: "URL", button_target: "javascript:alert(1)" }).type, "none");
});

test("last successful promotions cache supports offline and rejects stale data", () => {
    const memory = new Map();
    const storage = { setItem: (key, value) => memory.set(key, value), getItem: (key) => memory.get(key) };
    Core.save(storage, [{ id: 7, title: "Cached", priority: 1 }], now);
    assert.equal(Core.load(storage, now + 1000)[0].title, "Cached");
    assert.deepEqual(Core.load(storage, now + 86400001), []);
});

test("public API sends authenticated active, view and click requests", async () => {
    const calls = [];
    const api = new PromotionsUserApi({ baseUrl: "https://backend.example/", initDataProvider: () => "verified-init-data", fetchImpl: async (url, options) => {
        calls.push([url, options]);
        return url.endsWith("/active") ? { ok: true, status: 200, json: async () => [] } : { ok: true, status: 204 };
    } });
    await api.active(); await api.view(4); await api.click(4);
    assert.deepEqual(calls.map((call) => [call[0], call[1].method]), [["https://backend.example/promotions/active", "GET"], ["https://backend.example/promotions/4/view", "POST"], ["https://backend.example/promotions/4/click", "POST"]]);
    assert.ok(calls.every((call) => call[1].headers["X-Telegram-Init-Data"] === "verified-init-data"));
    assert.doesNotMatch(JSON.stringify(calls), /Internal-Api-Key/i);
});

test("user Promotions UI includes carousel, swipe, loop, retry and auto refresh", () => {
    const source = fs.readFileSync(path.join(__dirname, "../miniapp/pages/promotions-user.js"), "utf8");
    const index = fs.readFileSync(path.join(__dirname, "../miniapp/index.html"), "utf8");
    for (const expected of ["pux-carousel", "touchstart", "touchend", "data-carousel-index", "IntersectionObserver", "data-promotions-retry", "setInterval(() => loadUserPromotions(), 30000)", "loadPromotionsPage", "startPromotionsAutoRefresh"]) assert.match(source, new RegExp(expected.replace(/[()]/g, "\\$&")));
    assert.match(index, /id="homePromotions"/); assert.match(index, /id="promotionsPage"/);
    assert.match(index, /promotions-user\.css/); assert.match(index, /pages\/promotions-user\.js/);
});
