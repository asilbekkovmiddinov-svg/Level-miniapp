const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("chat API uses authenticated wallet requests", () => {
    const source=fs.readFileSync(path.join(__dirname,"../miniapp/api.js"),"utf8");
    assert.match(source,/coin-order-chat/); assert.match(source,/sendCoinOrderMessage/);
    assert.match(source,/markCoinOrderMessagesRead/);
    assert.match(source,/submitCoinOrderDetails/);
});

test("SHOP credentials are collected only inside WAITING_DETAILS order chat", () => {
    const orders=fs.readFileSync(path.join(__dirname,"../miniapp/pages/orders.js"),"utf8");
    const shop=fs.readFileSync(path.join(__dirname,"../miniapp/pages/shop.js"),"utf8");
    assert.match(orders,/id="coinDetailsForm"/);
    assert.match(orders,/result\.status !== "WAITING_DETAILS"/);
    assert.match(orders,/await submitCoinOrderDetails/);
    assert.doesNotMatch(shop,/openShopCredentialForm/);
    assert.doesNotMatch(shop,/submitShopCredentialOrder/);
});

test("Telegram notification deep link opens the exact Coin Order chat", () => {
    const source=fs.readFileSync(path.join(__dirname,"../miniapp/app.js"),"utf8");
    assert.match(source,/new URLSearchParams\(window\.location\.search\)/);
    assert.match(source,/params\.get\("coin_order_type"\)/);
    assert.match(source,/params\.get\("coin_order_id"\)/);
    assert.match(source,/await loadOrdersPage\(\)/);
    assert.match(source,/type === "SHOP" \? "shop" : "wheel_coin"/);
    assert.match(source,/await openCoinOrderChatById/);
});
