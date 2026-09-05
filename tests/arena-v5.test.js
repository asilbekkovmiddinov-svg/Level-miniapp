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


test("Arena V5 promocode claim sends only the code with Telegram auth", async () => {
    const calls = [];
    const client = new ArenaV5Client({
        baseUrl: "https://backend.example",
        initDataProvider: () => "verified-init-data",
        fetchImpl: async (url, options) => {
            calls.push({ url, options });
            return response({ code: "ARENA10", ticket_amount: 10, ticket_balance: 12 });
        },
    });

    const reward = await client.claimPromocode("ARENA10");

    assert.equal(new URL(calls[0].url).pathname, "/arena/v5/promocode/claim");
    assert.equal(calls[0].options.method, "POST");
    assert.equal(calls[0].options.headers["X-Telegram-Init-Data"], "verified-init-data");
    assert.deepEqual(JSON.parse(calls[0].options.body), { code: "ARENA10" });
    assert.equal(reward.ticket_balance, 12);
});


test("Arena find view contains the promocode input without changing polling", () => {
    const fs = require("node:fs");
    const source = fs.readFileSync("miniapp/pages/arena-v5.js", "utf8");
    assert.match(source, /id="arenaV5Promocode"/);
    assert.match(source, /data-arena-v5-promocode/);
    assert.match(source, /Har bir promokodni faqat bir marta ishlatish mumkin/);
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


test("Arena V5 exposes admin seasons, archived rankings and referral points", async () => {
    const calls = [];
    const client = new ArenaV5Client({
        baseUrl: "https://backend.example",
        initDataProvider: () => "verified-init-data",
        fetchImpl: async (url) => {
            calls.push(url);
            return response({ players: [] });
        },
    });

    await client.seasons();
    await client.ranking(12);

    assert.equal(new URL(calls[0]).pathname, "/arena/v5/seasons");
    assert.equal(new URL(calls[1]).searchParams.get("season_id"), "12");
    const source = require("node:fs").readFileSync("miniapp/pages/arena-v5.js", "utf8");
    assert.match(source, /Har bir yangi referal \+3/);
    assert.match(source, /Match \$\{player\.match_points\} \+ Referal \$\{player\.referral_points\}/);
    assert.match(source, /Yangi Arena mavsumi kutilmoqda/);
});


test("Arena V5 history separates every player season and total score", async () => {
    const calls = [];
    const client = new ArenaV5Client({
        baseUrl: "https://backend.example",
        initDataProvider: () => "verified-init-data",
        fetchImpl: async (url) => {
            calls.push(url);
            return response([]);
        },
    });

    await client.historySeasons();
    await client.history(0, 7);

    assert.equal(new URL(calls[0]).pathname, "/arena/v5/history/seasons");
    assert.equal(new URL(calls[1]).searchParams.get("season_id"), "7");
    const source = require("node:fs").readFileSync("miniapp/pages/arena-v5.js", "utf8");
    assert.match(source, /O‘ynalgan/);
    assert.match(source, /Yutilgan/);
    assert.match(source, /Gollar/);
    assert.match(source, /Referallar/);
    assert.match(source, /Umumiy natija/);
    assert.match(source, /data-arena-v5-history-season/);
});
