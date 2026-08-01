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
    arenaV3ScreenshotSeconds,
    normalizeArenaV3Screenshot,
    normalizeArenaV3Result,
    normalizeArenaV3Profile,
    normalizeArenaV3RankingPlayer,
    arenaV3Track,
    arenaV3StoredUsername,
    arenaV3SaveUsername,
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

test("status timeline exposes only the simplified Arena V4 lifecycle", () => {
    assert.deepEqual(ARENA_V3_TIMELINE.map(([status]) => status), [
        "OPEN", "READY", "PLAYING", "WAITING_SCREENSHOT",
        "WAITING_ADMIN", "FINISHED",
    ]);
    assert.equal(arenaV3StatusIndex("WAITING_ADMIN"), 4);
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

test("Sprint 4 profile history and ranking cards are enabled", () => {
    const source = fs.readFileSync(path.join(__dirname, "../miniapp/pages/arena-v3.js"), "utf8");
    assert.match(source, /\["history".+true\]/);
    assert.match(source, /\["ranking".+true\]/);
    assert.match(source, /\["profile".+true\]/);
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

test("Sprint 2 backend mutation contracts remain unchanged", () => {
    const source = fs.readFileSync(path.join(__dirname, "../miniapp/pages/arena-v3.js"), "utf8");
    assert.match(source, /request\(`\/arena\/\$\{Number\(matchId\)\}\/room-code`/);
    assert.match(source, /request\(`\/arena\/\$\{Number\(matchId\)\}\/cancel`/);
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

test("screenshot upload accepts PNG and reports multipart progress", async () => {
    const listeners = {};
    const uploadListeners = {};
    const xhr = {
        status: 201,
        response: {
            id: 31, match_id: 17, player_id: 1, mime_type: "image/png",
            file_size: 100, width: 1280, height: 720,
            validation_status: "PENDING", uploaded_at: "2026-07-30T10:02:00Z",
        },
        upload: { addEventListener: (name, handler) => { uploadListeners[name] = handler; } },
        open(method, url) { this.method = method; this.url = url; },
        setRequestHeader(name, value) { (this.headers ||= {})[name] = value; },
        addEventListener(name, handler) { listeners[name] = handler; },
        send(body) {
            this.body = body;
            uploadListeners.progress({ lengthComputable: true, loaded: 50, total: 100 });
            listeners.load();
        },
    };
    const progress = [];
    const client = new ArenaV3Client({
        initDataProvider: () => "auth",
        xhrFactory: () => xhr,
    });
    const file = new Blob(["png"], { type: "image/png" });
    Object.defineProperty(file, "name", { value: "result.png" });
    const result = await client.uploadScreenshot(17, file, (value) => progress.push(value));
    assert.equal(xhr.method, "POST");
    assert.equal(xhr.url, "/arena/17/upload-screenshot");
    assert.equal(xhr.headers["X-Telegram-Init-Data"], "auth");
    assert.match(xhr.headers["Idempotency-Key"], /^arena-v3-screenshot-17-/);
    assert.ok(xhr.body instanceof FormData);
    assert.deepEqual(progress, [50, 100]);
    assert.equal(result.validationStatus, "PENDING");
});

test("screenshot upload rejects unsupported files before XHR", async () => {
    let created = false;
    const client = new ArenaV3Client({
        initDataProvider: () => "auth",
        xhrFactory: () => {
            created = true;
            return {};
        },
    });
    await assert.rejects(
        () => client.uploadScreenshot(17, { type: "image/webp", name: "x.webp" }),
        /PNG yoki JPEG/,
    );
    assert.equal(created, false);
});

test("screenshot upload exposes backend HTTP status and response detail", async () => {
    const listeners = {};
    const xhr = {
        status: 409,
        response: { detail: "Screenshot already uploaded" },
        upload: { addEventListener() {} },
        open() {},
        setRequestHeader() {},
        addEventListener(name, handler) { listeners[name] = handler; },
        send() { listeners.load(); },
    };
    const client = new ArenaV3Client({
        initDataProvider: () => "auth",
        xhrFactory: () => xhr,
    });
    const file = new Blob(["png"], { type: "image/png" });
    Object.defineProperty(file, "name", { value: "result.png" });

    await assert.rejects(
        client.uploadScreenshot(17, file),
        (error) => error.status === 409
            && error.message === "409 Conflict: Screenshot already uploaded",
    );
    assert.equal(xhr.timeout, 120000);
});

test("screenshot upload separates status zero, timeout and file limit errors", async () => {
    const makeClient = (event) => new ArenaV3Client({
        initDataProvider: () => "auth",
        xhrFactory: () => {
            const listeners = {};
            return {
                status: 0,
                response: null,
                upload: { addEventListener() {} },
                open() {},
                setRequestHeader() {},
                addEventListener(name, handler) { listeners[name] = handler; },
                send() { listeners[event](); },
            };
        },
    });
    const file = new Blob(["png"], { type: "image/png" });
    Object.defineProperty(file, "name", { value: "result.png" });

    await assert.rejects(
        makeClient("error").uploadScreenshot(17, file),
        (error) => error.status === 0 && /HTTP status 0/.test(error.message),
    );
    await assert.rejects(
        makeClient("timeout").uploadScreenshot(17, file),
        (error) => error.status === 408 && /Upload timeout/.test(error.message),
    );

    const oversized = new Blob([new Uint8Array((5 * 1024 * 1024) + 1)], {
        type: "image/jpeg",
    });
    Object.defineProperty(oversized, "name", { value: "large.jpg" });
    await assert.rejects(
        makeClient("load").uploadScreenshot(17, oversized),
        (error) => error.status === 413 && /5 MB/.test(error.message),
    );
});

test("Sprint 4 profile and paginated history use authenticated contracts", async () => {
    const calls = [];
    const client = new ArenaV3Client({
        initDataProvider: () => "auth",
        fetchImpl: async (url) => {
            calls.push(url);
            if (url === "/arena/profile") return response({
                player_id: 1, total_matches: 8, wins: 5, losses: 2, draws: 1,
                goals_for: 15, goals_against: 9, win_rate: "62.50",
                current_streak: 2, best_streak: 4, total_efc_won: "900",
                total_efc_lost: "200",
            });
            return response({ matches: [{ ...match, status: "FINISHED" }] });
        },
    });
    const profile = await client.profile();
    const history = await client.history({ limit: 20, offset: 40 });
    assert.equal(profile.winRate, 62.5);
    assert.equal(profile.totalEfcWon, 900);
    assert.equal(history[0].status, "FINISHED");
    assert.deepEqual(calls, ["/arena/profile", "/arena/history?limit=20&offset=40"]);
});

test("Sprint 4 ranking accepts backend periods and rejects unsupported daily", async () => {
    const calls = [];
    const client = new ArenaV3Client({
        initDataProvider: () => "auth",
        fetchImpl: async (url) => {
            calls.push(url);
            return response({ players: [{ player_id: 7, rank: 1, username: "Champion", wins: 12, win_rate: "75" }] });
        },
    });
    const rows = await client.ranking("weekly");
    assert.equal(rows[0].username, "Champion");
    assert.equal(rows[0].winRate, 75);
    await assert.rejects(() => client.ranking("daily"), /Daily ranking/);
    assert.deepEqual(calls, ["/arena/ranking?period=weekly"]);
});

test("profile and result settlement fields normalize authoritative backend data", () => {
    const profile = normalizeArenaV3Profile({
        player_id: 9, total_matches: 0, wins: 0, losses: 0, draws: 0,
        goals_for: 0, goals_against: 0, win_rate: "0", current_streak: 0,
        best_streak: 0, total_efc_won: "0", total_efc_lost: "0",
    });
    const normalized = normalizeArenaV3Match({
        ...match, status: "FINISHED", winner_id: 1, owner_score: 2,
        opponent_score: 1, settlement_status: "COMPLETED",
        finished_at: "2026-07-30T11:00:00Z",
    });
    assert.equal(profile.playerId, 9);
    assert.equal(normalized.winnerId, 1);
    assert.equal(normalized.ownerScore, 2);
    assert.equal(normalized.settlementStatus, "COMPLETED");
});

test("video appeal uses multipart auth idempotency and upload progress", async () => {
    const listeners = {};
    const uploadListeners = {};
    const xhr = {
        status: 200, response: { status: "SUBMITTED" },
        upload: { addEventListener: (name, handler) => { uploadListeners[name] = handler; } },
        open(method, url) { this.method = method; this.url = url; },
        setRequestHeader(name, value) { (this.headers ||= {})[name] = value; },
        addEventListener(name, handler) { listeners[name] = handler; },
        send(body) {
            this.body = body;
            uploadListeners.progress({ lengthComputable: true, loaded: 1, total: 2 });
            listeners.load();
        },
    };
    const client = new ArenaV3Client({ initDataProvider: () => "auth", xhrFactory: () => xhr });
    const file = new Blob(["video"], { type: "video/mp4" });
    Object.defineProperty(file, "name", { value: "appeal.mp4" });
    const progress = [];
    await client.uploadAppeal(17, file, "Hisob noto‘g‘ri", (value) => progress.push(value));
    assert.equal(xhr.url, "/arena/17/appeal?reason=Hisob+noto%25E2%2580%2598g%25E2%2580%2598ri".replaceAll("%25", "%"));
    assert.equal(xhr.headers["X-Telegram-Init-Data"], "auth");
    assert.match(xhr.headers["Idempotency-Key"], /^arena-v3-appeal-17-/);
    assert.ok(xhr.body instanceof FormData);
    assert.deepEqual(progress, [50, 100]);
});

test("result confirmation uses authenticated idempotent V4 endpoint", async () => {
    let call;
    const client = new ArenaV3Client({
        initDataProvider: () => "auth",
        fetchImpl: async (url, options) => {
            call = { url, options };
            return response({ match_id: 17, both_confirmed: false });
        },
    });
    await client.confirmResult(17);
    assert.equal(call.url, "/arena/17/confirm-result");
    assert.equal(call.options.method, "POST");
    assert.equal(call.options.headers["X-Telegram-Init-Data"], "auth");
    assert.match(call.options.headers["Idempotency-Key"], /^arena-v3-confirm-result-17-/);
});

test("Sprint 4 surfaces contain infinite history, podium, appeal states and analytics hooks", () => {
    const source = fs.readFileSync(path.join(__dirname, "../miniapp/pages/arena-v3.js"), "utf8");
    const css = fs.readFileSync(path.join(__dirname, "../miniapp/arena-v3.css"), "utf8");
    assert.match(source, /IntersectionObserver/);
    assert.match(source, /Admin tekshirmoqda/);
    assert.match(source, /rewardHoldStatus/);
    assert.match(source, /arena_profile_open/);
    assert.match(source, /arena_history_open/);
    assert.match(source, /arena_ranking_open/);
    assert.match(source, /arena_result_open/);
    assert.match(source, /arena_appeal_upload/);
    assert.match(source, /arena_appeal_submit/);
    assert.match(css, /arena-v3x-podium/);
    assert.match(css, /arena-v3x-history-card/);
    assert.match(css, /arena-v3x-stats/);
});

test("analytics delegates only when an existing provider is available", () => {
    const calls = [];
    globalThis.analytics = { track: (...args) => calls.push(args) };
    arenaV3Track("arena_profile_open", { source: "test" });
    delete globalThis.analytics;
    assert.deepEqual(calls, [["arena_profile_open", { source: "test" }]]);
});

test("screenshot list and public result use authenticated user routes", async () => {
    const calls = [];
    const client = new ArenaV3Client({
        initDataProvider: () => "auth",
        fetchImpl: async (url) => {
            calls.push(url);
            if (url.endsWith("/screenshots")) return response({ screenshots: [{
                id: 31, match_id: 17, player_id: 1, mime_type: "image/jpeg",
                file_size: 100, width: 1280, height: 720,
                validation_status: "VALID", uploaded_at: "2026-07-30T10:02:00Z",
            }] });
            return response({ match: {
                ...match, status: "FINISHED", winner_id: 1,
                owner_score: 2, opponent_score: 1,
            } });
        },
    });
    assert.equal((await client.screenshots(17))[0].mimeType, "image/jpeg");
    const result = await client.result(17);
    assert.equal(result.match.ownerScore, 2);
    assert.equal(result.match.winnerId, 1);
    assert.deepEqual(calls, ["/arena/17/screenshots", "/arena/17/result"]);
});

test("5 minute screenshot countdown starts after each supported match duration", () => {
    const started = "2026-07-30T10:00:00.000Z";
    for (const matchTime of [6, 8, 10, 12, 15]) {
        const windowStart = Date.parse(started) + (matchTime * 60000);
        const value = { playingStartedAt: started, matchTime };
        assert.equal(arenaV3ScreenshotSeconds(value, windowStart), 300);
        assert.equal(arenaV3ScreenshotSeconds(value, windowStart + 285000), 15);
        assert.equal(arenaV3ScreenshotSeconds(value, windowStart + 301000), 0);
    }
});

test("eFootball username storage is isolated by Telegram player", () => {
    const values = new Map();
    globalThis.localStorage = {
        getItem: (key) => values.get(key) || null,
        setItem: (key, value) => values.set(key, value),
    };
    globalThis.Telegram = { WebApp: { initDataUnsafe: { user: { id: 1001 } } } };

    arenaV3SaveUsername("CREATOR");
    assert.equal(arenaV3StoredUsername(), "CREATOR");

    globalThis.Telegram.WebApp.initDataUnsafe.user.id = 2002;
    assert.equal(arenaV3StoredUsername(), "");
    arenaV3SaveUsername("OPPONENT");
    assert.equal(arenaV3StoredUsername(), "OPPONENT");

    globalThis.Telegram.WebApp.initDataUnsafe.user.id = 1001;
    assert.equal(arenaV3StoredUsername(), "CREATOR");
    delete globalThis.Telegram;
    delete globalThis.localStorage;
});

test("legacy shared username never autofills another player", () => {
    globalThis.localStorage = {
        getItem: (key) => key === "arena-v3-efootball-username" ? "CREATOR" : null,
        setItem: () => {},
    };
    globalThis.Telegram = { WebApp: { initDataUnsafe: { user: { id: 2002 } } } };

    assert.equal(arenaV3StoredUsername(), "");
    delete globalThis.Telegram;
    delete globalThis.localStorage;
});

test("V4 review presentation hides technical processing states", () => {
    const source = fs.readFileSync(path.join(__dirname, "../miniapp/pages/arena-v3.js"), "utf8");
    for (const label of ["Confidence", "Validating", "Analyzing", "Comparing", "Finalizing"]) {
        assert.doesNotMatch(source, new RegExp(label));
    }
    assert.match(source, /Admin tomonidan tekshirildi/);
    assert.doesNotMatch(source, /\/settle|\/payout|walletRequest/);
});

test("result normalization preserves authoritative score and reward lock", () => {
    const result = normalizeArenaV3Result({
        match: { ...match, status: "FINISHED", winner_id: 1,
            owner_score: 3, opponent_score: 2,
            reward_hold_status: "LOCKED", winner_reward_efc: "900.00" },
    });
    assert.equal(result.match.winnerId, 1);
    assert.equal(result.match.ownerScore, 3);
    assert.equal(result.match.rewardHoldStatus, "LOCKED");
    assert.equal(normalizeArenaV3Screenshot({
        id: 1, player_id: 2, validation_status: "PENDING",
    }).playerId, 2);
});

test("Sprint 7 UI includes screenshot admin result appeal and lock states", () => {
    const source = fs.readFileSync(path.join(__dirname, "../miniapp/pages/arena-v3.js"), "utf8");
    const css = fs.readFileSync(path.join(__dirname, "../miniapp/arena-v3.css"), "utf8");
    assert.match(source, /accept="image\/png,image\/jpeg"/);
    assert.match(source, /Screenshot preview/);
    assert.match(source, /Upload Screenshot/);
    assert.match(source, /Admin tomonidan tekshirildi/);
    assert.match(source, /Norozilik bildirish/);
    assert.match(source, /confirm-result/);
    assert.match(source, /Natijani tasdiqlaganingizdan so'ng ushbu match bo'yicha norozilik \(appeal\) yubora olmaysiz\./);
    assert.match(source, /Ha, tasdiqlayman/);
    assert.match(source, /Bekor qilish/);
    assert.doesNotMatch(source, /globalThis\.confirm/);
    assert.ok(
        source.indexOf("await arenaV3ResultConfirmationDialog()")
        < source.indexOf("await arenaV3Client.confirmResult(match.id)"),
        "confirmation dialog must resolve before the backend call",
    );
    assert.match(css, /arena-v3x-upload-progress/);
    assert.match(css, /arena-v3x-reward-lock/);
    assert.match(css, /arena-v3x-result/);
    assert.match(css, /@media\(max-width:380px\)/);
    assert.match(css, /prefers-reduced-motion:reduce/);
});
