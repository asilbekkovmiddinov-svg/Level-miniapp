const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const css = fs.readFileSync(path.join(__dirname, "../miniapp/premium-arena.css"), "utf8");
const source = fs.readFileSync(path.join(__dirname, "../miniapp/pages/arena.js"), "utf8");
const design = fs.readFileSync(path.join(__dirname, "../miniapp/design-system.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "../miniapp/index.html"), "utf8");

test("Premium Arena covers hero, cards, forms and detail surfaces", () => {
    for (const selector of ["arena-v2>header", "arena-v2-match", "arena-v2-create", "arena-v2-confirm", "arena-v2-detail", "arena-v2-state"]) assert.match(css, new RegExp(selector.replaceAll(".", "\\.")));
    for (const token of ["--lg-gradient-glass", "--lg-shadow-floating", "--lg-border-glow"]) assert.match(css, new RegExp(token));
});

test("ready, countdown, room and evidence contracts receive premium states", () => {
    for (const selector of ["arena-v2-ready-button", "arena-v2-countdown.is-live", "arena-v2-room-panel.has-code", "arena-v2-progress", "arena-v2-evidence-panel.is-complete"]) assert.match(css, new RegExp(selector.replaceAll(".", "\\.")));
    assert.match(css, /premiumArenaCountdown/);
    assert.match(css, /premiumArenaShine/);
});

test("completed backend status drives presentation without winner heuristics", () => {
    assert.match(source, /status-\$\{arenaEscape\(String\(match\.status\)\.toLowerCase\(\)\)\}/);
    assert.match(css, /arena-v2-detail\.status-completed/);
    assert.match(css, /premiumArenaTrophy/);
    assert.doesNotMatch(source, /largeWin|confettiThreshold|winnerAmount/);
});

test("Arena business and API contracts remain untouched by presentation", () => {
    assert.match(source, /arenaApiClient\.readyMatch\(matchId\)/);
    assert.match(source, /arenaApiClient\.setRoomCode\(matchId, roomCode\)/);
    assert.match(source, /openArenaEvidenceBot/);
    assert.doesNotMatch(css, /fetch\(|walletRequest|\/matches\//);
});

test("Premium Arena is responsive, accessible, low-end aware and haptic", () => {
    assert.match(css, /prefers-reduced-motion:reduce/);
    assert.match(css, /design-low-motion/);
    assert.match(css, /focus-visible/);
    assert.match(css, /contain:layout paint/);
    assert.match(design, /\.arena-v2-ready-button/);
    assert.ok(html.indexOf("premium-wheel.css") < html.indexOf("premium-arena.css"));
});
