const test = require("node:test");
const assert = require("node:assert/strict");

const {
    ArenaApiClient,
    normalizeMatch,
    normalizeArenaStakeMetrics,
    normalizeArenaProfile,
    normalizeArenaLeaderboardUser,
    arenaStakeNavigation,
    arenaHistoryCard,
    arenaProfileView,
    arenaLeaderboardRow,
    arenaQuickMatchLoading,
    arenaWaitTime,
} = require("../miniapp/pages/arena.js");

function response(payload) {
    return { ok: true, status: 200, json: async () => payload };
}

test("Arena V4 client uses authenticated production contracts", async () => {
    const calls = [];
    const client = new ArenaApiClient({
        baseUrl: "https://backend.example",
        initDataProvider: () => "verified-init-data",
        retries: 0,
        fetchImpl: async (url, options) => {
            calls.push({ url, options });
            if (url.includes("/dashboard")) return response({ stakes: [{ stake: 100, online_players: 3, open_rooms: 2, average_wait_time: 45 }] });
            if (url.includes("/profile")) return response({ total_matches: 4, wins: 3, losses: 1, win_rate: "75", total_efc_won: "950", current_streak: 2, best_streak: 3 });
            return response({ period: "weekly", users: [] });
        },
    });

    await client.dashboard();
    await client.profile();
    await client.v4Leaderboard({ period: "weekly", limit: 100 });

    assert.deepEqual(calls.map((call) => new URL(call.url).pathname), [
        "/arena/dashboard", "/arena/profile", "/arena/leaderboard",
    ]);
    assert.equal(new URL(calls[2].url).searchParams.get("period"), "weekly");
    assert.equal(new URL(calls[2].url).searchParams.get("limit"), "100");
    calls.forEach((call) => assert.equal(call.options.headers["X-Telegram-Init-Data"], "verified-init-data"));
});

test("stake dashboard renders five cards and authoritative metrics", () => {
    const metric = normalizeArenaStakeMetrics({ stake: 100, online_players: 7, open_rooms: 3, average_wait_time: 95 });
    assert.deepEqual(metric, { stake: 100, onlinePlayers: 7, openRooms: 3, averageWaitTime: 95 });
    assert.equal(arenaWaitTime(95), "2 daqiqa");
    const lobby = arenaStakeNavigation();
    [100, 500, 1000, 5000, 10000].forEach((stake) => assert.match(lobby, new RegExp(`data-arena-stake="${stake}"`)));
});

test("history uses backend result reward and timestamps", () => {
    const match = normalizeMatch({
        id: 8,
        status: "COMPLETED",
        game: "EFOOTBALL",
        game_type: "EFOOTBALL",
        stake: "500",
        efc_amount: "500",
        result: "WIN",
        reward: "950",
        created_at: "2026-07-25T10:00:00Z",
        completed_at: "2026-07-25T10:30:00Z",
    });
    const html = arenaHistoryCard(match);
    assert.match(html, /EFOOTBALL/);
    assert.match(html, /500 EFC/);
    assert.match(html, /WIN/);
    assert.match(html, /950 EFC/);
    assert.match(html, /Yakunlangan/);
});

test("profile and leaderboard render every V4 metric", () => {
    const profile = normalizeArenaProfile({
        total_matches: 10, wins: 7, losses: 3, win_rate: "70",
        total_efc_won: "2500", current_streak: 2, best_streak: 5,
    });
    const profileHtml = arenaProfileView(profile);
    ["Total Matches", "Wins", "Losses", "Win Rate", "Total EFC Won", "Current Streak", "Best Streak"]
        .forEach((label) => assert.match(profileHtml, new RegExp(label)));

    const user = normalizeArenaLeaderboardUser({
        rank: 1, display_name: "Ali", wins: 7, losses: 3,
        win_rate: "70", total_matches: 10, total_efc_won: "2500",
    });
    const row = arenaLeaderboardRow(user);
    assert.match(row, /#1/);
    assert.match(row, /Ali/);
    assert.match(row, /7W · 3L · 10 match/);
    assert.match(row, /70%/);
    assert.match(row, /2500 EFC/);
});

test("quick matchmaking has a premium accessible loading state", () => {
    const html = arenaQuickMatchLoading(1000);
    assert.match(html, /role="status"/);
    assert.match(html, /aria-live="polite"/);
    assert.match(html, /Raqib qidirilmoqda/);
    assert.match(html, /1000 EFC/);
});
