const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("miniapp/pages/division-core.js", "utf8");
const context = {
    URLSearchParams,
    Date,
    location: { search: "" },
    GLOBAL_DIVISION_UI_ENABLED: false,
};
vm.createContext(context);
vm.runInContext(source, context);

test("Division UI stays closed unless flag or preview is enabled", () => {
    assert.equal(context.divisionUiEnabled(), false);
    context.location.search = "?division_preview=1";
    assert.equal(context.divisionUiEnabled(), true);
});

test("standings normalizer keeps separate played, wins and losses", () => {
    const [row] = context.normalizeDivisionStandings({ items: [{
        rank: 1,
        telegram_id: 77,
        username: "player",
        matches_played: 8,
        wins: 5,
        losses: 3,
        points: 15,
        goal_difference: 6,
    }] });
    assert.deepEqual(
        { played: row.played, wins: row.wins, losses: row.losses, points: row.points },
        { played: 8, wins: 5, losses: 3, points: 15 },
    );
});

test("match normalizer preserves locked ticket state and Arena id", () => {
    const match = context.normalizeDivisionMatch({
        id: "division-1",
        status: "MATCHED",
        player_a_ticket_state: "LOCKED",
        player_b_ticket_state: "LOCKED",
        arena_match_id: 42,
    });
    assert.equal(match.playerATicketState, "LOCKED");
    assert.equal(match.playerBTicketState, "LOCKED");
    assert.equal(match.arenaMatchId, 42);
});

test("matchmaking stays disabled until the season is active", () => {
    assert.deepEqual(
        { ...context.divisionMatchAccess(
            { status: "REGISTRATION" },
            { tournamentTickets: 2 },
        ) },
        { enabled: false, label: "Season hali boshlanmagan" },
    );
    assert.deepEqual(
        { ...context.divisionMatchAccess(
            { status: "ACTIVE" },
            { tournamentTickets: 1 },
        ) },
        { enabled: true, label: "Raqib qidirish • 1 ticket" },
    );
});
