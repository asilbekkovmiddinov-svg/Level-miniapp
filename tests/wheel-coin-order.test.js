const assert = require("node:assert/strict");
const test = require("node:test");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

test("Coin reward order uses authoritative Wheel endpoint with verified identity", async () => {
    const calls = [];
    const context = {
        window: { Telegram: { WebApp: { initData: "verified-wheel-init" } } },
        tg: { initData: "verified-wheel-init" },
        API_URL: "https://backend.example",
        TELEGRAM_ID: 42,
        fetch: async (url, options) => {
            calls.push({ url, options });
            return { ok: true, json: async () => ({ success: true, data: { status: "PENDING" } }) };
        },
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../miniapp/api.js"), "utf8"), context);

    await context.createCoinRewardOrder({
        spinId: 731,
        email: "player@example.com",
        password: "one-time-secret",
        region: "Global",
        platform: "Android",
    });
    await context.getPendingWheelCoinOrder();

    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, "https://backend.example/wheel/coin-order/details");
    assert.equal(calls[1].url, "https://backend.example/wheel/coin-order/pending");
    assert.equal(calls[0].options.headers["X-Telegram-Init-Data"], "verified-wheel-init");
    assert.equal(calls[1].options.headers["X-Telegram-Init-Data"], "verified-wheel-init");
    assert.deepEqual(JSON.parse(calls[0].options.body), {
        spin_id: 731,
        konami_login: "player@example.com",
        konami_password: "one-time-secret",
        region: "Global",
        platform: "Android",
    });
});

test("Wheel wizard keeps spin identity and restores WAITING_DETAILS after reload", () => {
    const source = fs.readFileSync(path.join(__dirname, "../miniapp/pages/wheel.js"), "utf8");
    assert.match(source, /spinId: Number\(source\.spin_id/);
    assert.match(source, /await restorePendingWheelCoinOrder\(\)/);
    assert.match(source, /"WAITING_DETAILS", "PENDING", "CLAIMED"/);
    assert.match(source, /spin_id: pending\.spin_id/);
    assert.match(source, /pending\.status !== "WAITING_DETAILS"\) renderWheelCoinSuccess/);
    assert.match(source, /spinId: state\.spinId/);
    assert.doesNotMatch(source, /findWheelCoinProduct/);
});

test("Coin Shop APIs use verified initData, authenticated history and idempotency", async () => {
    const calls = [];
    const context = {
        window: { Telegram: { WebApp: { initData: "verified-shop-init" } } },
        tg: { initData: "verified-shop-init" },
        API_URL: "https://backend.example",
        TELEGRAM_ID: 42,
        fetch: async (url, options) => {
            calls.push({ url, options });
            return { ok: true, json: async () => ({ success: true, data: [] }) };
        },
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../miniapp/api.js"), "utf8"), context);

    await context.getProducts();
    await context.createOrder(7, "Japan", "coin-order-key");
    await context.getUserOrders();

    assert.deepEqual(calls.map((call) => call.url), [
        "https://backend.example/products/active",
        "https://backend.example/orders/create",
        "https://backend.example/orders/user",
    ]);
    calls.forEach((call) => {
        assert.equal(call.options.headers["X-Telegram-Init-Data"], "verified-shop-init");
    });
    assert.equal(calls[1].options.headers["Idempotency-Key"], "coin-order-key");
    assert.deepEqual(JSON.parse(calls[1].options.body), { product_id: 7, region: "Japan" });
});

test("Coin Shop blocks double submit and reuses the request key after failure", async () => {
    const calls = [];
    let release;
    const pending = new Promise((resolve) => { release = resolve; });
    const context = {
        document: { querySelectorAll: () => [] },
        Modal: { success() {}, error() {} },
        walletIdempotencyKey: () => "stable-order-key",
        createOrder: async (...args) => {
            calls.push(args);
            return pending;
        },
        console,
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../miniapp/pages/shop.js"), "utf8"), context);

    const first = context.buyProduct(7, "Japan");
    const duplicate = context.buyProduct(7, "Japan");
    assert.equal(calls.length, 1);
    assert.equal(calls[0][2], "stable-order-key");
    release({ success: true });
    await Promise.all([first, duplicate]);
    assert.equal(calls.length, 1);
});
