const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const {
    normalizeOrdersHistory,
    normalizeTransactionHistory,
    ordersDateTime,
} = require("../miniapp/pages/orders.js");

test("orders history combines every supported production source newest first", () => {
    const history = normalizeOrdersHistory({
        transactions: [
            { id: 1, transaction_type: "DEPOSIT_APPROVED", amount: 20000, currency: "UZS", status: "SUCCESS", created_at: "2026-01-01T08:00:00Z" },
            { id: 2, transaction_type: "WITHDRAW_REJECTED", amount: 15000, currency: "UZS", status: "REJECTED", created_at: "2026-01-02T08:00:00Z" },
            { id: 3, transaction_type: "WHEEL_REWARD", amount: 5, currency: "EFC", status: "SUCCESS", created_at: "2026-01-03T08:00:00Z" },
        ],
        shop: { data: [{ id: 4, price_uzs: 90000, status: "PENDING", created_at: "2026-01-04T08:00:00Z" }] },
        p2pOrders: { data: [{ id: 5, efc_amount: 50, status: "OPEN", created_at: "2026-01-05T08:00:00Z" }] },
        p2pTrades: { data: [{ id: 6, efc_amount: 25, status: "COMPLETED", created_at: "2026-01-06T08:00:00Z" }] },
        matches: [{ id: 7, efc_amount: 100, status: "PLAYING", created_at: "2026-01-07T08:00:00Z" }],
    });
    assert.deepEqual(new Set(history.map((item) => item.kind)), new Set([
        "deposit", "withdraw", "wheel", "shop", "p2p_order", "p2p_trade", "arena",
    ]));
    assert.equal(history[0].kind, "arena");
    assert.equal(history.at(-1).kind, "deposit");
});

test("unrelated wallet transactions are not duplicated into orders", () => {
    const history = normalizeTransactionHistory([
        { id: 1, transaction_type: "MATCH_LOCK", amount: 50 },
        { id: 2, transaction_type: "P2P_CREATE", amount: 20 },
    ]);
    assert.deepEqual(history, []);
});

test("orders date renders in Tashkent timezone", () => {
    assert.match(ordersDateTime("2026-01-01T20:30:00Z"), /02[./]01[./]2026/);
    assert.match(ordersDateTime("2026-01-01T20:30:00Z"), /01:30/);
});

test("orders page uses production APIs, detail, refresh and premium empty state", () => {
    const source = fs.readFileSync(path.join(__dirname, "../miniapp/pages/orders.js"), "utf8");
    const api = fs.readFileSync(path.join(__dirname, "../miniapp/api.js"), "utf8");
    assert.doesNotMatch(source, /title:\s*["']Wallet["']/);
    assert.doesNotMatch(source, /Wallet ACTIVE/);
    assert.match(source, /getWalletTransactions/);
    assert.match(source, /getUserOrders/);
    assert.match(source, /getMyP2POrders/);
    assert.match(source, /getMyP2PTrades/);
    assert.match(source, /arenaApiClient\.myMatches/);
    assert.match(source, /openOrderDetails/);
    assert.match(source, /refreshOrders/);
    assert.match(source, /Tarix hali bo‘sh/);
    assert.match(api, /\/orders\/user\/\$\{TELEGRAM_ID\}/);
});
