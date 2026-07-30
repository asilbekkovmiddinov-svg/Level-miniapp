const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
    ArenaV3Client,
    ArenaV3ClientError,
    normalizeArenaV3Match,
    ARENA_V3_TIMELINE,
    arenaV3StatusIndex,
} = require("../miniapp/pages/arena-v3.js");

function response(payload, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => payload,
    };
}

const match = {
    id: 17,
    public_id: "AV3-17",
    owner_id: 1,
    opponent_id: null,
    owner_efootball_username: "LEVEL_FC",
    opponent_efootball_username: null,
    stake_efc: "500.00",
    match_type: "STANDARD",
    match_time_minutes: 10,
    status: "OPEN",
    created_at: "2026-07-30T10:00:00Z",
};

test("Arena V3 open and active use authenticated backend contracts", async () => {
    const calls = [];
    const client = new ArenaV3Client({
        baseUrl: "https://api.test",
        initDataProvider: () => "signed-init-data",
        fetchImpl: async (url, options) => {
            calls.push([url, options]);
            return url.includes("/open") ? response({ matches: [match] }) : response({ match });
        },
    });
    assert.equal((await client.open())[0].id, 17);
    assert.equal((await client.active()).publicId, "AV3-17");
    assert.deepEqual(calls.map(([url]) => url), [
        "https://api.test/arena/open?limit=50&offset=0",
        "https://api.test/arena/active",
    ]);
    assert.ok(calls.every(([, options]) => options.headers["X-Telegram-Init-Data"] === "signed-init-data"));
});

test("Arena V3 create sends validated architecture fields and idempotency", async () => {
    let request;
    const client = new ArenaV3Client({
        initDataProvider: () => "auth",
        fetchImpl: async (url, options) => {
            request = { url, options };
            return response(match);
        },
    });
    await client.create({ username: "LEVEL_FC", stake: 500, matchType: "STANDARD", matchTime: 10 });
    assert.equal(request.url, "/arena/create");
    assert.equal(request.options.method, "POST");
    assert.match(request.options.headers["Idempotency-Key"], /^arena-v3-create-/);
    assert.deepEqual(JSON.parse(request.options.body), {
        owner_efootball_username: "LEVEL_FC",
        stake_efc: 500,
        match_type: "STANDARD",
        match_time_minutes: 10,
        extra_time_enabled: false,
        penalties_enabled: true,
        rules_accepted: true,
    });
});

test("Arena V3 join uses path id and opponent identity", async () => {
    let request;
    const client = new ArenaV3Client({
        initDataProvider: () => "auth",
        fetchImpl: async (url, options) => {
            request = { url, options };
            return response({ ...match, opponent_id: 2, status: "READY" });
        },
    });
    const result = await client.join(17, "RIVAL_FC");
    assert.equal(request.url, "/arena/17/join");
    assert.equal(result.status, "READY");
    assert.deepEqual(JSON.parse(request.options.body), {
        opponent_efootball_username: "RIVAL_FC",
        rules_accepted: true,
    });
});

test("missing Telegram authentication fails before network", async () => {
    const client = new ArenaV3Client({
        initDataProvider: () => "",
        fetchImpl: async () => assert.fail("network must not be called"),
    });
    await assert.rejects(() => client.open(), (error) =>
        error instanceof ArenaV3ClientError && error.status === 401);
});

test("server errors are converted to safe UI messages", async () => {
    const client = new ArenaV3Client({
        initDataProvider: () => "auth",
        fetchImpl: async () => response({ detail: "internal secret" }, 409),
    });
    await assert.rejects(() => client.open(), /Match holati o‘zgargan/);
});

test("match payload is normalized and malformed payload rejected", () => {
    const result = normalizeArenaV3Match(match);
    assert.equal(result.stake, "500.00");
    assert.equal(result.matchType, "STANDARD");
    assert.throws(() => normalizeArenaV3Match({ id: "17", status: "OPEN" }), ArenaV3ClientError);
});

test("status timeline matches the frozen Arena V3 lifecycle", () => {
    assert.deepEqual(ARENA_V3_TIMELINE.map(([status]) => status), [
        "OPEN", "READY", "WAITING_ROOM_CODE", "PLAYING",
        "WAITING_SCREENSHOT", "AI_REVIEW", "FINISHED",
    ]);
    assert.equal(arenaV3StatusIndex("AI_REVIEW"), 5);
    assert.equal(arenaV3StatusIndex("CANCELLED"), -1);
});

test("entrypoint loads V3 after legacy Arena without modifying legacy module", () => {
    const html = fs.readFileSync(path.join(__dirname, "../miniapp/index.html"), "utf8");
    assert.ok(html.indexOf("pages/arena-v3.js") > html.indexOf("pages/arena.js"));
    assert.match(html, /arena-v3\.css/);
});

test("responsive, dark glass, skeleton and reduced-motion styles are present", () => {
    const css = fs.readFileSync(path.join(__dirname, "../miniapp/arena-v3.css"), "utf8");
    assert.match(css, /backdrop-filter:blur/);
    assert.match(css, /arena-v3x-skeleton/);
    assert.match(css, /@media\(max-width:420px\)/);
    assert.match(css, /prefers-color-scheme:light/);
    assert.match(css, /prefers-reduced-motion:reduce/);
});

test("deferred modules are cards only and make no backend calls", () => {
    const source = fs.readFileSync(path.join(__dirname, "../miniapp/pages/arena-v3.js"), "utf8");
    assert.match(source, /\["history".+false\]/);
    assert.match(source, /\["ranking".+false\]/);
    assert.match(source, /\["profile".+false\]/);
    assert.doesNotMatch(source, /request\("\/arena\/(?:history|ranking|profile|room-code|upload-screenshot)/);
});

test("match detail, ready, room code and cancel use exact V3 contracts", async () => {
    const calls = [];
    const client = new ArenaV3Client({
        initDataProvider: () => "auth",
        fetchImpl: async (url, options) => {
            calls.push({ url, options });
            return response({
                ...match,
                status: url.endsWith("/ready") ? "READY"
                    : url.endsWith("/room-code") ? "PLAYING"
                        : url.endsWith("/cancel") ? "CANCELLED" : "OPEN",
            });
        },
    });
    await client.detail(17);
    await client.ready(17);
    await client.submitRoomCode(17, "  A7B  ");
    await client.cancel(17);
    assert.deepEqual(calls.map(({ url }) => url), [
        "/arena/17", "/arena/17/ready", "/arena/17/room-code", "/arena/17/cancel",
    ]);
    assert.equal(calls[1].options.body, "{}");
    assert.deepEqual(JSON.parse(calls[2].options.body), { room_code: "A7B" });
    assert.deepEqual(JSON.parse(calls[3].options.body), { reason_code: "USER_CANCELLED" });
    assert.match(calls[3].options.headers["Idempotency-Key"], /^arena-v3-cancel-17-/);
});

test("room code validation blocks invalid input before network", async () => {
    let called = false;
    const client = new ArenaV3Client({
        initDataProvider: () => "auth",
        fetchImpl: async () => {
            called = true;
            return response(match);
        },
    });
    await assert.rejects(() => client.submitRoomCode(17, ""), /1–8/);
    await assert.rejects(() => client.submitRoomCode(17, "123456789"), /1–8/);
    assert.equal(called, false);
});

test("ready and room fields are normalized from authoritative response", () => {
    const normalized = normalizeArenaV3Match({
        ...match,
        owner_ready_at: "2026-07-30T10:01:00Z",
        opponent_ready_at: null,
        room_code: "ABC7",
        playing_started_at: "2026-07-30T10:02:00Z",
        updated_at: "2026-07-30T10:02:00Z",
    });
    assert.equal(normalized.ownerReadyAt, "2026-07-30T10:01:00Z");
    assert.equal(normalized.opponentReadyAt, null);
    assert.equal(normalized.roomCode, "ABC7");
    assert.equal(normalized.playingStartedAt, "2026-07-30T10:02:00Z");
});

test("Sprint 2 UI contains detail, ready, room, playing and cancel states", () => {
    const source = fs.readFileSync(path.join(__dirname, "../miniapp/pages/arena-v3.js"), "utf8");
    assert.match(source, /MATCH DETAIL/);
    assert.match(source, /Player Ready/);
    assert.match(source, /Opponent Ready/);
    assert.match(source, /arenaV3RoomCodeForm/);
    assert.match(source, /LIVE MATCH/);
    assert.match(source, /Matchni bekor qilasizmi/);
    assert.match(source, /}, 5000\);/);
});

test("Sprint 2 keeps deferred flows out of V3 requests", () => {
    const source = fs.readFileSync(path.join(__dirname, "../miniapp/pages/arena-v3.js"), "utf8");
    assert.doesNotMatch(source, /request\([^)]*\/(?:upload-screenshot|ai-result|result|history|ranking|profile)/);
});

test("Sprint 2 styles cover phone, desktop, transitions and action loading", () => {
    const css = fs.readFileSync(path.join(__dirname, "../miniapp/arena-v3.css"), "utf8");
    assert.match(css, /arena-v3x-ready-grid/);
    assert.match(css, /arena-v3x-playing/);
    assert.match(css, /arena-v3x-spinner/);
    assert.match(css, /@media\(max-width:380px\)/);
    assert.match(css, /@media\(min-width:680px\)/);
    assert.match(css, /prefers-reduced-motion:reduce/);
});
