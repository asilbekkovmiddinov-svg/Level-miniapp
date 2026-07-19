const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "../miniapp/splash.js"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "../miniapp/splash.css"), "utf8");
const motion = fs.readFileSync(path.join(__dirname, "../miniapp/splash-animations.css"), "utf8");
const index = fs.readFileSync(path.join(__dirname, "../miniapp/index.html"), "utf8");

test("premium Splash uses a three-second brand choreography without loading UI", () => {
    assert.match(source, /minimumVisibleMs:\s*3000/);
    assert.match(source, /Play <i>•<\/i> Earn <i>•<\/i> Trade/);
    assert.match(source, /\.\.\."LEVEL"/); assert.match(source, /splash-group">GROUP/);
    assert.doesNotMatch(source, /cinematicProgress|cinematicStatus|progress|spinner|INITIALIZING|CONNECTING/);
    assert.match(index, /splash\.js\?v=4\.0\.0/); assert.match(index, /splash\.css\?v=4\.0\.0/);
});

test("Splash foundation has deterministic particles and reusable motion constants", () => {
    assert.match(source, /const MOTION = Object\.freeze/); assert.match(source, /const PARTICLES = Object\.freeze/);
    assert.match(source, /hardwareConcurrency/); assert.match(source, /is-lite/);
    assert.doesNotMatch(source, /Math\.random/);
});

test("visual architecture covers aurora logo choreography and smooth app handoff", () => {
    for (const token of ["splash-aurora-crimson", "splash-aurora-purple", "splash-noise", "splash-logo-halo", "splash-logo-shine", "splash-particle-field"]) assert.match(css, new RegExp(token));
    for (const animation of ["splashAuroraCrimson", "splashParticleOrbit", "splashLogoBreath", "splashGlowPulse", "splashMetalSweep", "splashLetterIn", "splashGroupIn"]) assert.match(motion, new RegExp(animation));
    assert.match(css, /#app\.splash-app-entering/); assert.match(css, /scale\(\.985\)/); assert.match(css, /filter:blur\(9px\)/);
});

test("Splash animations stay compositor-friendly and respect reduced motion", () => {
    assert.match(css, /contain:strict/); assert.match(css, /translate3d/); assert.match(css, /prefers-reduced-motion:reduce/);
    assert.doesNotMatch(motion, /(?:^|[;{])\s*(?:top|left|right|bottom|width|height|margin|padding):/m);
    assert.match(css, /will-change:auto/);
});
