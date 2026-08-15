const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function loadClient(fetchImpl) {
    const context = {
        API_URL: "https://api.example",
        fetch: fetchImpl,
        window: { Telegram: { WebApp: { initData: "signed-data" } } },
        globalThis: null,
        URLSearchParams,
    };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(
        fs.readFileSync("miniapp/pages/tournament-admin-api.js", "utf8"),
        context,
    );
    return vm.runInContext(
        "new TournamentAdminClient({ fetchImpl: fetch, "
            + "initDataProvider: () => 'signed-data' })",
        context,
    );
}

function response(payload, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => payload,
    };
}

test("creates configurable simple group tournament", async () => {
    let request;
    const client = loadClient(async (url, options) => {
        request = { url, options };
        return response({ id: 1 }, 201);
    });
    await client.create({
        name: "LEVEL Cup",
        format: "GROUP_PLAYOFF",
        max_participants: 64,
        ticket_cost: 7,
        group_count: null,
        group_size: 8,
        group_mode: "ELIMINATION",
        qualifiers_per_group: 2,
        registration_opens_at: "2026-08-13T10:00:00Z",
        registration_closes_at: "2026-08-14T10:00:00Z",
        starts_at: "2026-08-15T10:00:00Z",
        ends_at: "2026-08-22T10:00:00Z",
    });
    const body = JSON.parse(request.options.body);
    assert.equal(body.ticket_cost, 7);
    assert.equal(body.group_size, 8);
    assert.equal(body.group_mode, "ELIMINATION");
    assert.equal(body.qualifiers_per_group, 2);
});

test("loads approved participants with bounded search pagination", async () => {
    let request;
    const client = loadClient(async (url, options) => {
        request = { url, options };
        return response([]);
    });
    await client.applications(4, "APPROVED", {
        limit: 100, offset: 100, search: "alpha",
    });
    assert.match(request.url, /status=APPROVED/);
    assert.match(request.url, /limit=100/);
    assert.match(request.url, /offset=100/);
    assert.match(request.url, /search=alpha/);
});

test("admin writes or edits match result directly", async () => {
    let request;
    const client = loadClient(async (url, options) => {
        request = { url, options };
        return response({ id: "match-1", status: "FINISHED" });
    });
    await client.result(5, "match-1", {
        player_a_score: 3,
        player_b_score: 1,
    });
    assert.equal(
        request.url,
        "https://api.example/admin/tournaments/5/matches/match-1/result",
    );
    assert.equal(request.options.method, "PUT");
    assert.deepEqual(JSON.parse(request.options.body), {
        player_a_score: 3,
        player_b_score: 1,
    });
});

test("admin finalizes group qualifiers", async () => {
    let request;
    const client = loadClient(async (url, options) => {
        request = { url, options };
        return response({ qualified_players: 16 });
    });
    const result = await client.finalizeGroups(5);
    assert.equal(
        request.url,
        "https://api.example/admin/tournaments/5/groups/finalize",
    );
    assert.equal(request.options.method, "POST");
    assert.equal(result.qualified_players, 16);
});
