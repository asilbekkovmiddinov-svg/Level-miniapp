const assert = require("node:assert/strict");
const test = require("node:test");

const waterfall = require("../miniapp/pages/wall-rush-ad-waterfall.js");

test("Wall Rush tries Adsgram first and does not open TADS after success", async () => {
    const calls = [];
    const result = await waterfall.run({
        showAdsgram: async () => {
            calls.push("ADSGRAM");
            return { wallet: { game_tickets: 1 } };
        },
        showTads: async () => calls.push("TADS"),
    });

    assert.deepEqual(calls, ["ADSGRAM"]);
    assert.equal(result.provider, "ADSGRAM");
});

for (const code of [
    "ADSGRAM_NO_FILL",
    "ADSGRAM_SDK_UNAVAILABLE",
    "ADSGRAM_SHOW_FAILED",
    "ADSGRAM_TIMEOUT",
]) {
    test(`Wall Rush falls back to TADS for ${code}`, async () => {
        const calls = [];
        const error = Object.assign(new Error(code), { code });
        const result = await waterfall.run({
            showAdsgram: async () => {
                calls.push("ADSGRAM");
                throw error;
            },
            showTads: async () => {
                calls.push("TADS");
                return { shown: true };
            },
        });

        assert.deepEqual(calls, ["ADSGRAM", "TADS"]);
        assert.equal(result.provider, "TADS");
    });
}

for (const code of ["ADSGRAM_NOT_REWARDED", "ADSGRAM_CLAIM_FAILED"]) {
    test(`Wall Rush does not bypass ${code} with a second ad`, async () => {
        let tadsCalls = 0;
        const error = Object.assign(new Error(code), { code });
        await assert.rejects(
            waterfall.run({
                showAdsgram: async () => { throw error; },
                showTads: async () => { tadsCalls += 1; },
            }),
            (caught) => caught === error,
        );
        assert.equal(tadsCalls, 0);
    });
}
