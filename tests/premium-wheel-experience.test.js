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
