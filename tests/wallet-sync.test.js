const assert = require("node:assert/strict");
const test = require("node:test");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

const { normalizeWalletData } = require("../miniapp/pages/wallet.js");

test("wallet response matches Backend V2 contract", () => {
    const wallet = normalizeWalletData({
        telegram_id: 42,
        efc_balance: 125.5,
        uzs_balance: 15000,
        locked_efc: 25,
        locked_uzs: 5000,
    });

    assert.equal(wallet.telegram_id, 42);
    assert.equal(wallet.efc_balance, 125.5);
    assert.equal(wallet.locked_uzs, 5000);
});

test("legacy or malformed wallet response is rejected", () => {
    assert.throws(() => normalizeWalletData({ detail: "Not Found" }));
    assert.throws(() => normalizeWalletData({ efc: 10, uzs: 20 }));
});

test("getWallet uses authenticated Backend V2 endpoint", async () => {
    const calls = [];
    const context = {
        window: { Telegram: { WebApp: { initData: "verified-init-data" } } },
        tg: { initData: "verified-init-data" },
        API_URL: "https://backend.example",
        TELEGRAM_ID: 42,
        FIRST_NAME: "Ali",
        USERNAME: "ali",
        fetch: async (url, options) => {
            calls.push({ url, options });
            return {
                ok: true,
                json: async () => ({
                    telegram_id: 42,
                    efc_balance: 100,
                    uzs_balance: 200,
                    locked_efc: 0,
                    locked_uzs: 0,
                }),
            };
        },
    };
    vm.createContext(context);
    vm.runInContext(
        fs.readFileSync(path.join(__dirname, "../miniapp/api.js"), "utf8"),
        context,
    );

    const wallet = await context.getWallet();
    assert.equal(wallet.efc_balance, 100);
    assert.equal(calls[0].url, "https://backend.example/wallet");
    assert.deepEqual(
        { ...calls[0].options.headers },
        { "X-Telegram-Init-Data": "verified-init-data" },
    );
    assert.equal(calls[0].url.includes("42"), false);
});
