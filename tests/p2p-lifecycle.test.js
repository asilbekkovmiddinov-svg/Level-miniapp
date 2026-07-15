const assert = require("node:assert/strict");
const test = require("node:test");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

const {
    p2pTradesArray,
    p2pTradeRole,
    p2pTradePayerRole,
    p2pTradeDeadline,
    p2pTradeLifecycleActions,
    p2pTradeStage,
} = require("../miniapp/pages/p2p.js");

test("P2P lifecycle maps participant roles and BUY/SELL payer", () => {
    const trade = { owner_id: 10, requester_id: 20, order_type: "SELL" };
    assert.equal(p2pTradeRole(trade, 10), "owner");
    assert.equal(p2pTradeRole(trade, 20), "requester");
    assert.equal(p2pTradePayerRole(trade), "requester");
    assert.equal(p2pTradePayerRole({ order_type: "BUY" }), "owner");
});

test("P2P lifecycle actions follow status and participant state", () => {
    const pending = { status: "PENDING", owner_id: 10, requester_id: 20, order_type: "SELL" };
    assert.deepEqual(p2pTradeLifecycleActions(pending, 10).map((item) => item.action), ["approve", "reject"]);
    assert.deepEqual(p2pTradeLifecycleActions(pending, 20).map((item) => item.action), ["reject"]);
    const payment = { ...pending, status: "OWNER_APPROVED", requester_status: "PENDING", owner_status: "APPROVED" };
    assert.equal(p2pTradeLifecycleActions(payment, 20)[0].label, "To‘lov qildim");
    const confirmation = { ...payment, requester_status: "COMPLETED" };
    assert.equal(p2pTradeLifecycleActions(confirmation, 10)[0].label, "To‘lovni tasdiqlash");
    assert.deepEqual(p2pTradeLifecycleActions({ ...pending, status: "COMPLETED" }, 10), []);
});

test("P2P lifecycle stage and deadline use backend fields", () => {
    assert.equal(p2pTradeStage({ status: "PENDING" }), "PENDING");
    assert.equal(p2pTradeStage({ status: "OWNER_APPROVED", order_type: "SELL", requester_status: "PENDING" }), "PAYMENT");
    assert.equal(p2pTradeStage({ status: "OWNER_APPROVED", order_type: "SELL", requester_status: "COMPLETED" }), "CONFIRMATION");
    assert.equal(p2pTradeStage({ status: "TIMEOUT" }), "TIMEOUT");
    assert.equal(p2pTradeDeadline({ owner_expires_at: "owner", expires_at: "fallback" }, "owner"), "owner");
    assert.deepEqual(p2pTradesArray({ trades: [{ id: 1 }] }), [{ id: 1 }]);
});

test("P2P lifecycle API actions preserve initData and backend contract", async () => {
    const calls = [];
    const context = {
        window: { Telegram: { WebApp: { initData: "verified-init-data" } } },
        tg: { initData: "verified-init-data" }, API_URL: "https://backend.example", TELEGRAM_ID: 42,
        fetch: async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => ({ success: true }) }; },
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../miniapp/api.js"), "utf8"), context);
    await context.p2pTradeAction(7, "approve");
    await context.p2pTradeAction(7, "confirm");
    await context.p2pTradeAction(7, "reject");
    assert.deepEqual(calls.map((call) => call.url), [
        "https://backend.example/p2p/trade/7/approve",
        "https://backend.example/p2p/trade/7/confirm",
        "https://backend.example/p2p/trade/7/reject",
    ]);
    for (const call of calls) {
        assert.equal(call.options.headers["X-Telegram-Init-Data"], "verified-init-data");
        assert.deepEqual(JSON.parse(call.options.body), { telegram_id: 42 });
    }
});

test("P2P details include live refresh, countdown, timeline and history", () => {
    const source = fs.readFileSync(path.join(__dirname, "../miniapp/pages/p2p.js"), "utf8");
    assert.match(source, /P2P Trade Details/);
    assert.match(source, /setInterval\(refreshP2PTradeDetails, 10000\)/);
    assert.match(source, /setInterval\(updateP2PTradeCountdown, 1000\)/);
    assert.match(source, /p2pTradeTimeline/);
    assert.match(source, /openP2PTradesHistory/);
    assert.match(source, /Tarix hali bo‘sh/);
});
