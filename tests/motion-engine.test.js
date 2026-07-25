const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const css = fs.readFileSync(path.join(__dirname, "../miniapp/motion-engine.css"), "utf8");
const js = fs.readFileSync(path.join(__dirname, "../miniapp/motion-engine.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "../miniapp/index.html"), "utf8");

test("Motion Engine centralizes required reusable primitives", () => {
    for (const value of ["lg-motion-fade", "lg-motion-slide", "lg-motion-scale", "lg-motion-blur", "lg-motion-spring", "lg-motion-stagger", "lg-motion-glow", "lg-motion-shine"]) assert.match(css, new RegExp(value));
});

test("page, modal, skeleton and semantic toast motion share the engine", () => {
    assert.match(css, /page\.active-page/);
    for (const value of ["lgMotionPageIn", "lgMotionModalIn", "lgMotionModalOut", "lgMotionShimmer", ".success", ".error", ".warning", ".info"]) assert.match(css, new RegExp(value.replace(".", "\\.")));
});

test("runtime progressively enhances controls and cards without feature APIs", () => {
    assert.match(js, /MutationObserver/);
    assert.match(js, /pointerdown/);
    assert.match(js, /is-motion-pressed/);
    assert.match(js, /requestAnimationFrame/);
    assert.doesNotMatch(js, /fetch\(|walletRequest|XMLHttpRequest|WebSocket/);
});

test("motion remains compositor friendly and accessible", () => {
    assert.match(css, /translate3d/);
    assert.match(css, /will-change:transform,opacity/);
    assert.match(css, /prefers-reduced-motion:reduce/);
    assert.match(css, /design-low-motion/);
    assert.doesNotMatch(css, /@keyframes[^}]+\b(top|left|width|height):/s);
});

test("motion assets load after the design foundation and before feature runtime", () => {
    assert.ok(html.indexOf("design-foundation.css") < html.indexOf("motion-engine.css"));
    assert.ok(html.indexOf("design-system.js") < html.indexOf("motion-engine.js"));
    assert.ok(html.indexOf("motion-engine.js") < html.indexOf("api.js"));
});
