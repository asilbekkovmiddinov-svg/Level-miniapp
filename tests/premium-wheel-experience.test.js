const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const css = fs.readFileSync(path.join(__dirname, "../miniapp/premium-wheel.css"), "utf8");
const source = fs.readFileSync(path.join(__dirname, "../miniapp/pages/wheel.js"), "utf8");
const designRuntime = fs.readFileSync(path.join(__dirname, "../miniapp/design-system.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "../miniapp/index.html"), "utf8");

test("Premium Wheel layers metal, glass, depth and reflection over existing SVG", () => {
    for (const selector of ["wheel-v2-rim", "wheel-v2-hub", "wheel-v2-logo", "wheel-v2-pointer", "wheel-v2-disc::before", "wheel-v2-disc::after"]) assert.match(css, new RegExp(selector.replace("::", "::")));
    assert.match(css, /lg-shadow-modal/);
    assert.match(css, /lg-gradient-surface/);
});

test("spin presentation follows existing lifecycle classes only", () => {
    assert.match(css, /wheel-v2-rotor\.is-spinning/);
    assert.match(css, /premiumWheelEnergy/);
    assert.match(css, /premiumPointerCharge/);
    assert.match(css, /premiumWheelTrail/);
    assert.match(css, /cubic-bezier\(\.18,\.72,\.08,1\)/);
    assert.doesNotMatch(css, /data-rotation|sector-index|rotateToSector/);
});

test("reward, cooldown, last win and spin button receive premium states", () => {
    for (const selector of ["wheel-result-card", "is-coin-reward", "wheel-timer-card.is-ready", "wheel-timer-card.is-cooldown", "wheel-last-win", "wheel-spin-button.is-loading", "wheel-spin-button:disabled"]) assert.match(css, new RegExp(selector.replaceAll(".", "\\.")));
});

test("Wheel visual layer does not change reward or backend contracts", () => {
    assert.match(source, /applyWheelBackendSector\(backendResult\)/);
    assert.match(source, /spinProductionWheel\(spinType\)/);
    assert.match(source, /disc\.addEventListener\("transitionend", finishWheelSpin/);
    assert.doesNotMatch(css, /fetch\(|walletRequest|WHEEL_PRIZES\s*=/);
});

test("Wheel remains accessible, low-end aware and haptic", () => {
    assert.match(css, /prefers-reduced-motion:reduce/);
    assert.match(css, /design-low-motion/);
    assert.match(css, /focus-visible/);
    assert.match(css, /contain:layout paint style/);
    assert.match(designRuntime, /\.wheel-spin-button/);
    assert.ok(html.indexOf("motion-engine.css") < html.indexOf("premium-wheel.css"));
});


test("Wheel lower summary keeps rewarded, remaining and last-win cards in one compact row", () => {
    assert.match(source, /<div class="wheel-compact-row">[\s\S]*id="wheelFreeCard"[\s\S]*id="wheelAdCard"[\s\S]*wheel-remaining-card[\s\S]*wheel-last-win[\s\S]*<\/div>/);
    assert.match(source, /<span>Reklama ko‘rish<\/span>/);
    assert.match(css, /\.wheel-compact-row\{[^}]*display:flex[^}]*align-items:stretch/);
    assert.match(css, /\.wheel-compact-row>\.wheel-rewarded-card\{[^}]*flex:1\.6 1 0/);
    assert.match(css, /\.wheel-compact-row>\.wheel-free-card,\.wheel-compact-row>\.wheel-remaining-card,\.wheel-compact-row>\.wheel-last-win\{[^}]*flex:1 1 0/);
    assert.match(css, /@media\(max-width:390px\)\{\.wheel-compact-row\{/);
    assert.doesNotMatch(css, /\.wheel-compact-row[^}]*overflow-x\s*:\s*(auto|scroll)/);
});

test("compact Wheel polish preserves countdown and READY hooks", () => {
    for (const id of ["wheelAdCard", "wheelAdCountdown", "wheelAdBadge"]) {
        assert.match(source, new RegExp(`id="${id}"`));
    }
    assert.match(source, /updateWheelTimerCard\("Ad"/);
    assert.match(source, /updateWheelRewardedSlots\(current, now\)/);
    assert.match(source, /normalizeWheelLastWin\(wheelData\?\.last_win\)/);
});


test("free spin card shares the compact row without changing its timer contract", () => {
    assert.match(source, /id="wheelFreeCard" class="wheel-timer-card wheel-free-card/);
    assert.match(source, /id="wheelFreeCountdown"/);
    assert.match(source, /id="wheelFreeBadge"/);
    assert.match(source, /updateWheelTimerCard\("Free"/);
    assert.match(css, /\.wheel-compact-row \.wheel-free-card>#wheelFreeCountdown/);
});
