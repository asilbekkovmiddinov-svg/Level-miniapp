const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

test("Shop V1 exposes only the compact safe order confirmation", () => {
    const shop = fs.readFileSync("miniapp/pages/shop.js", "utf8");
    const api = fs.readFileSync("miniapp/api.js", "utf8");
    const orders = fs.readFileSync("miniapp/pages/orders.js", "utf8");
    assert.doesNotMatch(shop, /openShopCredentialForm/);
    assert.doesNotMatch(orders, /coinDetailsForm|type="password"/);
    assert.doesNotMatch(api, /submitCoinOrderDetails/);
    assert.doesNotMatch(orders, /type === "SHOP"|shopChat/);
    assert.doesNotMatch(shop, /localStorage|sessionStorage|indexedDB/);
    assert.match(shop, /Order raqami/);
    assert.match(shop, /Locked narx/);
    assert.match(shop, /Admin siz bilan Telegram orqali bog‘lanadi/);
    assert.doesNotMatch(shop, /Tartib raqami|Begona foydalanuvchilarga ma’lumot bermang/);
    assert.doesNotMatch(shop, /openCoinOrderChatById|Buyurtma suhbati/);
});
