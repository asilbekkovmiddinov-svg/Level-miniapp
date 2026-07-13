const assert = require("node:assert/strict");
const test = require("node:test");

const {
    ArenaApiClient,
    ArenaApiError,
    arenaSkeleton,
    arenaState,
    normalizeMatch,
    runArenaMutation,
    arenaCountdown,
    renderArenaRoomPanel,
    copyArenaRoomCode,
    renderArenaEvidencePanel,
    openArenaEvidenceBot,
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

test("ready mutation posts an empty authenticated body without automatic retry", async () => {
    const calls = [];
    const client = new ArenaApiClient({
        baseUrl: "https://backend.example",
        initDataProvider: () => "verified-init-data",
        retries: 3,
        fetchImpl: async (url, options) => {
            calls.push({ url, options });
            return response({
                ...rawMatch,
                creator_ready: true,
                ready_window_started_at: "2030-01-01T11:55:00Z",
                ready_deadline_at: "2030-01-01T12:00:00Z",
            });
        },
    });

    const match = await client.readyMatch(42);
    assert.equal(calls.length, 1);
    assert.equal(new URL(calls[0].url).pathname, "/matches/42/ready");
    assert.equal(calls[0].options.method, "POST");
    assert.equal(calls[0].options.headers["X-Telegram-Init-Data"], "verified-init-data");
    assert.deepEqual(JSON.parse(calls[0].options.body), {});
    assert.equal(match.creatorReady, true);
    assert.equal(match.readyDeadlineAt, "2030-01-01T12:00:00Z");
});

test("countdown renders deterministic live and expired values", () => {
    const target = "2030-01-01T12:00:00.000Z";
    assert.equal(arenaCountdown(target, Date.parse("2030-01-01T11:54:59.000Z")), "05:01");
    assert.equal(arenaCountdown(target, Date.parse("2030-01-01T10:59:59.000Z")), "01:00:01");
    assert.equal(arenaCountdown(target, Date.parse("2030-01-01T12:00:01.000Z")), "00:00");
    assert.equal(arenaCountdown(null), "--:--");
});

test("ready error mapping is safe for all documented mutation statuses", async () => {
    for (const status of [400, 401, 403, 404, 409, 422]) {
        let calls = 0;
        const client = new ArenaApiClient({
            baseUrl: "https://backend.example",
            initDataProvider: () => "verified-init-data",
            retries: 3,
            fetchImpl: async () => {
                calls += 1;
                return response({ detail: `sensitive-ready-${status}` }, status);
            },
        });
        await assert.rejects(client.readyMatch(42), (error) => {
            assert.equal(error.status, status);
            assert.equal(error.message.includes("sensitive"), false);
            return true;
        });
        assert.equal(calls, 1, "Ready POST must never retry automatically");
    }
});

test("creator room code submit uses authenticated contract once", async () => {
    const calls = [];
    const client = new ArenaApiClient({
        baseUrl: "https://backend.example",
        initDataProvider: () => "verified-init-data",
        retries: 3,
        fetchImpl: async (url, options) => {
            calls.push({ url, options });
            return response({ ...rawMatch, status: "ROOM_READY", room_code: "ROOM-42" });
        },
    });

    const match = await client.setRoomCode(42, "  ROOM-42  ");
    assert.equal(calls.length, 1);
    assert.equal(new URL(calls[0].url).pathname, "/matches/42/room-code");
    assert.equal(calls[0].options.method, "POST");
    assert.equal(calls[0].options.headers["X-Telegram-Init-Data"], "verified-init-data");
    assert.deepEqual(JSON.parse(calls[0].options.body), { room_code: "ROOM-42" });
    assert.equal(match.roomCode, "ROOM-42");
});

test("room panel separates creator and opponent UX and follows polling data", () => {
    const storage = new Map();
    global.localStorage = {
        getItem: (key) => storage.get(key) || null,
        setItem: (key, value) => storage.set(key, value),
    };
    const roomReady = normalizeMatch({ ...rawMatch, status: "ROOM_READY", room_code: null });

    storage.set("arena-role-42", "creator");
    assert.match(renderArenaRoomPanel(roomReady), /arenaRoomCodeInput/);
    storage.set("arena-role-42", "opponent");
    const opponent = renderArenaRoomPanel(roomReady);
    assert.match(opponent, /Room code kutilmoqda/);
    assert.doesNotMatch(opponent, /arenaRoomCodeInput/);

    const updated = normalizeMatch({ ...rawMatch, status: "ROOM_READY", room_code: "POLL-777" });
    assert.match(renderArenaRoomPanel(updated), /POLL-777/);
    assert.equal(renderArenaRoomPanel(normalizeMatch({ ...rawMatch, status: "PLAYING" })), "");
    delete global.localStorage;
});

test("room code copy uses displayed value and reports clipboard result", async () => {
    let copied = null;
    Object.defineProperty(global, "navigator", {
        configurable: true,
        value: { clipboard: { writeText: async (value) => { copied = value; } } },
    });
    const button = {
        textContent: "Nusxalash",
        closest: () => ({ querySelector: () => ({ textContent: "SAFE-123" }) }),
    };
    assert.equal(await copyArenaRoomCode(button), true);
    assert.equal(copied, "SAFE-123");
    assert.equal(button.textContent, "Nusxalandi ✓");
    delete global.navigator;
});

test("room code validation and documented errors stay safe without POST retry", async () => {
    let emptyCalls = 0;
    const validationClient = new ArenaApiClient({
        baseUrl: "https://backend.example",
        initDataProvider: () => "verified-init-data",
        fetchImpl: async () => { emptyCalls += 1; },
    });
    await assert.rejects(validationClient.setRoomCode(42, "  "), (error) => error.status === 400);
    assert.equal(emptyCalls, 0);

    for (const status of [400, 401, 403, 404, 409, 422]) {
        let calls = 0;
        const client = new ArenaApiClient({
            baseUrl: "https://backend.example",
            initDataProvider: () => "verified-init-data",
            retries: 3,
            fetchImpl: async () => {
                calls += 1;
                return response({ detail: `private-room-${status}` }, status);
            },
        });
        await assert.rejects(client.setRoomCode(42, "ROOM"), (error) => {
            assert.equal(error.status, status);
            assert.equal(error.message.includes("private"), false);
            return true;
        });
        assert.equal(calls, 1);
    }
});

test("evidence progress normalizes backend participant flags", () => {
    const match = normalizeMatch({
        ...rawMatch,
        status: "PLAYING",
        my_screenshot_uploaded: true,
        my_video_uploaded: false,
    });
    assert.equal(match.myScreenshotUploaded, true);
    assert.equal(match.myVideoUploaded, false);
    assert.equal(normalizeMatch({ ...rawMatch }).myScreenshotUploaded, false);
});

test("evidence panel renders deterministic 0/2, 1/2 and 2/2 states", () => {
    const empty = normalizeMatch({ ...rawMatch, status: "PLAYING" });
    const one = normalizeMatch({ ...rawMatch, status: "PLAYING", my_screenshot_uploaded: true });
    const complete = normalizeMatch({
        ...rawMatch,
        status: "PLAYING",
        my_screenshot_uploaded: true,
        my_video_uploaded: true,
    });

    assert.match(renderArenaEvidencePanel(empty), /0 \/ 2/);
    assert.match(renderArenaEvidencePanel(empty), /Screenshot va video majburiy/);
    assert.match(renderArenaEvidencePanel(one), /1 \/ 2/);
    assert.match(renderArenaEvidencePanel(one), /Screenshot[\s\S]*Yuborildi/);
    assert.match(renderArenaEvidencePanel(one), /Yana bitta evidence qoldi/);
    assert.match(renderArenaEvidencePanel(complete), /2 \/ 2/);
    assert.match(renderArenaEvidencePanel(complete), /Evidence to‘liq topshirildi/);
    assert.match(renderArenaEvidencePanel(complete), /Admin tekshiradi/);
    assert.doesNotMatch(renderArenaEvidencePanel(complete), /Botga yuborish/);
});

test("polling response updates screenshot and video progress without media data", () => {
    const firstPoll = normalizeMatch({
        ...rawMatch,
        status: "PLAYING",
        my_screenshot_uploaded: false,
        my_video_uploaded: false,
    });
    const secondPoll = normalizeMatch({
        ...rawMatch,
        status: "PLAYING",
        my_screenshot_uploaded: true,
        my_video_uploaded: true,
    });
    assert.match(renderArenaEvidencePanel(firstPoll), /0 \/ 2/);
    assert.match(renderArenaEvidencePanel(secondPoll), /2 \/ 2/);
    assert.equal("screenshot_file_id" in secondPoll, false);
    assert.equal("video_file_id" in secondPoll, false);
    assert.equal(renderArenaEvidencePanel(normalizeMatch({ ...rawMatch, status: "WAITING_ADMIN" })), "");
});

test("evidence Bot action returns to the Telegram chat without sending media", () => {
    let closed = 0;
    let haptic = 0;
    global.Telegram = {
        WebApp: {
            close: () => { closed += 1; },
            HapticFeedback: { impactOccurred: () => { haptic += 1; } },
        },
    };
    assert.equal(openArenaEvidenceBot(42, "screenshot"), true);
    assert.equal(openArenaEvidenceBot(42, "video"), true);
    assert.equal(closed, 2);
    assert.equal(haptic, 2);
    delete global.Telegram;
});
