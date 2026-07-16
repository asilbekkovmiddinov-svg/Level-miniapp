const assert = require("node:assert/strict");
const test = require("node:test");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

test("Coin reward order uses existing endpoint with initData and credentials only in submit body", async () => {
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
        productId: 130,
        email: "player@example.com",
        password: "one-time-secret",
        region: "Global",
        platform: "Android",
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://backend.example/orders/create");
    assert.equal(calls[0].options.headers["X-Telegram-Init-Data"], "verified-wheel-init");
    assert.deepEqual(JSON.parse(calls[0].options.body), {
        telegram_id: 42,
        product_id: 130,
        region: "Global",
        login: "player@example.com",
        password: "one-time-secret",
        platform: "Android",
    });
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
