const assert = require("node:assert/strict");
const test = require("node:test");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

const {
    p2pTradeActionLabel,
    validateP2PTradeAmount,
    p2pTradeResponse,
} = require("../miniapp/pages/p2p.js");

test("P2P order type maps to the user trade action", () => {
    assert.equal(p2pTradeActionLabel("SELL"), "Sotib olish");
    assert.equal(p2pTradeActionLabel("BUY"), "Sotish");
});

test("P2P trade amount enforces backend order minimum and remaining maximum", () => {
    assert.deepEqual(validateP2PTradeAmount("25", 10, 50), { valid: true, amount: 25 });
    assert.equal(validateP2PTradeAmount(9, 10, 50).valid, false);
    assert.match(validateP2PTradeAmount(9, 10, 50).message, /Minimal/);
    assert.equal(validateP2PTradeAmount(51, 10, 50).valid, false);
    assert.match(validateP2PTradeAmount(51, 10, 50).message, /Maksimal/);
});

test("P2P trade API sends initData and exact production contract", async () => {
    const calls = [];
    const context = {
        window: { Telegram: { WebApp: { initData: "verified-init-data" } } },
        tg: { initData: "verified-init-data" }, API_URL: "https://backend.example",
        TELEGRAM_ID: 42,
        fetch: async (url, options) => {
            calls.push({ url, options });
            return { ok: true, json: async () => ({ success: true, trade_id: 17 }) };
        },
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../miniapp/api.js"), "utf8"), context);
    await context.createP2PTrade(9, 25);
    assert.equal(calls[0].url, "https://backend.example/p2p/9/trade");
    assert.equal(calls[0].options.headers["X-Telegram-Init-Data"], "verified-init-data");
    assert.deepEqual(JSON.parse(calls[0].options.body), { telegram_id: 42, efc_amount: 25 });
});

test("P2P trade response supports current backend response envelopes", () => {
    assert.equal(p2pTradeResponse({ data: { id: 1 } }).id, 1);
    assert.equal(p2pTradeResponse({ trade: { id: 2 } }).id, 2);
    assert.equal(p2pTradeResponse({ trade_id: 3 }).trade_id, 3);
});

test("P2P trade flow guards submit, reports success and refreshes backend list", () => {
    const source = fs.readFileSync(path.join(__dirname, "../miniapp/pages/p2p.js"), "utf8");
    assert.match(source, /if \(p2pTradePending\) return/);
    assert.match(source, /setP2PTradePending\(true\)/);
    assert.match(source, /await createP2PTrade/);
    assert.match(source, /await loadP2POrders\(currentP2PType\)/);
    assert.match(source, /Modal\.success/);
    assert.match(source, /remaining <= 0/);
});
