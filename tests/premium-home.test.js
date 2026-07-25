const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const html = fs.readFileSync(path.join(__dirname, "../miniapp/index.html"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "../miniapp/home.css"), "utf8");
const wallet = fs.readFileSync(path.join(__dirname, "../miniapp/pages/wallet.js"), "utf8");

test("Premium Home follows the required section architecture", () => {
    for (const label of ["home-header", "home-hero", "Wallet Summary", "Quick Actions", "Promotions", "Live Statistics", "Recent Activity"]) {
        assert.match(html, new RegExp(label));
    }
    for (const route of ["notifications", "profile", "wheel", "arena", "wallet", "referral"]) {
        assert.match(html, new RegExp(`data-page="${route}"`));
    }
});

test("wallet summary reuses authoritative unlocked and locked balances", () => {
    for (const id of ["efcBalance", "uzsBalance", "lockedEfcBalance", "lockedUzsBalance"]) assert.match(html, new RegExp(`id="${id}"`));
    assert.match(wallet, /walletData\.locked_efc/);
    assert.match(wallet, /walletData\.locked_uzs/);
    assert.doesNotMatch(wallet, /fetch\(/);
});

test("Home presentation consumes premium foundation tokens", () => {
    for (const token of ["--lg-gradient-glass", "--lg-border-glow", "--lg-shadow-floating", "--lg-motion-slow", "--lg-radius-xl"]) {
        assert.match(css, new RegExp(token));
    }
    assert.match(css, /homeReveal/);
    assert.match(css, /--home-order/);
});

test("Home remains compositor friendly and accessible", () => {
    assert.match(css, /translate3d/);
    assert.match(css, /contain:layout paint/);
    assert.match(css, /prefers-reduced-motion:reduce/);
    assert.match(css, /prefers-contrast:more/);
    assert.match(css, /data-lg-low-end/);
    assert.doesNotMatch(css, /animation:[^;}]*\b(top|left|width|height)\b/);
});

test("Home keeps existing authenticated feature surfaces", () => {
    for (const id of ["homePromotions", "notificationBellBadge", "liveWinnersPanel"]) assert.match(html, new RegExp(`id="${id}"`));
    assert.match(html, /onclick="openDeposit\(\)"/);
    assert.match(html, /onclick="openWithdraw\(\)"/);
});
