const test = require("node:test");
const assert = require("node:assert/strict");

const {
    ArenaV5Client,
    arenaV5Escape,
    arenaV5MatchCard,
} = require("../miniapp/pages/arena-v5.js");


function response(payload, status = 200) {
    return { ok: status >= 200 && status < 300, status, json: async () => payload };
}


test("Arena V5 client uses authenticated matchmaking contracts", async () => {
    const calls = [];
    const client = new ArenaV5Client({
        baseUrl: "https://backend.example",
        initDataProvider: () => "verified-init-data",
        fetchImpl: async (url, options) => {
            calls.push({ url, options });
            return response({ state: "SEARCHING", ticket_balance: 2, matched_now: false });
        },
    });

    await client.joinQueue();
    await client.cancelQueue();

    assert.deepEqual(calls.map((call) => [new URL(call.url).pathname, call.options.method]), [
        ["/arena/v5/queue", "POST"],
        ["/arena/v5/queue", "DELETE"],
    ]);
    assert.equal(calls[0].options.headers["X-Telegram-Init-Data"], "verified-init-data");
    assert.match(calls[0].options.headers["Idempotency-Key"], /^arena-v5:queue:/);
});


test("matched card exposes bot deep-link without rendering untrusted HTML", () => {
    const html = arenaV5MatchCard({
        id: 152,
        status: "PLAYING",
        player_a: { efootball_username: "KING <PES>" },
        player_b: { efootball_username: "ASILBEK" },
        bot_deep_link: "https://t.me/LevelGroupBot?start=arena_safe-token",
    });
    assert.match(html, /№152 MATCH/);
    assert.match(html, /MATCHGA O‘TISH/);
    assert.match(html, /KING &lt;PES&gt;/);
    assert.doesNotMatch(html, /KING <PES>/);
    assert.equal(arenaV5Escape('a"<b>'), "a&quot;&lt;b&gt;");
});


test("Arena V5 source uses bounded search polling", () => {
    const fs = require("node:fs");
    const source = fs.readFileSync("miniapp/pages/arena-v5.js", "utf8");
    assert.match(source, /}, 5000\);/);
    assert.doesNotMatch(source, /setInterval\([^,]+,\s*1000/);
});
