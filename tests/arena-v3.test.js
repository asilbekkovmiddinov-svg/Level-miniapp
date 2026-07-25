const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
    ARENA_V3_STAKES,
    arenaStakeValue,
    arenaMatchesForStake,
    arenaStakeNavigation,
    normalizeMatch,
    renderArenaEvidencePanel,
} = require("../miniapp/pages/arena.js");

const source = fs.readFileSync(path.join(__dirname, "../miniapp/pages/arena.js"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "../miniapp/premium-arena.css"), "utf8");

test("Arena V3 exposes exactly five authoritative stake rooms", () => {
    assert.deepEqual(ARENA_V3_STAKES, [100, 500, 1000, 5000, 10000]);
    assert.equal(arenaStakeValue(5000), 5000);
    assert.equal(arenaStakeValue(250), 100);
    const lobby = arenaStakeNavigation();
    ARENA_V3_STAKES.forEach((stake) => assert.match(lobby, new RegExp(`data-arena-stake="${stake}"`)));
});

test("stake lobby displays only rooms for the selected stake", () => {
    const matches = [
        { id: 1, stakeEfc: "100" },
        { id: 2, stakeEfc: "500" },
        { id: 3, stakeEfc: "100" },
    ];
    assert.deepEqual(arenaMatchesForStake(matches, 100).map((match) => match.id), [1, 3]);
    assert.deepEqual(arenaMatchesForStake(matches, 500).map((match) => match.id), [2]);
});

test("quick match reuses open rooms and creates only when none is available", () => {
    assert.match(source, /find\(\(match\) => match\.status === "WAITING_PLAYER"\)/);
    assert.match(source, /arenaApiClient\.acceptMatch\(open\.id/);
    assert.match(source, /arenaApiClient\.createMatch\(\{/);
    assert.match(source, /stakeEfc: stake/);
    assert.match(source, /rulesAccepted: true/);
    assert.match(source, /if \(error\.status !== 409\) throw error/);
});

test("Room ID and payout presentation stay backend authoritative", () => {
    const match = normalizeMatch({
        id: 73,
        status: "COMPLETED",
        efc_amount: "500",
        total_pool: "1000",
        winner_reward: "950",
    });
    assert.equal(match.id, 73);
    assert.equal(match.totalPool, "1000");
    assert.equal(match.winnerReward, "950");
    assert.match(source, /ROOM #\$\{match\.id\}/);
    assert.match(source, /<span>Platforma komissiyasi<\/span><b>5%<\/b>/);
    assert.doesNotMatch(source, /winnerReward\s*=\s*|totalPool\s*\*\s*\.95/);
});

test("each participant must submit screenshot and video before admin review", () => {
    const panel = renderArenaEvidencePanel({
        id: 73,
        status: "PLAYING",
        myScreenshotUploaded: false,
        myVideoUploaded: false,
    });
    assert.match(panel, /Screenshot/);
    assert.match(panel, /Video/);
    assert.match(panel, /har bir o‘yinchi ikkalasini ham topshiradi/);
    assert.match(source, /status WAITING_ADMIN bo‘ladi/);
    assert.match(css, /arena-v3-stake-grid/);
    assert.match(css, /prefers-reduced-motion:reduce/);
});
