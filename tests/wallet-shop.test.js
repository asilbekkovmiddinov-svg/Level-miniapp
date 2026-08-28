const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const { WalletShopApi, WalletShopApiError } = require("../miniapp/pages/wallet-shop-api.js");
const {
    walletShopAttempt,
    walletShopIdempotencyKey,
    walletShopNumber,
} = require("../miniapp/pages/wallet-shop.js");

function response(payload, status = 200) {
    return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

test("user shop API authenticates catalog and idempotent purchases", async () => {
    const calls = [];
    const api = new WalletShopApi({
        baseUrl: "https://backend.example/",
        initDataProvider: () => "verified-init-data",
        fetchImpl: async (url, options) => {
            calls.push({ url, options });
            return response({ status: "COMPLETED" });
        },
    });
    await api.catalog();
    await api.buyEfc(10, "efc-once");
    await api.buyTickets(2, "ticket-once");

    assert.deepEqual(calls.map((call) => [new URL(call.url).pathname, call.options.method]), [
        ["/wallet-shop/catalog", "GET"],
        ["/wallet-shop/buy-efc", "POST"],
        ["/wallet-shop/buy-ticket", "POST"],
    ]);
    assert.ok(calls.every((call) => call.options.headers["X-Telegram-Init-Data"] === "verified-init-data"));
    assert.equal(calls[1].options.headers["Idempotency-Key"], "efc-once");
    assert.equal(calls[2].options.headers["Idempotency-Key"], "ticket-once");
    assert.deepEqual(JSON.parse(calls[1].options.body), { efc_amount: 10 });
    assert.deepEqual(JSON.parse(calls[2].options.body), { quantity: 2 });
    assert.doesNotMatch(calls[1].options.body + calls[2].options.body, /telegram_id|admin_id/);
});

test("admin settings API uses Telegram auth and never exposes internal key", async () => {
    const calls = [];
    const api = new WalletShopApi({
        baseUrl: "https://backend.example",
        initDataProvider: () => "admin-init-data",
        fetchImpl: async (url, options) => {
            calls.push({ url, options });
            return response({ configured: true });
        },
    });
    await api.adminSettings();
    await api.updateAdminSettings(750, 7.5);
    assert.deepEqual(calls.map((call) => [new URL(call.url).pathname, call.options.method]), [
        ["/admin/wallet-shop/settings", "GET"],
        ["/admin/wallet-shop/settings", "PUT"],
    ]);
    assert.equal(calls[1].options.headers["X-Telegram-Init-Data"], "admin-init-data");
    assert.equal(calls[1].options.headers["X-Internal-Api-Key"], undefined);
    assert.deepEqual(JSON.parse(calls[1].options.body), {
        efc_price_uzs: 750,
        ticket_price_efc: 7.5,
    });
});

test("shop API fails closed without Telegram initData", async () => {
    const api = new WalletShopApi({
        initDataProvider: () => "",
        fetchImpl: async () => { throw new Error("must not run"); },
    });
    await assert.rejects(() => api.catalog(), (error) => {
        assert.ok(error instanceof WalletShopApiError);
        assert.equal(error.status, 401);
        return true;
    });
});

test("amount validation and retry identity are safe", () => {
    assert.equal(walletShopNumber("10,50", 100), 10.5);
    assert.equal(walletShopNumber("2", 100, { integer: true }), 2);
    assert.equal(walletShopNumber("2.5", 100, { integer: true }), null);
    assert.equal(walletShopNumber("0", 100), null);
    assert.equal(walletShopNumber("101", 100), null);
    assert.match(walletShopIdempotencyKey("ticket"), /^miniapp-shop:ticket:/);
    const first = walletShopAttempt("ticket", 2);
    const retry = walletShopAttempt("ticket", 2);
    assert.equal(first.key, retry.key);
    assert.notEqual(walletShopAttempt("ticket", 3).key, first.key);
});

test("MiniApp mounts and routes user and admin wallet shop", () => {
    const html = fs.readFileSync("miniapp/index.html", "utf8");
    const app = fs.readFileSync("miniapp/app.js", "utf8");
    const wallet = fs.readFileSync("miniapp/pages/wallet.js", "utf8");
    const admin = fs.readFileSync("miniapp/pages/wallet-shop-admin.js", "utf8");
    assert.match(html, /class="wallet-action menu-card" data-page="wallet-shop"/);
    assert.match(html, /id="walletShopPage"/);
    assert.match(html, /id="walletShopAdminPage"/);
    assert.match(app, /case "wallet-shop"/);
    assert.match(app, /case "wallet-shop-admin"/);
    assert.match(app, /query\.get\("admin"\) === "wallet-shop"/);
    assert.match(wallet, /openPage\('wallet-shop',\{returnPage:'wallet'\}\)/);
    assert.match(admin, /updateAdminSettings/);
    assert.doesNotMatch(admin, /X-Internal-Api-Key|INTERNAL_API_KEY/);
});
