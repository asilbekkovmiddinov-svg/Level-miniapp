const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("paid Shop collects details before OTP chat", () => {
    const source=fs.readFileSync(path.join(__dirname,"../miniapp/pages/shop.js"),"utf8");
    assert.match(source,/openShopOrderDetails/); assert.match(source,/submitShopOrderDetails/);
    assert.match(source,/ANDROID/); assert.match(source,/IOS/);
    assert.match(source,/GLOBAL/); assert.match(source,/JAPAN/);
    assert.match(source,/type="password"/);
});

test("chat API uses authenticated wallet requests", () => {
    const source=fs.readFileSync(path.join(__dirname,"../miniapp/api.js"),"utf8");
    assert.match(source,/coin-order-chat/); assert.match(source,/sendCoinOrderMessage/);
    assert.match(source,/markCoinOrderMessagesRead/);
});
