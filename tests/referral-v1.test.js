const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const {
    normalizeReferralSummary,
    referralClipboardWrite,
    referralMoney,
} = require("../miniapp/pages/referral.js");

test("referral summary normalizes the authenticated backend contract", () => {
    const result = normalizeReferralSummary({ success: true, data: {
        referral_link: "https://t.me/LevelGroupBot?start=ref_abc_DEF-123",
        total_referrals: 7,
        coin_shop_buyers: 3,
        total_earned_uzs: 22000,
        registration_bonus_uzs: 1000,
        first_shop_bonus_uzs: 5000,
    } });
    assert.equal(result.totalReferrals, 7);
    assert.equal(result.coinShopBuyers, 3);
    assert.equal(referralMoney(result.totalEarnedUzs), "22 000 UZS");
    assert.throws(() => normalizeReferralSummary({ success: true, data: { referral_link: "javascript:alert(1)" } }));
});

test("referral API uses walletRequest without telegram_id", () => {
    const api = fs.readFileSync(path.join(__dirname, "../miniapp/api.js"), "utf8");
    const referral = fs.readFileSync(path.join(__dirname, "../miniapp/pages/referral.js"), "utf8");
    assert.match(api, /walletRequest\("\/referrals\/me"\)/);
    assert.doesNotMatch(api, /referrals\/me[^\n]*TELEGRAM_ID/);
    assert.match(referral, /getReferralSummary\(\)/);
});

test("copy prefers Clipboard API and falls back for Telegram WebView", async () => {
    let modernValue = null;
    assert.equal(await referralClipboardWrite("link", {
        navigator: { clipboard: { writeText: async (value) => { modernValue = value; } } },
    }), true);
    assert.equal(modernValue, "link");

    let removed = false;
    const textarea = {
        style: {}, setAttribute() {}, focus() {}, select() {},
        remove() { removed = true; },
    };
    const document = {
        body: { appendChild() {} },
        createElement: () => textarea,
        execCommand: (action) => action === "copy",
    };
    assert.equal(await referralClipboardWrite("link", { navigator: {}, document }), true);
    assert.equal(removed, true);
});

test("referral page includes loading, empty, error, retry and approved metrics", () => {
    const source = fs.readFileSync(path.join(__dirname, "../miniapp/pages/referral.js"), "utf8");
    const index = fs.readFileSync(path.join(__dirname, "../miniapp/index.html"), "utf8");
    assert.match(source, /referralSkeleton/);
    assert.match(source, /Hali referalingiz yo‘q/);
    assert.match(source, /renderReferralError/);
    assert.match(source, /Qayta urinish/);
    assert.match(source, /Coin Shop xarid qilganlar/);
    assert.match(source, /Jami ishlangan bonus/);
    assert.match(index, /id="referralPage"/);
    assert.match(index, /pages\/referral\.js/);
});
