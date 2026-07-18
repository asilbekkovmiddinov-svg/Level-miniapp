const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

test("Shop has no separate credential or details form", () => {
    const shop = fs.readFileSync("miniapp/pages/shop.js", "utf8");
    const api = fs.readFileSync("miniapp/api.js", "utf8");
    const orders = fs.readFileSync("miniapp/pages/orders.js", "utf8");
    assert.doesNotMatch(shop, /openShopCredentialForm/);
    assert.doesNotMatch(orders, /coinDetailsForm|type="password"/);
    assert.doesNotMatch(api, /submitCoinOrderDetails/);
    assert.match(orders, /result\.status === "CLAIMED"/);
    assert.doesNotMatch(shop, /localStorage|sessionStorage|indexedDB/);
    assert.match(shop, /Operator tez orada buyurtma suhbati orqali siz bilan bog‘lanadi/);
});
