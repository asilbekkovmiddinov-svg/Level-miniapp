const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const arenaSource = fs.readFileSync(path.join(root, "miniapp/pages/arena.js"), "utf8");
const arenaStyles = fs.readFileSync(path.join(root, "miniapp/premium-arena.css"), "utf8");
const arena = require("../miniapp/pages/arena.js");

test("premium leaderboard renders podium, detailed ranks and current-user highlight", () => {
    assert.equal(typeof arena.arenaLeaderboardPodium, "function");
    assert.equal(typeof arena.arenaLeaderboardRow, "function");
    assert.match(arenaSource, /🥇.*🥈.*🥉/s);
    assert.match(arenaSource, /arenaIsCurrentPlayer/);
    assert.match(arenaSource, /is-current/);
    assert.match(arenaSource, /TOTAL WINS/);
    assert.match(arenaSource, /EFC WON/);
});

test("profile dashboard uses all authoritative stats and animated counters", () => {
    assert.equal(typeof arena.arenaAnimateCounters, "function");
    for (const field of [
        "totalMatches", "wins", "losses", "winRate", "totalEfcWon", "currentStreak", "bestStreak",
    ]) assert.match(arenaSource, new RegExp(`profile\\.${field}`));
    assert.match(arenaSource, /data-arena-counter/);
    assert.match(arenaSource, /prefers-reduced-motion: reduce/);
});

test("history is a premium player-versus timeline with result metadata", () => {
    const card = arena.arenaHistoryCard({
        id: 9, gameType: "EFOOTBALL", creatorName: "Player", opponentName: "Opponent",
        stakeEfc: "500", reward: "950", result: "WIN", status: "COMPLETED",
        createdAt: "2026-07-20T12:00:00Z", completedAt: "2026-07-20T12:30:00Z",
    });
    assert.match(card, /arena-v7-history-card/);
    assert.match(card, /arena-v7-history-versus/);
    assert.match(card, /VS/);
    assert.match(card, /500 EFC/);
    assert.match(card, /950 EFC/);
    assert.match(card, /result-win/);
});

test("achievements expose locked and unlocked premium badge states", () => {
    assert.equal(typeof arena.arenaAchievementItems, "function");
    const badges = arena.arenaAchievementItems({ wins: 1, bestStreak: 0 });
    assert.equal(badges.length, 4);
    assert.equal(badges[0].unlocked, true);
    assert.equal(badges[1].unlocked, false);
    assert.match(arenaSource, /First Win/);
    assert.match(arenaSource, /Win Streak/);
    assert.match(arenaSource, /Arena Master/);
    assert.match(arenaSource, /Top 100/);
});

test("empty states and unified motion system cover all Sprint 3 surfaces", () => {
    assert.equal(typeof arena.arenaPremiumEmpty, "function");
    assert.match(arena.arenaPremiumEmpty("leaderboard"), /arena-v7-empty/);
    assert.match(arena.arenaPremiumEmpty("history"), /Arena boshlash/);
    for (const selector of [
        ".arena-v7-podium", ".arena-v7-ranking-list", ".arena-v7-stat-grid",
        ".arena-v7-achievements", ".arena-v7-history", ".arena-v7-empty",
    ]) assert.match(arenaStyles, new RegExp(selector.replaceAll(".", "\\.")));
    assert.match(arenaStyles, /@keyframes arenaV7Reveal/);
    assert.match(arenaStyles, /@media\(prefers-reduced-motion:reduce\)/);
});
