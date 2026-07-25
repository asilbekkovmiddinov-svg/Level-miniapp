const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const arenaSource = fs.readFileSync(path.join(root, "miniapp/pages/arena.js"), "utf8");
const arenaStyles = fs.readFileSync(path.join(root, "miniapp/premium-arena.css"), "utf8");
const arena = require("../miniapp/pages/arena.js");

test("Arena entrance uses branded logo, red particles and reduced-motion safe transition", () => {
    const overlay = arena.arenaEntranceOverlay();
    assert.match(overlay, /LEVEL/);
    assert.match(overlay, /GROUP/);
    assert.equal((overlay.match(/<i style=/g) || []).length, 14);
    assert.match(arenaStyles, /\.arena-v8-entry/);
    assert.match(arenaStyles, /@keyframes arenaV8Particle/);
});

test("live match indicators cover waiting, playing and live states", () => {
    assert.match(arena.arenaLiveBadge("WAITING_PLAYER"), /WAITING/);
    assert.match(arena.arenaLiveBadge("ROOM_READY"), /PLAYING/);
    assert.match(arena.arenaLiveBadge("PLAYING"), /LIVE/);
    assert.equal(arena.arenaLiveBadge("COMPLETED"), "");
    assert.match(arenaStyles, /@keyframes arenaV8Live/);
});

test("avatar experience prepares online, crown, MVP and level presentation", () => {
    assert.equal(arena.arenaPlayerLevel(0), 1);
    assert.equal(arena.arenaPlayerLevel(25), 6);
    for (const token of [
        "arena-v8-avatar-online", "arena-v8-avatar-crown", "arena-v8-avatar-mvp", "arena-v8-avatar-level",
    ]) assert.match(arenaSource, new RegExp(token));
    assert.match(arenaStyles, /\.arena-v7-avatar\.is-lg/);
});

test("ready, victory, defeat and waiting glass modals are presentational only", () => {
    const ready = arena.arenaPremiumModal({ id: 2, status: "WAITING_READY", result: null });
    const victory = arena.arenaPremiumModal({ id: 2, status: "COMPLETED", result: "WIN" });
    const defeat = arena.arenaPremiumModal({ id: 2, status: "COMPLETED", result: "LOSE" });
    const waiting = arena.arenaPremiumModal({ id: 2, status: "WAITING_PLAYER", result: null });
    assert.match(ready, /READY\?/);
    assert.match(victory, /VICTORY/);
    assert.match(defeat, /DEFEAT/);
    assert.match(waiting, /WAITING/);
    assert.match(arenaStyles, /backdrop-filter:blur/);
});

test("sound and haptic preparation exposes inert semantic UI hooks", () => {
    assert.equal(arena.ARENA_UI_HOOKS.VICTORY, "victory");
    assert.equal(arena.ARENA_UI_HOOKS.BUTTON_CLICK, "button-click");
    assert.equal(arena.ARENA_UI_HOOKS.MATCH_FOUND, "match-found");
    assert.equal(arena.arenaEmitUiHook("victory"), false);
    const hookBody = arena.arenaEmitUiHook.toString();
    assert.doesNotMatch(hookBody, /Audio\(|\.play\(|vibrate\(|HapticFeedback/);
});

test("final button and motion system includes ripple, shine, depth and disabled states", () => {
    for (const token of [
        ".arena-v8 button", ".arena-v8-button-ripple", "button::after", "button:active", "button:disabled",
        ".arena-v8-modal", ".arena-v8-avatar-online",
    ]) assert.match(arenaStyles, new RegExp(token.replaceAll(".", "\\.")));
    assert.match(arenaStyles, /@media\(prefers-reduced-motion:reduce\)/);
});
