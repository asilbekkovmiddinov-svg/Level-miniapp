const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("Wheel chat API uses authenticated wallet requests", () => {
    const source=fs.readFileSync(path.join(__dirname,"../miniapp/api.js"),"utf8");
    assert.match(source,/coin-order-chat/); assert.match(source,/sendCoinOrderMessage/);
    assert.match(source,/markCoinOrderMessagesRead/);
    assert.doesNotMatch(source,/submitCoinOrderDetails/);
});

test("SHOP has no Order Chat, credential or details UI", () => {
    const orders=fs.readFileSync(path.join(__dirname,"../miniapp/pages/orders.js"),"utf8");
    const shop=fs.readFileSync(path.join(__dirname,"../miniapp/pages/shop.js"),"utf8");
    assert.doesNotMatch(orders,/coinDetailsForm|submitCoinOrderDetails/);
    assert.doesNotMatch(orders,/type === "SHOP"|shopChat/);
    assert.doesNotMatch(shop,/openShopCredentialForm/);
    assert.doesNotMatch(shop,/submitShopCredentialOrder/);
});

test("Telegram deep link opens only the Wheel Coin chat", () => {
    const source=fs.readFileSync(path.join(__dirname,"../miniapp/app.js"),"utf8");
    assert.match(source,/new URLSearchParams\(window\.location\.search\)/);
    assert.match(source,/params\.get\("coin_order_type"\)/);
    assert.match(source,/params\.get\("coin_order_id"\)/);
    assert.match(source,/await loadOrdersPage\(\)/);
    assert.match(source,/if \(type === "WHEEL"\)/);
    assert.doesNotMatch(source,/type === "SHOP" \? "shop"/);
    assert.match(source,/await openCoinOrderChatById/);
});
