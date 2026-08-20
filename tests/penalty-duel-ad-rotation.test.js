const assert = require("node:assert/strict");
const test = require("node:test");

const rotation = require("../miniapp/pages/penalty-duel-ad-rotation.js");


test("provider order starts at the server-selected provider and wraps", () => {
    assert.deepEqual(rotation.orderedProviders("TELEGA"), [
        "TELEGA", "ONCLICKA", "ADSGRAM", "TADS",
    ]);
    assert.deepEqual(rotation.orderedProviders("unknown"), [
        "ADSGRAM", "TADS", "TELEGA", "ONCLICKA",
    ]);
});


test("no-fill and SDK errors automatically try the next provider", async () => {
    const calls = [];
    const result = await rotation.run({
        startProvider: "ADSGRAM",
        adapters: {
            ADSGRAM: async () => {
                calls.push("ADSGRAM");
                throw Object.assign(new Error("no fill"), { code: "ADSGRAM_NO_FILL" });
            },
            TADS: async () => {
                calls.push("TADS");
                throw Object.assign(new Error("SDK"), { code: "TADS_SDK_UNAVAILABLE" });
            },
            TELEGA: async () => {
                calls.push("TELEGA");
                return { wallet: { game_tickets: 1 } };
            },
            ONCLICKA: async () => calls.push("ONCLICKA"),
        },
    });

    assert.deepEqual(calls, ["ADSGRAM", "TADS", "TELEGA"]);
    assert.equal(result.provider, "TELEGA");
    assert.equal(result.reward.wallet.game_tickets, 1);
});


test("cancel and pending backend reward never open another provider", async () => {
    for (const error of [
        Object.assign(new Error("cancelled"), { code: "TADS_CANCELLED" }),
        Object.assign(new Error("pending"), { code: "TELEGA_REWARD_PENDING", fallback: false }),
    ]) {
        let nextCalls = 0;
        await assert.rejects(rotation.run({
            startProvider: "TADS",
            adapters: {
                TADS: async () => { throw error; },
                TELEGA: async () => { nextCalls += 1; },
            },
        }), (caught) => caught === error);
        assert.equal(nextCalls, 0);
    }
});


test("all provider failures produce one exhausted result without a reward", async () => {
    await assert.rejects(rotation.run({
        startProvider: "ONCLICKA",
        adapters: Object.fromEntries(rotation.PROVIDERS.map((provider) => [
            provider,
            async () => { throw Object.assign(new Error(provider), { code: `${provider}_NO_FILL` }); },
        ])),
    }), (error) => error.code === "AD_ROTATION_EXHAUSTED");
});
