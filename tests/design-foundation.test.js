const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const tokens = fs.readFileSync(path.join(__dirname, "../miniapp/design-tokens.css"), "utf8");
const foundation = fs.readFileSync(path.join(__dirname, "../miniapp/design-foundation.css"), "utf8");
const runtime = fs.readFileSync(path.join(__dirname, "../miniapp/design-system.js"), "utf8");
const index = fs.readFileSync(path.join(__dirname, "../miniapp/index.html"), "utf8");

test("design tokens cover premium colors and semantic palette", () => {
    for (const name of ["deep-black", "crimson", "neon-red", "purple", "ice", "silver", "success", "warning", "error", "info"]) assert.match(tokens, new RegExp(`--lg-color-${name}:`));
    for (const name of ["gradient-brand", "gradient-purple", "gradient-metal", "gradient-surface", "gradient-glass"]) assert.match(tokens, new RegExp(`--lg-${name}:`));
});

test("typography spacing radius shadow and motion scales are centralized", () => {
    for (const name of ["type-hero", "type-title", "type-subtitle", "type-body", "type-caption", "type-button"]) assert.match(tokens, new RegExp(`--lg-${name}:`));
    for (let index = 0; index <= 8; index += 1) assert.match(tokens, new RegExp(`--lg-space-${index}:`));
    for (const name of ["radius-sm", "radius-md", "radius-lg", "radius-xl", "radius-pill", "shadow-glass", "shadow-glow", "shadow-floating", "shadow-modal", "ease-spring"]) assert.match(tokens, new RegExp(`--lg-${name}:`));
});

test("foundation exposes glass buttons cards icons background and floating navigation", () => {
    for (const name of ["lg-glass", "lg-button-primary", "lg-button-secondary", "lg-button-danger", "lg-button-ghost", "lg-button-outline", "is-loading", "lg-card-wallet", "lg-card-arena", "lg-card-wheel", "lg-card-promotion", "lg-card-statistic", "lg-card-profile", "lg-icon"]) assert.match(foundation, new RegExp(name));
    assert.match(foundation, /\.app::before/); assert.match(foundation, /\.bottom-nav/); assert.match(foundation, /safe-bottom/); assert.match(foundation, /\.nav-btn\.active::before/);
});

test("runtime adds Telegram haptics theme sync and low-end mode without dependencies", () => {
    assert.match(runtime, /HapticFeedback/); assert.match(runtime, /selectionChanged/); assert.match(runtime, /impactOccurred/); assert.match(runtime, /notificationOccurred/);
    assert.match(runtime, /hardwareConcurrency/); assert.match(runtime, /connection\?\.saveData/); assert.match(runtime, /themeChanged/);
    assert.doesNotMatch(runtime, /import |require\(/);
});

test("accessibility and performance contracts are present and assets load in order", () => {
    assert.match(foundation, /prefers-reduced-motion:reduce/); assert.match(foundation, /prefers-contrast:more/); assert.match(foundation, /contain:layout paint/); assert.match(foundation, /translate3d/);
    assert.ok(index.indexOf("design-tokens.css") < index.indexOf("style.css"));
    assert.ok(index.indexOf("design-foundation.css") > index.indexOf("wheel-order-admin-menu.css"));
    assert.match(index, /design-system\.js\?v=1\.0\.0/);
});
