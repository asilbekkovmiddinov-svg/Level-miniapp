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
