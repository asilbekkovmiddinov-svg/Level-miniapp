const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

test("Shop creates first and collects credentials only in Order Chat", () => {
    const shop = fs.readFileSync("miniapp/pages/shop.js", "utf8");
    const api = fs.readFileSync("miniapp/api.js", "utf8");
    const orders = fs.readFileSync("miniapp/pages/orders.js", "utf8");
    assert.doesNotMatch(shop, /openShopCredentialForm/);
    assert.match(orders, /id="coinDetailsForm"/);
    assert.match(orders, /type="password"/);
    assert.match(api, /submitCoinOrderDetails/);
    assert.match(api, /konami_login: email/);
    assert.match(api, /konami_password: password/);
    assert.doesNotMatch(shop, /localStorage|sessionStorage|indexedDB/);
    assert.match(shop, /Operator tez orada buyurtma suhbati orqali siz bilan bog‘lanadi/);
});
