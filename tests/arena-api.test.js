const assert = require("node:assert/strict");
const test = require("node:test");

const {
    ArenaApiClient,
    ArenaApiError,
    arenaSkeleton,
    arenaState,
    normalizeMatch,
    runArenaMutation,
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

test("create mutation uses authenticated production contract without identity fields", async () => {
    const calls = [];
    const client = new ArenaApiClient({
        baseUrl: "https://backend.example",
        initDataProvider: () => "verified-init-data",
        retries: 2,
        fetchImpl: async (url, options) => {
            calls.push({ url, options });
            return response({ ...rawMatch, status: "WAITING_PLAYER" });
        },
    });

    const match = await client.createMatch({
        gameType: "EFOOTBALL",
        stakeEfc: 100,
        scheduledAt: "2030-01-01T12:00:00.000Z",
        rulesAccepted: true,
    });

    assert.equal(match.id, 42);
    assert.equal(calls.length, 1, "POST mutations must not retry automatically");
    assert.equal(new URL(calls[0].url).pathname, "/matches/");
    assert.equal(calls[0].options.method, "POST");
    assert.equal(calls[0].options.headers["X-Telegram-Init-Data"], "verified-init-data");
    assert.equal(calls[0].options.headers["Content-Type"], "application/json");
    const body = JSON.parse(calls[0].options.body);
    assert.deepEqual(body, {
        game_type: "EFOOTBALL",
        stake_efc: 100,
        scheduled_at: "2030-01-01T12:00:00.000Z",
        rules_accepted: true,
    });
    assert.equal("telegram_id" in body, false);
    assert.equal("username" in body, false);
});

test("join mutation sends only rules acceptance and verified initData", async () => {
    let call;
    const client = new ArenaApiClient({
        baseUrl: "https://backend.example",
        initDataProvider: () => "verified-init-data",
        retries: 0,
        fetchImpl: async (url, options) => {
            call = { url, options };
            return response(rawMatch);
        },
    });

    await client.acceptMatch(42, { rulesAccepted: true });
    assert.equal(new URL(call.url).pathname, "/matches/42/accept");
    assert.equal(call.options.method, "POST");
    assert.equal(call.options.headers["X-Telegram-Init-Data"], "verified-init-data");
    assert.deepEqual(JSON.parse(call.options.body), { rules_accepted: true });
});

test("rules acceptance is required before create or join reaches the network", async () => {
    let calls = 0;
    const client = new ArenaApiClient({
        baseUrl: "https://backend.example",
        initDataProvider: () => "verified-init-data",
        fetchImpl: async () => { calls += 1; },
    });

    await assert.rejects(
        client.createMatch({ gameType: "EFOOTBALL", stakeEfc: 100, scheduledAt: "2030-01-01T12:00:00Z", rulesAccepted: false }),
        (error) => error instanceof ArenaApiError && error.status === 400,
    );
    await assert.rejects(
        client.acceptMatch(42, { rulesAccepted: false }),
        (error) => error instanceof ArenaApiError && error.status === 400,
    );
    assert.equal(calls, 0);
});

test("mutation guard blocks double submit while the first request is pending", async () => {
    let release;
    let calls = 0;
    const pending = new Promise((resolve) => { release = resolve; });
    const first = runArenaMutation(async () => {
        calls += 1;
        await pending;
        return "created";
    });
    const second = await runArenaMutation(async () => {
        calls += 1;
        return "duplicate";
    });

    assert.equal(second, null);
    assert.equal(calls, 1);
    release();
    assert.equal(await first, "created");
});

test("mutation HTTP errors are safe and map expected backend statuses", async () => {
    for (const status of [400, 401, 403, 404, 409, 422]) {
        const client = new ArenaApiClient({
            baseUrl: "https://backend.example",
            initDataProvider: () => "verified-init-data",
            retries: 2,
            fetchImpl: async () => response({ detail: `private-${status}` }, status),
        });
        await assert.rejects(client.acceptMatch(42, { rulesAccepted: true }), (error) => {
            assert.equal(error.status, status);
            assert.equal(error.message.includes("private"), false);
            return true;
        });
    }
});
