const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { WheelOrderAdminApi } = require("../miniapp/pages/wheel-order-admin-api.js");
function response(status, payload) { return { ok: status >= 200 && status < 300, status, json: async () => payload }; }

test("Wheel Order Admin API uses verified initData and exact backend routes", async () => {
    const calls = [];
    const api = new WheelOrderAdminApi({ baseUrl: "https://backend.example", initDataProvider: () => "verified-admin", fetchImpl: async (url, options) => { calls.push([url, options]); return response(200, { success: true, data: [] }); } });
    await api.list(); await api.cancel(17);
    assert.deepEqual(calls.map(([url, options]) => [url, options.method]), [["https://backend.example/admin/wheel/coin-orders", "GET"], ["https://backend.example/admin/wheel/coin-orders/17/cancel", "POST"]]);
    assert.ok(calls.every(([, options]) => options.headers["X-Telegram-Init-Data"] === "verified-admin"));
    assert.doesNotMatch(JSON.stringify(calls), /Internal-Api-Key/i);
});

test("Wheel Order Admin API exposes backend error and auth messages", async () => {
    const missing = new WheelOrderAdminApi({ initDataProvider: () => "", fetchImpl: async () => response(200, {}) });
    await assert.rejects(() => missing.list(), (error) => error.status === 401 && error.message === "Admin login required.");
    const forbidden = new WheelOrderAdminApi({ initDataProvider: () => "init", fetchImpl: async () => response(403, { detail: "Admin permission required." }) });
    await assert.rejects(() => forbidden.list(), (error) => error.status === 403 && error.message === "Admin permission required.");
    const conflict = new WheelOrderAdminApi({ initDataProvider: () => "init", fetchImpl: async () => response(409, { detail: "Order already completed" }) });
    await assert.rejects(() => conflict.cancel(1), /Order already completed/);
});

test("Admin page renders required fields, confirmation and immediate refresh flow", () => {
    const source = fs.readFileSync(path.join(__dirname, "../miniapp/pages/wheel-order-admin.js"), "utf8");
    const html = fs.readFileSync(path.join(__dirname, "../miniapp/index.html"), "utf8");
    const app = fs.readFileSync(path.join(__dirname, "../miniapp/app.js"), "utf8");
    const promotions = fs.readFileSync(path.join(__dirname, "../miniapp/pages/promotions-admin.js"), "utf8");
    const coins = fs.readFileSync(path.join(__dirname, "../miniapp/pages/coin-promotion-admin.js"), "utf8");
    for (const value of ["Wheel Coin Orders", "COIN AMOUNT", "Created At", "Updated At", "Telegram User", "CANCELLED", "Cancel", "Qayta urinish"]) assert.match(source, new RegExp(value));
    assert.match(source, /Ushbu Wheel Coin Order bekor qilinsinmi\?/); assert.match(source, /wheelOrderAdminApi\.cancel\(orderId\)/); assert.match(source, /promotionsAdminToast\("Wheel Coin Order bekor qilindi\."\)/);
    assert.match(html, /id="wheelOrderAdminPage"/); assert.match(html, /pages\/wheel-order-admin\.js/);
    assert.match(app, /query\.get\("admin"\) === "wheel-orders"/); assert.match(app, /case "wheel-orders-admin"/);
    assert.match(promotions, /openPage\('wheel-orders-admin'\)/); assert.match(coins, /openPage\('wheel-orders-admin'\)/);
});
