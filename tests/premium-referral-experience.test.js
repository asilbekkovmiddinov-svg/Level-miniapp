const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const css = fs.readFileSync(path.join(__dirname, "../miniapp/premium-referral.css"), "utf8");
const source = fs.readFileSync(path.join(__dirname, "../miniapp/pages/referral.js"), "utf8");
const designRuntime = fs.readFileSync(path.join(__dirname, "../miniapp/design-system.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "../miniapp/index.html"), "utf8");

test("Premium Referral composes branded hero, glass link and statistic cards", () => {
    for (const selector of ["#referralPage::before", ".referral-hero", ".referral-link-card", ".referral-stats article", ".referral-counter"]) assert.ok(css.includes(selector));
    assert.match(css, /lg-gradient-surface/);
    assert.match(css, /lg-shadow-floating/);
});

test("Copy, Share and Invite preserve authoritative actions with visual feedback", () => {
    assert.match(source, /onclick="copyReferralLink\(this\)"/);
    assert.match(source, /onclick="shareReferralLink\(\)"/);
    assert.match(source, /referral-invite-button/);
    assert.match(source, /classList\?\.add\("is-copied"\)/);
    assert.match(css, /\.referral-copy-button\.is-copied/);
});

test("Referral reward path and resilient states receive premium presentation", () => {
    for (const selector of [".referral-bonuses article:not(:last-child)::after", ".referral-bonuses article>span", ".referral-empty", ".referral-state", ".referral-skeleton"]) assert.ok(css.includes(selector));
});

test("Referral visual layer does not replace link, reward or API contracts", () => {
    assert.match(source, /normalizeReferralSummary\(await getReferralSummary\(\)\)/);
    assert.match(source, /referralClipboardWrite\(referralData\.referralLink\)/);
    assert.match(source, /referralShareUrl\(referralData\.referralLink, firstName\)/);
    assert.doesNotMatch(css, /fetch\(|walletRequest|registrationBonusUzs\s*=/);
});

test("Referral remains accessible, low-end aware and haptic", () => {
    assert.match(css, /prefers-reduced-motion:reduce/);
    assert.match(css, /design-low-motion/);
    assert.match(css, /forced-colors:active/);
    assert.match(css, /focus-visible/);
    assert.match(css, /contain:layout style/);
    assert.match(designRuntime, /\.referral-share-button/);
    assert.ok(html.indexOf("motion-engine.css") < html.indexOf("premium-referral.css"));
});
