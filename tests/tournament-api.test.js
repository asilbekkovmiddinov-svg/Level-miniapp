const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function loadClient(fetchImpl) {
    const context = {
        API_URL: "https://api.example",
        fetch: fetchImpl,
        globalThis: null,
        window: { Telegram: { WebApp: { initData: "signed-data" } } },
        URLSearchParams,
    };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(fs.readFileSync("miniapp/pages/tournament-core.js", "utf8"), context);
    vm.runInContext(fs.readFileSync("miniapp/pages/tournament-api.js", "utf8"), context);
    return vm.runInContext(
        "new TournamentApiClient({ fetchImpl: fetch, initDataProvider: () => 'signed-data' })",
        context,
    );
}

function response(payload, status = 200) {
    return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

test("loads and normalizes current tournament overview", async () => {
    let request;
    const client = loadClient(async (url, options) => {
        request = { url, options };
        return response({ tournament: { id: 9, name: "Cup", max_participants: 8 }, participants: [], matches: [] });
    });
    const overview = await client.overview();
    assert.equal(request.url, "https://api.example/tournaments/current");
    assert.equal(request.options.headers["X-Telegram-Init-Data"], "signed-data");
    assert.equal(overview.tournament.id, 9);
});

test("submits application to selected tournament", async () => {
    let request;
    const client = loadClient(async (url, options) => {
        request = { url, options };
        return response({ id: 1, telegram_id: 101, status: "APPROVED", entry_ticket_state: "SPENT" }, 201);
    });
    const participant = await client.apply(12);
    assert.equal(request.url, "https://api.example/tournaments/12/apply");
    assert.equal(request.options.method, "POST");
    assert.equal(participant.status, "APPROVED");
    assert.equal(participant.entryTicketState, "SPENT");
});

test("loads scheduled group matches with bounded pagination", async () => {
    let request;
    const client = loadClient(async (url, options) => {
        request = { url, options };
        return response([{ id: "m1", player_a_id: 1, player_b_id: 2 }]);
    });
    const matches = await client.matches(12, { round: 4, limit: 100 });
    assert.match(request.url, /\/tournaments\/12\/matches\?/);
    assert.match(request.url, /round_number=4/);
    assert.match(request.url, /limit=100/);
    assert.equal(matches[0].id, "m1");
});
