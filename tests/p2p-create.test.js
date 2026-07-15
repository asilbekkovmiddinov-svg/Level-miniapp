const assert = require("node:assert/strict");
const test = require("node:test");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

const { validateP2PCreateOrder, optimisticP2POrder } = require("../miniapp/pages/p2p.js");

test("P2P create validation matches production payload", () => {
    const result = validateP2PCreateOrder({
        orderType: "sell", efcAmount: "100", priceUzs: "1 250",
        minTradeEfc: "10", responseMinutes: "15",
    });
    assert.deepEqual(result, {
        valid: true, orderType: "SELL", efcAmount: 100, priceUzs: 1250,
        minTradeEfc: 10, responseMinutes: 15,
    });
    assert.equal(validateP2PCreateOrder({ orderType: "SELL", efcAmount: 10, priceUzs: 1, minTradeEfc: 11, responseMinutes: 15 }).valid, false);
    assert.equal(validateP2PCreateOrder({ orderType: "BUY", efcAmount: 10, priceUzs: 1, minTradeEfc: 1, responseMinutes: 20 }).valid, false);
});

test("P2P create API sends initData and exact backend contract", async () => {
    const calls = [];
    const context = {
        window: { Telegram: { WebApp: { initData: "verified-init-data" } } },
        tg: { initData: "verified-init-data" }, API_URL: "https://backend.example",
        TELEGRAM_ID: 42,
        fetch: async (url, options) => {
            calls.push({ url, options });
            return { ok: true, json: async () => ({ success: true, order_id: 9 }) };
        },
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../miniapp/api.js"), "utf8"), context);
    await context.createP2POrder({ orderType: "BUY", efcAmount: 50, priceUzs: 1200, minTradeEfc: 5, responseMinutes: 30 });
    assert.equal(calls[0].url, "https://backend.example/p2p/create");
    assert.equal(calls[0].options.headers["X-Telegram-Init-Data"], "verified-init-data");
    assert.deepEqual(JSON.parse(calls[0].options.body), {
        telegram_id: 42, order_type: "BUY", efc_amount: 50, price_uzs: 1200,
        min_trade_efc: 5, response_minutes: 30,
    });
});

test("created P2P order has an immediate list representation", () => {
    const order = optimisticP2POrder({ order_id: 9 }, {
        orderType: "SELL", efcAmount: 100, priceUzs: 1000,
        minTradeEfc: 10, responseMinutes: 15,
    });
    assert.equal(order.id, 9);
    assert.equal(order.remaining_efc, 100);
    assert.equal(order.owner_is_online, true);
});

test("P2P page includes create, double-submit, loading and refresh flows", () => {
    const source = fs.readFileSync(path.join(__dirname, "../miniapp/pages/p2p.js"), "utf8");
    assert.match(source, /E’lon yaratish/);
    assert.match(source, /if \(p2pCreatePending\) return/);
    assert.match(source, /setP2PCreatePending\(true\)/);
    assert.match(source, /await loadP2POrders\(values\.orderType\)/);
    assert.match(source, /refreshP2P/);
});
