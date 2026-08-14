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

test("creates Olympic tournament with null group settings", async () => {
    let request;
    const client = loadClient(async (url, options) => {
        request = { url, options };
        return response({ id: 1 }, 201);
    });
    await client.create({
        name: "LEVEL Cup",
        format: "SINGLE_ELIMINATION",
        max_participants: 16,
        ticket_cost: 10,
        group_count: null,
        qualifiers_per_group: null,
        registration_opens_at: "2026-08-13T10:00:00Z",
        registration_closes_at: "2026-08-14T10:00:00Z",
        starts_at: "2026-08-15T10:00:00Z",
        ends_at: "2026-08-22T10:00:00Z",
    });
    assert.equal(request.url, "https://api.example/admin/tournaments");
    const body = JSON.parse(request.options.body);
    assert.equal(body.format, "SINGLE_ELIMINATION");
    assert.equal(body.ticket_cost, 10);
    assert.equal(body.group_count, null);
});

test("sends group assignment in approval decision", async () => {
    let request;
    const client = loadClient(async (url, options) => {
        request = { url, options };
        return response({ id: 8, status: "APPROVED" });
    });
    await client.decide(4, 8, {
        decision: "APPROVED",
        group_name: "A",
    });
    assert.match(request.url, /\/admin\/tournaments\/4\/applications\/8\/decision/);
    assert.deepEqual(JSON.parse(request.options.body), {
        decision: "APPROVED",
        group_name: "A",
    });
});

test("opens scheduled match through admin endpoint", async () => {
    let request;
    const client = loadClient(async (url, options) => {
        request = { url, options };
        return response({ id: "match-1", status: "READY" });
    });
    await client.openMatch(5, "match-1");
    assert.equal(
        request.url,
        "https://api.example/admin/tournaments/5/matches/match-1/open",
    );
    assert.equal(request.options.method, "POST");
});
