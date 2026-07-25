const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const css = fs.readFileSync(path.join(__dirname, "../miniapp/premium-wallet.css"), "utf8");
const source = fs.readFileSync(path.join(__dirname, "../miniapp/pages/wallet.js"), "utf8");
const designRuntime = fs.readFileSync(path.join(__dirname, "../miniapp/design-system.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "../miniapp/index.html"), "utf8");

test("Premium Wallet composes hero, balance glass and animated currency presentation", () => {
    for (const selector of ["#walletPage::before", ".wallet-v2-page>header", ".wallet-v2-balances article", "premiumWalletBalanceIn", "premiumWalletCurrency"]) assert.match(css, new RegExp(selector.replaceAll(".", "\\.")));
    assert.match(css, /lg-gradient-surface/);
    assert.match(css, /lg-shadow-floating/);
});

test("deposit and withdraw surfaces retain their forms behind premium presentation", () => {
    for (const selector of [".wallet-action-sheet", "input[type=\"file\"]", "input[name=\"cardNumber\"]", ".deposit-details-card", ".wallet-form-error:not(:empty)"]) assert.ok(css.includes(selector));
    assert.match(source, /onsubmit="submitWalletDeposit\(event\)"/);
    assert.match(source, /onsubmit="submitWalletWithdraw\(event\)"/);
    assert.match(source, /onsubmit="submitDepositEvidence\(event,/);
});

test("transaction history supports timeline, semantic statuses, loading and empty states", () => {
    for (const selector of [".wallet-history::before", ".wallet-history-row::before", ".wallet-status-completed", ".wallet-status-rejected", ".wallet-status-pending", ".wallet-history-skeleton", ".wallet-empty::before"]) assert.match(css, new RegExp(selector.replaceAll(".", "\\.")));
});

test("Wallet visual layer does not replace API or transaction business contracts", () => {
    for (const contract of ["getWallet()", "getWalletTransactions", "createDeposit", "createWithdraw", "uploadDepositEvidence"]) assert.ok(source.includes(contract));
    assert.doesNotMatch(css, /fetch\(|walletRequest|WALLET_MIN_AMOUNT\s*=/);
});

test("Wallet remains accessible, low-end aware and haptic", () => {
    assert.match(css, /prefers-reduced-motion:reduce/);
    assert.match(css, /design-low-motion/);
    assert.match(css, /forced-colors:active/);
    assert.match(css, /focus-visible/);
    assert.match(css, /contain:layout style/);
    assert.match(designRuntime, /\.wallet-v2-actions button/);
    assert.ok(html.indexOf("motion-engine.css") < html.indexOf("premium-wallet.css"));
});
