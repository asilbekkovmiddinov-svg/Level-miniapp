const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

test("production wheel spin posts authenticated request and returns backend state", async () => {
    const calls = [];
    const backendResult = {
        success: true,
        spin_id: 91,
        reward_code: "efc_100",
        reward_type: "EFC",
        reward_amount: 100,
        global_spin_number: 14,
        free_spin_used: true,
    };
    const context = {
        window: { Telegram: { WebApp: { initData: "verified-init-data" } } },
        tg: { initData: "verified-init-data" },
        fetch: async (url, options) => {
            calls.push({ url, options });
            return { ok: true, status: 200, json: async () => backendResult };
        },
        console,
        URLSearchParams,
        setTimeout,
        clearTimeout,
    };
    vm.createContext(context);
    const source = fs.readFileSync(path.join(__dirname, "../miniapp/api.js"), "utf8");
    vm.runInContext(`const API_URL = "https://backend.example"; const TELEGRAM_ID = 1678146043; ${source}`, context);

    const result = await vm.runInContext('spinProductionWheel("FREE")', context);

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://backend.example/wheel/spin");
    assert.equal(calls[0].options.method, "POST");
    assert.equal(calls[0].options.headers["X-Telegram-Init-Data"], "verified-init-data");
    assert.deepEqual(JSON.parse(calls[0].options.body), { telegram_id: 1678146043, spin_type: "FREE" });
    assert.equal(result.free_spin_used, true);
    assert.equal(result.global_spin_number, 14);
    assert.equal(result.reward_type, "EFC");
});

test("production wheel source contains no demo reward generator", () => {
    const source = fs.readFileSync(path.join(__dirname, "../miniapp/pages/wheel.js"), "utf8");
    assert.doesNotMatch(source, /WHEEL_DEMO_REWARDS|Math\.random/);
    assert.match(source, /refreshWallet\(\)/);
    assert.match(source, /loadLiveWinners\(\{ silent: true, force: true \}\)/);
});
