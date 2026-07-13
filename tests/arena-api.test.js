const assert = require("node:assert/strict");
const test = require("node:test");

const {
    ArenaApiClient,
    ArenaApiError,
    arenaSkeleton,
    arenaState,
    normalizeMatch,
} = require("../miniapp/pages/arena.js");

function response(payload, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => payload,
    };
}

const rawMatch = {
    id: 42,
    game_type: "EFOOTBALL",
    creator_display_name: "Ali",
    opponent_display_name: "Vali",
    efc_amount: "100",
    total_pool: "200",
    winner_reward: "190",
    status: "WAITING_READY",
    scheduled_at: "2030-01-01T12:00:00Z",
    creator_ready: false,
    opponent_ready: false,
};

test("all Arena reads send verified initData and production paths", async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
        calls.push({ url, options });
        if (url.includes("/matches/open") || url.includes("/matches/me")) {
            return response({ matches: [rawMatch] });
        }
        if (url.includes("/matches/stats/me")) return response({ total_matches: 1 });
        if (url.includes("/matches/leaderboard")) return response({ users: [] });
        if (url.includes("/matches/guide")) return response({ guide: "Qoidalar" });
        return response(rawMatch);
    };
    const client = new ArenaApiClient({
        baseUrl: "https://backend.example",
        initDataProvider: () => "verified-init-data",
        fetchImpl,
        retries: 0,
    });

    await client.openMatches();
    await client.myMatches();
    await client.match(42);
    await client.stats();
    await client.leaderboard();
    await client.guide();

    assert.deepEqual(
        calls.map((call) => new URL(call.url).pathname),
        [
            "/matches/open",
            "/matches/me",
            "/matches/42",
            "/matches/stats/me",
            "/matches/leaderboard",
            "/matches/guide",
        ],
    );
    calls.forEach((call) => {
        assert.equal(call.options.headers["X-Telegram-Init-Data"], "verified-init-data");
        assert.equal(call.options.headers["X-Internal-Api-Key"], undefined);
    });
});

test("missing initData is rejected before network", async () => {
    let called = false;
    const client = new ArenaApiClient({
        baseUrl: "https://backend.example",
        initDataProvider: () => "",
        fetchImpl: async () => { called = true; },
    });
    await assert.rejects(client.openMatches(), (error) => {
        assert.equal(error.status, 401);
        return true;
    });
    assert.equal(called, false);
});

test("temporary backend failure retries without exposing raw detail", async () => {
    let attempts = 0;
    const client = new ArenaApiClient({
        baseUrl: "https://backend.example",
        initDataProvider: () => "init-data",
        retries: 1,
        fetchImpl: async () => {
            attempts += 1;
            return attempts === 1
                ? response({ detail: "private stack trace" }, 503)
                : response({ matches: [] });
        },
    });
    assert.deepEqual(await client.openMatches(), []);
    assert.equal(attempts, 2);
});

test("safe HTTP mapping and malformed response validation", async () => {
    const denied = new ArenaApiClient({
        baseUrl: "https://backend.example",
        initDataProvider: () => "init-data",
        retries: 0,
        fetchImpl: async () => response({ detail: "secret" }, 403),
    });
    await assert.rejects(denied.match(42), (error) => {
        assert.equal(error.status, 403);
        assert.equal(error.message.includes("secret"), false);
        return true;
    });
    assert.throws(() => normalizeMatch({ id: "42", status: "PLAYING" }), ArenaApiError);
});

test("network failure returns safe retryable error", async () => {
    const client = new ArenaApiClient({
        baseUrl: "https://backend.example",
        initDataProvider: () => "init-data",
        retries: 1,
        fetchImpl: async () => { throw new Error("private network detail"); },
    });
    await assert.rejects(client.openMatches(), (error) => {
        assert.equal(error.retryable, true);
        assert.equal(error.message.includes("private"), false);
        return true;
    });
});

test("timeout aborts safely and loading/error states are renderable", async () => {
    const client = new ArenaApiClient({
        baseUrl: "https://backend.example",
        initDataProvider: () => "init-data",
        retries: 0,
        timeoutMs: 50,
        fetchImpl: (_url, options) => new Promise((_resolve, reject) => {
            options.signal.addEventListener("abort", () => {
                const error = new Error("private timeout detail");
                error.name = "AbortError";
                reject(error);
            });
        }),
    });
    await assert.rejects(client.openMatches(), (error) => {
        assert.equal(error.retryable, true);
        assert.match(error.message, /javob bermadi/);
        return true;
    });
    assert.match(arenaSkeleton(), /arena-v2-skeleton/);
    assert.match(arenaState("Xatolik", "Qayta urinib ko‘ring"), /retryArenaView/);
});
