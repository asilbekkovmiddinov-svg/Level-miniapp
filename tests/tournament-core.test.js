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
            ticket_cost: 7,
            group_count: 2,
            group_size: 8,
            group_mode: "POINTS",
            qualifiers_per_group: 2,
        },
        tournament_tickets: 14,
        participant_count: 16,
        match_count: 6,
        participant: { id: 7, telegram_id: 101, status: "APPROVED", group_name: "A", entry_ticket_state: "SPENT" },
        participants: [{ id: 7, telegram_id: 101, username: "alpha", status: "APPROVED", group_name: "A", goals_for: 3, goals_against: 1 }],
        matches: [{ id: "m1", player_a_id: 101, player_b_id: 102, round_number: 1, status: "SCHEDULED" }],
    });
    assert.equal(value.tournament.format, "GROUP_PLAYOFF");
    assert.equal(value.tournament.ticketCost, 7);
    assert.equal(value.tournament.groupSize, 8);
    assert.equal(value.tournament.groupMode, "POINTS");
    assert.equal(value.ticketBalance, 14);
    assert.equal(value.participantCount, 16);
    assert.equal(value.matchCount, 6);
    assert.equal(value.participants[0].name, "alpha");
    assert.equal(value.participants[0].goalsFor, 3);
    assert.equal(value.participant.entryTicketState, "SPENT");
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
    overview.participant = { status: "APPROVED" };
    assert.equal(context.tournamentRegistrationState(overview).label, "Tasdiqlangan");
});

test("registration requires the configured one-time entry ticket", () => {
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

test("group standings sort points wins and goal difference", () => {
    const groups = context.tournamentGroupStandings([
        player(1, { points: 3, wins: 1, goalsFor: 2, goalsAgainst: 1 }),
        player(2, { points: 3, wins: 1, goalsFor: 4, goalsAgainst: 1 }),
        player(3, { groupName: "B", points: 1 }),
    ]);
    assert.deepEqual(Array.from(groups.A, (item) => item.telegramId), [2, 1]);
    assert.deepEqual(Array.from(groups.B, (item) => item.telegramId), [3]);
});

test("countdown renders without horizontal schedule text", () => {
    const label = context.tournamentCountdown(
        "2026-08-13T11:02:03Z", Date.parse("2026-08-13T10:00:00Z"),
    );
    assert.equal(label, "01:02:03");
});
