const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const {
    normalizeReferralSummary,
    referralClipboardWrite,
    referralShareMessage,
    referralShareUrl,
} = require("../miniapp/pages/referral.js");

const telegramLink = (code) => {
    const url = new URL("https:" + "//t.me/CurrentProductionBot");
    url.searchParams.set("start", `ref_${code}`);
    return url.toString();
};

test("referral summary normalizes the authenticated backend contract", () => {
    const result = normalizeReferralSummary({ success: true, data: {
        referral_link: telegramLink("abc_DEF-123"),
        total_referrals: 7,
    } });
    assert.equal(result.totalReferrals, 7);
    assert.equal(result.totalEarnedUzs, undefined);
    assert.throws(() => normalizeReferralSummary({ success: true, data: { referral_link: "javascript:alert(1)" } }));
});

test("disabled referral contract renders Tez orada without an invite link", () => {
    assert.deepEqual(
        normalizeReferralSummary({ success: true, data: { enabled: false, referral_link: null } }),
        { enabled: false },
    );
    const source = fs.readFileSync(path.join(__dirname, "../miniapp/pages/referral.js"), "utf8");
    assert.match(source, /renderReferralComingSoon/);
    assert.match(source, /Tez orada/);
    assert.match(source, /yangi referallar qo‘shilmaydi/);
    assert.match(source, /if \(!referralData\.enabled\)/);
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

test("Telegram share contains the approved message once and keeps copy independent", () => {
    const link = telegramLink("abc123");
    const expected = `REFERAL QO‘SHING — eFOOTBALL COIN YUTING! 🪙⚽️
🔥 Ulgurib qoling!
Do‘stlaringizni referal orqali taklif qiling va eFootball uchun COIN yutib oling! 🏆
👥 Qancha ko‘p referal — shuncha yuqori imkoniyat!
🚀 Hoziroq referal yig‘ishni boshlang!

${link}`;
    assert.equal(referralShareMessage(link), expected);

    const shareUrl = new URL(referralShareUrl(link));
    assert.equal(shareUrl.origin, new URL(link).origin);
    assert.equal(shareUrl.pathname, "/share/url");
    assert.equal(`${shareUrl.searchParams.get("text")}\n\n${shareUrl.searchParams.get("url")}`, expected);

    const source = fs.readFileSync(path.join(__dirname, "../miniapp/pages/referral.js"), "utf8");
    assert.match(source, /onclick="shareReferralLink\(\)"/);
    assert.match(source, /referralClipboardWrite\(referralData\.referralLink\)/);
});

test("Telegram share does not depend on the user's first name", () => {
    const link = telegramLink("fallback");
    const expectedStart = "REFERAL QO‘SHING — eFOOTBALL COIN YUTING! 🪙⚽️";
    assert.equal(referralShareMessage(link).split("\n")[0], expectedStart);
    assert.equal(new URL(referralShareUrl(link)).searchParams.get("url"), link);
});

test("Share and Copy use only the backend referralLink without hardcoded Telegram URLs", () => {
    const source = fs.readFileSync(path.join(__dirname, "../miniapp/pages/referral.js"), "utf8");
    assert.doesNotMatch(source, /https:\/\/t\.me\//);
    assert.doesNotMatch(source, /LevelGroupBot/);
    assert.match(source, /referralShareUrl\(referralData\.referralLink\)/);
    assert.match(source, /referralClipboardWrite\(referralData\.referralLink\)/);
});

test("referral page includes Arena points without UZS bonus copy", () => {
    const source = fs.readFileSync(path.join(__dirname, "../miniapp/pages/referral.js"), "utf8");
    const index = fs.readFileSync(path.join(__dirname, "../miniapp/index.html"), "utf8");
    assert.match(source, /referralSkeleton/);
    assert.match(source, /Hali referalingiz yo‘q/);
    assert.match(source, /renderReferralError/);
    assert.match(source, /Qayta urinish/);
    assert.match(source, /\+3 Arena ochko/);
    assert.match(source, /eFootball Coin sovrinlari/);
    assert.doesNotMatch(source, /UZS bonus oling/);
    assert.match(index, /id="referralPage"/);
    assert.match(index, /pages\/referral\.js/);
});
