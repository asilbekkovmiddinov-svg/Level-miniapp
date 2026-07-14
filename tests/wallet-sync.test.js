const assert = require("node:assert/strict");
const test = require("node:test");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

const {
    normalizeWalletData,
    normalizeDepositPaymentDetails,
    depositBankByKey,
    depositCopyRow,
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
        assert.match(call.options.headers["Idempotency-Key"], /^(deposit|withdraw)-/);
    }
});

test("register and seen use authenticated contracts and reject non-2xx", async () => {
    const calls = [];
    const context = {
        window: { Telegram: { WebApp: { initData: "verified-init-data" } } },
        tg: { initData: "verified-init-data" }, API_URL: "https://backend.example",
        TELEGRAM_ID: 42, FIRST_NAME: "Ali", USERNAME: "ali",
        fetch: async (url, options) => {
            calls.push({ url, options });
            return { ok: !url.endsWith("/user/seen"), status: 500, json: async () => ({ detail: "failed" }) };
        },
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../miniapp/api.js"), "utf8"), context);
    await context.registerUser();
    await assert.rejects(() => context.updateUserSeen(), /Serverda vaqtinchalik/);
    assert.equal(calls[0].url, "https://backend.example/user/register");
    assert.equal(calls[1].url, "https://backend.example/user/seen");
    assert.equal(calls[0].options.headers["X-Telegram-Init-Data"], "verified-init-data");
});

test("failed receipt notification is surfaced to the user", async () => {
    const context = {
        window: { Telegram: { WebApp: { initData: "verified-init-data" } } },
        tg: { initData: "verified-init-data" }, API_URL: "https://backend.example",
        TELEGRAM_ID: 42, FIRST_NAME: "Ali", USERNAME: "ali", Blob, FormData,
        fetch: async () => ({ ok: true, json: async () => ({ notification_status: "FAILED" }) }),
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../miniapp/api.js"), "utf8"), context);
    const file = new Blob(["x"], { type: "image/jpeg" });
    await assert.rejects(() => context.uploadDepositEvidence(7, file), /Admin notification yuborilmadi/);
});

test("dedicated wallet renders locked balances, history, status and pagination", () => {
    const source = fs.readFileSync(path.join(__dirname, "../miniapp/pages/wallet.js"), "utf8");
    assert.match(source, /loadDedicatedWalletPage/);
    assert.match(source, /locked_efc/);
    assert.match(source, /locked_uzs/);
    assert.match(source, /Transaction History/);
    assert.match(source, /walletStatusBadge/);
    assert.match(source, /wallet-history-skeleton/);
    assert.match(source, /wallet-empty/);
    assert.match(source, /history\?\.has_more/);
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


test("deposit payment details normalize backend contract", () => {
    const nested = normalizeDepositPaymentDetails({
        deposit_id: 21,
        amount: 25000,
        payment_details: {
            card_number: "8600 1111 2222 3333",
            card_holder: "LEVEL GROUP",
            bank_name: "Test Bank",
        },
    });
    assert.deepEqual(nested, {
        depositId: 21,
        amount: 25000,
        cardNumber: "8600 1111 2222 3333",
        cardHolder: "LEVEL GROUP",
        bankName: "Test Bank",
    });

    assert.throws(() => normalizeDepositPaymentDetails({
        deposit_id: 22,
        amount: 25000,
    }), /rekvizitlarini/);
});

test("premium deposit bank registry contains primary and other banks", () => {
    const keys = [
        "click", "payme", "uzum", "anorbank", "kapitalbank", "hamkorbank",
        "aloqabank", "agrobank", "asakabank", "ipakyuli", "nbu", "xalq",
        "turonbank", "ofb", "tbc", "davrbank", "ziraat", "infinbank",
        "trastbank", "universalbank", "octobank",
    ];
    for (const key of keys) {
        const bank = depositBankByKey(key);
        assert.equal(bank.key, key);
        assert.match(bank.scheme, /^[a-z][a-z0-9]+:\/\//);
    }
    assert.equal(depositBankByKey("unknown"), null);
});

test("deposit copy row escapes backend values and renders animated copy control", () => {
    const html = depositCopyRow("Karta", "<script>", "86001234");
    assert.equal(html.includes("<script>"), false);
    assert.match(html, /&lt;script&gt;/);
    assert.match(html, /data-copy-value="86001234"/);
    assert.match(html, /copyDepositValue\(this\)/);
});

test("deposit UX gates production evidence upload behind payment confirmation", () => {
    const walletSource = fs.readFileSync(
        path.join(__dirname, "../miniapp/pages/wallet.js"),
        "utf8",
    );
    const apiSource = fs.readFileSync(
        path.join(__dirname, "../miniapp/api.js"),
        "utf8",
    );

    assert.match(walletSource, /openDepositPaymentDetails\(result\)/);
    assert.match(
        walletSource,
        /onclick="openDepositEvidence\(\$\{details\.depositId\}\)"/,
    );
    assert.match(walletSource, /Men to‘lov qildim/);
    assert.match(apiSource, /\/deposit\/\$\{id\}\/evidence/);
    assert.match(apiSource, /"X-Telegram-Init-Data": initData/);
    assert.match(apiSource, /formData\.append\("file", file/);
});
