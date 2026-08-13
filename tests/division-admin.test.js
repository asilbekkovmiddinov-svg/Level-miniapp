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
        fs.readFileSync("miniapp/pages/division-admin-api.js", "utf8"),
        context,
    );
    return vm.runInContext(
        "new DivisionAdminClient({ fetchImpl: fetch, "
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

test("Division admin request sends Telegram authentication", async () => {
    let request;
    const client = loadClient(async (url, options) => {
        request = { url, options };
        return response({ season: null, participant: null });
    });
    await client.overview();
    assert.equal(request.url, "https://api.example/division");
    assert.equal(
        request.options.headers["X-Telegram-Init-Data"],
        "signed-data",
    );
});

test("season creation sends authoritative dates", async () => {
    let body;
    const client = loadClient(async (_url, options) => {
        body = JSON.parse(options.body);
        return response({ id: 1, status: "REGISTRATION" }, 201);
    });
    await client.createSeason({
        name: "Global Division S1",
        registration_opens_at: "2026-08-11T12:00:00Z",
        registration_closes_at: "2026-08-13T12:00:00Z",
        starts_at: "2026-08-14T12:00:00Z",
        ends_at: "2026-08-28T12:00:00Z",
    });
    assert.equal(body.name, "Global Division S1");
    assert.equal(body.starts_at, "2026-08-14T12:00:00Z");
    assert.equal(body.ends_at, "2026-08-28T12:00:00Z");
});

test("application filters and decisions use admin endpoints", async () => {
    const calls = [];
    const client = loadClient(async (url, options) => {
        calls.push({ url, options });
        return response({ items: [] });
    });
    await client.applications(7, "PENDING");
    await client.decide(7, 19, "APPROVED");
    assert.match(calls[0].url, /\/admin\/division\/seasons\/7\/applications/);
    assert.match(calls[0].url, /status=PENDING/);
    assert.deepEqual(JSON.parse(calls[1].options.body), {
        decision: "APPROVED",
    });
});
