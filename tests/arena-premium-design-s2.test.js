const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const arenaSource = fs.readFileSync(path.join(root, "miniapp/pages/arena.js"), "utf8");
const arenaStyles = fs.readFileSync(path.join(root, "miniapp/premium-arena.css"), "utf8");
const arena = require("../miniapp/pages/arena.js");

test("premium match room exposes player header, VS and authoritative player stats", () => {
    assert.match(arenaSource, /arenaMatchRoomHeader\(match\)/);
    assert.match(arenaSource, /arenaTelegramProfile\(\)/);
    assert.match(arenaSource, /arenaView\.playerProfile/);
    assert.match(arenaSource, /class="arena-v6-versus"/);
    assert.doesNotMatch(arenaSource, /opponentWinRate|opponentTotalMatches/);
});

test("premium timeline maps existing Arena statuses without changing lifecycle calls", () => {
    assert.match(arenaSource, /WAITING.*READY.*PLAYING/s);
    assert.match(arenaSource, /UPLOAD.*ADMIN REVIEW.*FINISHED/s);
    assert.match(arenaSource, /aria-current="step"/);
    assert.equal(typeof arena.renderArenaMatchDetail, "function");
    assert.equal(typeof arena.renderArenaRoomPanel, "function");
    assert.equal(typeof arena.renderArenaEvidencePanel, "function");
});

test("completed match renders winner and authoritative reward presentation", () => {
    assert.match(arenaSource, /function arenaMatchResult\(match\)/);
    assert.match(arenaSource, /match\.winnerReward/);
    assert.match(arenaSource, /Platforma komissiyasi/);
    assert.match(arenaSource, /match\.status !== "COMPLETED"/);
});

test("match room styling includes glass actions, responsive and reduced motion states", () => {
    for (const selector of [
        ".arena-v6-room-header",
        ".arena-v6-player-avatar",
        ".arena-v6-timeline",
        ".arena-v6-result",
        ".arena-v2-ready-panel",
        ".arena-v2-evidence-panel",
    ]) {
        assert.match(arenaStyles, new RegExp(selector.replaceAll(".", "\\.")));
    }
    assert.match(arenaStyles, /@media\(max-width:370px\)/);
    assert.match(arenaStyles, /@media\(prefers-reduced-motion:reduce\)/);
    assert.match(arenaStyles, /contain:layout paint/);
});
