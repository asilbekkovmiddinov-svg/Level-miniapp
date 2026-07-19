const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const Core = require("../miniapp/pages/coin-promotion-admin-core.js");
const { CoinPromotionAdminApi } = require("../miniapp/pages/coin-promotion-admin-api.js");

function response(status, payload) {
    return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

test("normalizes package and authoritative inventory response", () => {
    const item = Core.normalizeList([{
        id: 4, coin_package_id: 7, title: "Flash", status: "ACTIVE",
        original_price: "25000", promotion_price: "15000", total_quantity: 10,
        reserved_quantity: 2, sold_quantity: 3, remaining_quantity: 5, per_user_limit: 1,
    }])[0];
    assert.equal(item.promotion_price, 15000);
    assert.equal(item.reserved_quantity, 2);
    assert.equal(item.sold_quantity, 3);
    assert.equal(item.remaining_quantity, 5);
});

test("form payload uses selected backend package price and excludes counters", () => {
    const packages = Core.normalizePackages({ data: [{ id: 7, title: "130 Coins", price: 25000, coin_amount: 130 }] });
    const value = Core.payload({
        coin_package_id: "7", title: "Flash", promotion_price: "15000",
        total_quantity: "10", per_user_limit: "2",
        start_at: "2026-07-20T10:00", end_at: "2026-07-21T10:00",
    }, packages);
    assert.equal(value.original_price, 25000);
    assert.equal(value.promotion_price, 15000);
    assert.equal(value.coin_package_id, 7);
    assert.equal(value.reserved_quantity, undefined);
    assert.equal(value.sold_quantity, undefined);
    assert.equal(value.remaining_quantity, undefined);
    assert.equal(value.status, undefined);
});

test("Admin API uses exact backend routes and verified initData", async () => {
    const calls = [];
    const api = new CoinPromotionAdminApi({
        baseUrl: "https://backend.example", initDataProvider: () => "verified-admin",
        fetchImpl: async (url, options) => { calls.push([url, options]); return response(200, []); },
    });
    await api.list(); await api.packages(); await api.create({ title: "A" }); await api.update(4, { title: "B" });
    await api.activate(4); await api.pause(4); await api.deactivate(4); await api.remove(4); await api.restore(4);
    assert.deepEqual(calls.map(([url, options]) => [url, options.method]), [
        ["https://backend.example/admin/coin-promotions?include_deleted=true", "GET"],
        ["https://backend.example/products/active", "GET"],
        ["https://backend.example/admin/coin-promotions", "POST"],
        ["https://backend.example/admin/coin-promotions/4", "PUT"],
        ["https://backend.example/admin/coin-promotions/4/activate", "POST"],
        ["https://backend.example/admin/coin-promotions/4/pause", "POST"],
        ["https://backend.example/admin/coin-promotions/4/deactivate", "POST"],
        ["https://backend.example/admin/coin-promotions/4", "DELETE"],
        ["https://backend.example/admin/coin-promotions/4/restore", "POST"],
    ]);
    assert.ok(calls.every(([, options]) => options.headers["X-Telegram-Init-Data"] === "verified-admin"));
    assert.doesNotMatch(JSON.stringify(calls), /Internal-Api-Key/i);
});

test("Admin API maps authentication errors", async () => {
    const missing = new CoinPromotionAdminApi({ initDataProvider: () => "", fetchImpl: async () => response(200, {}) });
    await assert.rejects(() => missing.list(), (error) => error.status === 401 && error.message === "Admin login required.");
    const forbidden = new CoinPromotionAdminApi({ initDataProvider: () => "init", fetchImpl: async () => response(403, {}) });
    await assert.rejects(() => forbidden.list(), (error) => error.status === 403 && error.message === "Admin permission required.");
});

test("Coin Promotion Admin page exposes required premium management UX", () => {
    const source = fs.readFileSync(path.join(__dirname, "../miniapp/pages/coin-promotion-admin.js"), "utf8");
    const css = fs.readFileSync(path.join(__dirname, "../miniapp/coin-promotion-admin.css"), "utf8");
    const html = fs.readFileSync(path.join(__dirname, "../miniapp/index.html"), "utf8");
    const app = fs.readFileSync(path.join(__dirname, "../miniapp/app.js"), "utf8");
    for (const expected of ["Coin Promotions", "Original", "Promotion", "Qoldi", "Reserved", "Sotilgan", "START", "END", "openCoinPromotionForm", "saveCoinPromotion", "activate", "pause", "deactivate", "remove", "restore", "Qayta urinish"]) assert.match(source, new RegExp(expected));
    assert.match(css, /cpa-skeleton/); assert.match(css, /prefers-reduced-motion/);
    assert.match(html, /id="coinPromotionAdminPage"/); assert.match(html, /coin-promotion-admin\.js/);
    assert.match(app, /query\.get\("admin"\) === "coin-promotions"/);
});
