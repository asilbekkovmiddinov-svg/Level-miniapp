const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const arena = require("../miniapp/pages/arena.js");
const arenaSource = fs.readFileSync(path.join(root, "miniapp/pages/arena.js"), "utf8");
const arenaStyles = fs.readFileSync(path.join(root, "miniapp/premium-arena.css"), "utf8");

const cases = [
    ["COMPLETED + WIN", "COMPLETED", "WIN", "WIN", "win"],
    ["COMPLETED + LOSE", "COMPLETED", "LOSE", "LOSE", "lose"],
    ["COMPLETED + DRAW", "COMPLETED", "DRAW", "DRAW", "draw"],
    ["COMPLETED + null result", "COMPLETED", null, "COMPLETED", "completed"],
    ["WAITING_PLAYER", "WAITING_PLAYER", null, "⌛ WAITING", "waiting"],
    ["WAITING_ADMIN", "WAITING_ADMIN", null, "◆ ADMIN REVIEW", "review"],
    ["CANCELLED", "CANCELLED", null, "✕ CANCELLED", "cancelled"],
];

for (const [name, status, result, label, tone] of cases) {
    test(`history badge maps ${name}`, () => {
        const match = {
            id: 4,
            gameType: "EFOOTBALL",
            creatorName: "Player",
            opponentName: "Opponent",
            stakeEfc: "500",
            reward: "950",
            status,
            result,
            createdAt: "2026-07-25T14:29:00Z",
        };
        assert.deepEqual(arena.arenaHistoryBadge(match), { label, tone });
        const card = arena.arenaHistoryCard(match);
        assert.match(card, new RegExp(`result-${tone}`));
        assert.ok(card.includes(label));
    });
}

test("history badge uses lifecycle status instead of a pending result fallback", () => {
    assert.doesNotMatch(arenaSource, /match\.result\s*\|\|\s*["']PENDING["']/);
});

test("history lifecycle tones and reduced-motion fallback are present", () => {
    for (const tone of ["win", "lose", "draw", "cancelled", "waiting", "review", "completed"]) {
        assert.ok(arenaStyles.includes(`.result-${tone} .arena-v7-result-badge`));
    }
    assert.match(
        arenaStyles,
        /@media\(prefers-reduced-motion:reduce\)\{[^}]*\.arena-v7-history-card[^}]*animation:none/,
    );
});
