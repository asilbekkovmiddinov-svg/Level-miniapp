const assert = require("node:assert/strict");
const test = require("node:test");

const rotation = require("../miniapp/pages/penalty-duel-ad-rotation.js");


test("production provider order uses Adsgram TADS and Telega only", () => {
    assert.deepEqual(rotation.orderedProviders("TELEGA"), [
        "TELEGA", "ADSGRAM", "TADS",
    ]);
    assert.deepEqual(rotation.orderedProviders("unknown"), [
        "ADSGRAM", "TADS", "TELEGA",
    ]);
});


test("OnClickA joins rotation only when backend enables it", () => {
    const enabled = ["ADSGRAM", "TADS", "TELEGA", "ONCLICKA"];
    assert.deepEqual(rotation.orderedProviders("TELEGA", enabled), [
        "TELEGA", "ONCLICKA", "ADSGRAM", "TADS",
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


test("cancel falls back but pending backend reward stops rotation", async () => {
    const calls = [];
    const result = await rotation.run({
        startProvider: "TADS",
        adapters: {
            TADS: async () => {
                calls.push("TADS");
                throw Object.assign(new Error("cancelled"), { code: "TADS_CANCELLED" });
            },
            TELEGA: async () => {
                calls.push("TELEGA");
                return { wallet: { game_tickets: 1 } };
            },
        },
    });
    assert.deepEqual(calls, ["TADS", "TELEGA"]);
    assert.equal(result.provider, "TELEGA");

    const pending = Object.assign(
        new Error("pending"),
        { code: "TELEGA_REWARD_PENDING", fallback: false },
    );
    let nextCalls = 0;
    await assert.rejects(rotation.run({
        startProvider: "TELEGA",
        adapters: {
            TELEGA: async () => { throw pending; },
            ADSGRAM: async () => { nextCalls += 1; },
        },
    }), (caught) => caught === pending);
    assert.equal(nextCalls, 0);
});


test("all provider failures produce one exhausted result without a reward", async () => {
    await assert.rejects(rotation.run({
        startProvider: "ADSGRAM",
        adapters: Object.fromEntries(rotation.PROVIDERS.map((provider) => [
            provider,
            async () => { throw Object.assign(new Error(provider), { code: `${provider}_NO_FILL` }); },
        ])),
    }), (error) => error.code === "AD_ROTATION_EXHAUSTED");
});


test("disabled OnClickA adapter never affects production fallback", async () => {
    const calls = [];
    const result = await rotation.run({
        startProvider: "TELEGA",
        providers: ["ADSGRAM", "TADS", "TELEGA"],
        adapters: {
            TELEGA: async () => {
                calls.push("TELEGA");
                throw Object.assign(new Error("no fill"), { code: "TELEGA_NO_FILL" });
            },
            ADSGRAM: async () => {
                calls.push("ADSGRAM");
                return { wallet: { game_tickets: 1 } };
            },
            ONCLICKA: async () => {
                calls.push("ONCLICKA");
                throw new Error("must not run");
            },
        },
    });
    assert.deepEqual(calls, ["TELEGA", "ADSGRAM"]);
    assert.equal(result.provider, "ADSGRAM");
});
