const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const read = (file) => fs.readFileSync(path.join(__dirname, "../miniapp", file), "utf8");
const tokens = read("design-tokens.css");
const light = read("theme-light.css");
const design = read("design-system.js");
const splash = read("splash.js");
const arena = read("pages/arena.js");
const dialogs = read("dialog-foundation.js");
const html = read("index.html");

test("Telegram light mode is a complete semantic token layer", () => {
    assert.match(tokens, /data-telegram-theme="light"/);
    for (const token of ["--lg-surface-canvas", "--lg-surface-card", "--lg-text-primary", "--lg-border-glass", "--lg-glass-high", "--lg-shadow-glow", "--lg-telegram-chrome"]) {
        assert.ok(tokens.includes(token), `${token} must exist`);
    }
    assert.match(light, /var\(--lg-surface-card\)/);
    assert.doesNotMatch(light, /#[0-9a-f]{3,8}|rgba?\(/i);
});

test("Telegram theme changes update tokens and native chrome", () => {
    assert.match(design, /onEvent\?\.\("themeChanged", applyRuntimeMode\)/);
    assert.match(design, /dataset\.telegramTheme/);
    assert.match(design, /setHeaderColor/);
    assert.match(design, /setBackgroundColor/);
    assert.match(design, /levelgroup:splash-complete/);
    assert.doesNotMatch(splash, /setHeaderColor\?\.\("#[0-9a-f]+"\)/i);
});

test("Arena match cards use a native keyboard-operable control", () => {
    assert.match(arena, /<button class="arena-v2-match" type="button" aria-label=/);
    assert.match(arena, /<article class="arena-v2-match-shell"/);
    assert.doesNotMatch(arena, /<article class="arena-v2-match"[^>]*onclick=/);
});

test("custom dialog foundation supplies the full accessibility lifecycle", () => {
    assert.match(dialogs, /setAttribute\("role", "dialog"\)/);
    assert.match(dialogs, /setAttribute\("aria-modal", "true"\)/);
    assert.match(dialogs, /\.inert = true/);
    assert.match(dialogs, /restoreFocus/);
    assert.match(dialogs, /event\.key === "Escape"/);
    assert.match(dialogs, /event\.key !== "Tab"/);
    assert.match(dialogs, /MutationObserver/);
    assert.match(dialogs, /LevelMotionEngine/);
    assert.match(dialogs, /focus\(\{ preventScroll: true \}\)/);
    for (const overlay of ["arena-v2-overlay", "wallet-action-overlay", "wheel-result-modal", "wheel-wizard-modal", "referral-modal", "pac-form-overlay", "pac-crop-overlay"]) {
        assert.ok(dialogs.includes(overlay), `${overlay} must be managed`);
    }
});

test("theme and dialog foundations load after shared systems and before features", () => {
    assert.ok(html.indexOf("global-premium-polish.css") < html.indexOf("theme-light.css"));
    assert.ok(html.indexOf("motion-engine.js") < html.indexOf("dialog-foundation.js"));
    assert.ok(html.indexOf("dialog-foundation.js") < html.indexOf("pages/wallet.js"));
});
