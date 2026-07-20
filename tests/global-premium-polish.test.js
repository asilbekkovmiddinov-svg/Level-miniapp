const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const read = (file) => fs.readFileSync(path.join(__dirname, "../miniapp", file), "utf8");
const tokens = read("design-tokens.css");
const polish = read("global-premium-polish.css");
const motion = read("motion-engine.css");
const runtime = read("motion-engine.js");
const wallet = read("pages/wallet.js");
const html = read("index.html");

test("global polish resolves shared typography, motion and surface tokens", () => {
    for (const token of ["--lg-border-glow", "--lg-ease-out", "--lg-motion-medium", "--lg-text-muted", "--lg-control-height", "--lg-modal-radius", "--lg-focus-ring"]) assert.ok(tokens.includes(token));
    assert.match(polish, /var\(--lg-control-height\)/);
    assert.match(polish, /var\(--lg-modal-radius\)/);
});

test("cards, controls, icons, overlays, empty states and toasts share final rhythm", () => {
    for (const selector of [".wallet-v2-actions button", ".referral-link-card button", ".arena-v2 button", ".wheel-spin-button", ".pac-toast", ".wallet-empty", ".app-header"]) assert.ok(polish.includes(selector));
    assert.match(polish, /lg-shadow-modal/);
    assert.match(polish, /lg-shadow-glass/);
});

test("one global shimmer replaces Wallet and Referral duplicate keyframes", () => {
    assert.match(motion, /referral-skeleton>\*/);
    assert.match(motion, /lgMotionShimmer/);
    assert.doesNotMatch(read("premium-wallet.css"), /@keyframes premiumWalletShimmer/);
    assert.doesNotMatch(read("premium-referral.css"), /@keyframes premiumReferralShimmer/);
});

test("global polish improves compositor and dynamic-card behavior without feature APIs", () => {
    assert.doesNotMatch(motion, /page\.active-page[^}]*will-change/);
    assert.doesNotMatch(motion, /lgMotionShimmer[^}]*will-change/);
    assert.match(runtime, /referral-stats article/);
    assert.match(runtime, /wallet-history/);
    assert.doesNotMatch(polish, /fetch\(|walletRequest|addEventListener/);
});

test("global experience preserves safe area, reduced motion, contrast and dialog semantics", () => {
    assert.match(polish, /overscroll-behavior/);
    assert.match(polish, /prefers-reduced-motion:reduce/);
    assert.match(polish, /forced-colors:active/);
    assert.match(polish, /focus-visible/);
    assert.match(polish, /lg-safe-bottom/);
    assert.match(wallet, /setAttribute\("role", "dialog"\)/);
    assert.ok(html.indexOf("premium-referral.css") < html.indexOf("global-premium-polish.css"));
});
