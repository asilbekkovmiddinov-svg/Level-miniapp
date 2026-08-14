const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const context = { Date, Map };
vm.createContext(context);
vm.runInContext(
    fs.readFileSync("miniapp/pages/tournament-core.js", "utf8"),
    context,
);

function player(id, values = {}) {
    return {
        telegramId: id,
        name: `Player ${id}`,
        groupName: "A",
        played: 0,
        wins: 0,
        losses: 0,
        points: 0,
        ...values,
    };
}

test("normalizes public tournament participants and match schedule", () => {
    const value = context.normalizeTournamentOverview({
        tournament: {
            id: 3,
            name: "LEVEL Cup",
            format: "GROUP_PLAYOFF",
            max_participants: 16,
            ticket_cost: 10,
            qualifiers_per_group: 2,
        },
        tournament_tickets: 14,
        participant: { id: 7, telegram_id: 101, status: "APPROVED", group_name: "A" },
        participants: [{ id: 7, telegram_id: 101, username: "alpha", status: "APPROVED", group_name: "A" }],
        matches: [{ id: "m1", player_a_id: 101, player_b_id: 102, round_number: 1, status: "READY", arena_match_id: 44 }],
    });
    assert.equal(value.tournament.format, "GROUP_PLAYOFF");
    assert.equal(value.tournament.ticketCost, 10);
    assert.equal(value.ticketBalance, 14);
    assert.equal(value.participants[0].name, "alpha");
    assert.equal(value.matches[0].arenaMatchId, 44);
});

test("registration action follows application and date state", () => {
    const overview = {
        tournament: {
            status: "REGISTRATION",
            ticketCost: 10,
            registrationOpensAt: "2026-08-13T09:00:00Z",
            registrationClosesAt: "2026-08-13T12:00:00Z",
        },
        participant: null,
        ticketBalance: 10,
    };
    assert.equal(context.tournamentRegistrationState(
        overview, Date.parse("2026-08-13T10:00:00Z"),
    ).enabled, true);
    overview.participant = { status: "PENDING" };
    assert.equal(context.tournamentRegistrationState(overview).label, "Ko‘rib chiqilmoqda");
});

test("registration requires the full ten-ticket match entry", () => {
    const overview = {
        tournament: {
            status: "REGISTRATION",
            ticketCost: 10,
            registrationOpensAt: "2026-08-13T09:00:00Z",
            registrationClosesAt: "2026-08-13T12:00:00Z",
        },
        participant: null,
        ticketBalance: 9,
    };
    const now = Date.parse("2026-08-13T10:00:00Z");
    const blocked = context.tournamentRegistrationState(overview, now);
    assert.equal(blocked.enabled, false);
    assert.equal(blocked.label, "Kamida 10 ticket kerak");

    overview.ticketBalance = 10;
    assert.equal(context.tournamentRegistrationState(overview, now).enabled, true);
});

test("group standings sort points then wins", () => {
    const groups = context.tournamentGroupStandings([
        player(1, { points: 3, wins: 1 }),
        player(2, { points: 6, wins: 2 }),
        player(3, { groupName: "B", points: 1 }),
    ]);
    assert.deepEqual(Array.from(groups.A, (item) => item.telegramId), [2, 1]);
    assert.deepEqual(Array.from(groups.B, (item) => item.telegramId), [3]);
});

test("bracket excludes group matches and groups playoff rounds vertically", () => {
    const rounds = context.tournamentBracketRounds([
        { id: "g", groupName: "A", roundNumber: 1, scheduledAt: "2026-08-14" },
        { id: "q", groupName: null, roundNumber: 2, roundName: "Yarim final", scheduledAt: "2026-08-15" },
        { id: "f", groupName: null, roundNumber: 3, roundName: "Final", scheduledAt: "2026-08-16" },
    ]);
    assert.deepEqual(Array.from(rounds, (round) => round.roundNumber), [2, 3]);
});

test("own ready match wins priority and opens only for its player", () => {
    const overview = { matches: [
        { id: "later", playerAId: 101, playerBId: 103, status: "SCHEDULED", scheduledAt: "2026-08-15", arenaMatchId: null },
        { id: "ready", playerAId: 101, playerBId: 102, status: "READY", scheduledAt: "2026-08-14", arenaMatchId: 55 },
    ] };
    const match = context.tournamentMyMatch(overview, 101, Date.parse("2026-08-13"));
    assert.equal(match.id, "ready");
    assert.equal(context.tournamentCanOpenArena(match, 101), true);
    assert.equal(context.tournamentCanOpenArena(match, 999), false);
});

test("countdown renders without horizontal schedule text", () => {
    const label = context.tournamentCountdown(
        "2026-08-13T11:02:03Z", Date.parse("2026-08-13T10:00:00Z"),
    );
    assert.equal(label, "01:02:03");
});
