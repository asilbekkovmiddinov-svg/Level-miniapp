const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("chat API uses authenticated wallet requests", () => {
    const source=fs.readFileSync(path.join(__dirname,"../miniapp/api.js"),"utf8");
    assert.match(source,/coin-order-chat/); assert.match(source,/sendCoinOrderMessage/);
    assert.match(source,/markCoinOrderMessagesRead/);
});
