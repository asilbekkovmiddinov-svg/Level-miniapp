const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

test("Shop collects credentials in memory and creates WAITING_OTP contract", () => {
    const shop = fs.readFileSync("miniapp/pages/shop.js", "utf8");
    const api = fs.readFileSync("miniapp/api.js", "utf8");
    assert.match(shop, /openShopCredentialForm/);
    assert.match(shop, /type="password"/);
    assert.match(shop, /ANDROID/); assert.match(shop, /IOS/);
    assert.match(shop, /GLOBAL/); assert.match(shop, /JAPAN/);
    assert.match(api, /konami_login: credentials\.email/);
    assert.match(api, /konami_password: credentials\.password/);
    assert.doesNotMatch(shop, /localStorage|sessionStorage|indexedDB/);
});
