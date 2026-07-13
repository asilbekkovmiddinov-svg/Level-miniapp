const assert = require("node:assert/strict");
const test = require("node:test");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

const {
    normalizeWalletData,
    validateDepositAmount,
    validateWithdrawForm,
    walletCardDigits,
} = require("../miniapp/pages/wallet.js");

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

test("wallet actions use authenticated Backend V2 contracts", async () => {
    const calls = [];
    const context = {
        window: { Telegram: { WebApp: { initData: "verified-init-data" } } },
        tg: { initData: "verified-init-data" },
        API_URL: "https://backend.example",
        fetch: async (url, options) => {
            calls.push({ url, options });
            return {
                ok: true,
                json: async () => ({
                    deposit_id: 7,
                    withdraw_id: 8,
                    amount: 15000,
                    status: "PENDING",
                }),
            };
        },
    };
    vm.createContext(context);
    vm.runInContext(
        fs.readFileSync(path.join(__dirname, "../miniapp/api.js"), "utf8"),
        context,
    );

    await context.createDeposit(15000);
    await context.createWithdraw(20000, "8600123412341234", "Ali Valiyev", "Test Bank");

    assert.equal(calls[0].url, "https://backend.example/deposit/create");
    assert.deepEqual(JSON.parse(calls[0].options.body), { amount: 15000 });
    assert.equal(calls[1].url, "https://backend.example/withdraw/create");
    assert.deepEqual(JSON.parse(calls[1].options.body), {
        amount: 20000,
        card_number: "8600123412341234",
        card_holder: "Ali Valiyev",
        bank_name: "Test Bank",
    });
    for (const call of calls) {
        assert.equal(call.options.headers["X-Telegram-Init-Data"], "verified-init-data");
        assert.equal(call.options.headers["Content-Type"], "application/json");
        assert.equal("telegram_id" in JSON.parse(call.options.body), false);
        assert.equal("INTERNAL_API_KEY" in call.options.headers, false);
    }
});

test("wallet action validation enforces backend-compatible input", () => {
    assert.equal(validateDepositAmount("15 000").amount, 15000);
    assert.equal(validateDepositAmount("14 999").valid, false);
    assert.equal(walletCardDigits("8600 1234-1234 1234"), "8600123412341234");

    const valid = validateWithdrawForm({
        amount: "20 000",
        cardNumber: "8600 1234 1234 1234",
        cardHolder: "Ali Valiyev",
        bankName: "Test Bank",
        balance: 50000,
    });
    assert.equal(valid.valid, true);
    assert.equal(valid.cardNumber, "8600123412341234");
    assert.equal(validateWithdrawForm({
        amount: 60000,
        cardNumber: "8600123412341234",
        cardHolder: "Ali Valiyev",
        bankName: "Test Bank",
        balance: 50000,
    }).valid, false);
});
