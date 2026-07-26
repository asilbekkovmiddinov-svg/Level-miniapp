const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
    runAdsgramRewardedFlow,
    WHEEL_ADSGRAM_BLOCK_ID,
} = require("../miniapp/pages/wheel.js");

test("Adsgram rewarded flow claims exactly once after completed video", async () => {
    let claims = 0;
    const result = await runAdsgramRewardedFlow({
        createSession: async () => ({ token: "one-time-token" }),
        showAd: async () => ({ done: true, error: false }),
        claimReward: async (token) => {
            claims += 1;
            assert.equal(token, "one-time-token");
            return { remaining_ad_spins: 1 };
        },
    });

    assert.equal(claims, 1);
    assert.equal(result.remaining_ad_spins, 1);
});

for (const event of ["cancel", "close"]) {
    test(`Adsgram ${event} does not claim a reward`, async () => {
        let claims = 0;
        await assert.rejects(
            runAdsgramRewardedFlow({
                createSession: async () => ({ token: "unused-token" }),
                showAd: async () => {
                    throw new Error(event);
                },
                claimReward: async () => {
                    claims += 1;
                },
            }),
            new RegExp(event),
        );
        assert.equal(claims, 0);
    });
}

test("Adsgram timeout destroys the ad and does not claim a reward", async () => {
    let claims = 0;
    let timeouts = 0;
    await assert.rejects(
        runAdsgramRewardedFlow({
            createSession: async () => ({ token: "expired-token" }),
            showAd: () => new Promise(() => {}),
            claimReward: async () => {
                claims += 1;
            },
            timeoutMs: 5,
            onTimeout: () => {
                timeouts += 1;
            },
        }),
        (error) => error.code === "ADSGRAM_TIMEOUT",
    );
    assert.equal(timeouts, 1);
    assert.equal(claims, 0);
});

test("Adsgram SDK and backend endpoints use the production rewarded contract", () => {
    const html = fs.readFileSync(path.join(__dirname, "../miniapp/index.html"), "utf8");
    const api = fs.readFileSync(path.join(__dirname, "../miniapp/api.js"), "utf8");

    assert.equal(WHEEL_ADSGRAM_BLOCK_ID, "39763");
    assert.match(html, /https:\/\/sad\.adsgram\.ai\/js\/sad\.min\.js/);
    assert.match(api, /"\/wheel\/adsgram\/session"/);
    assert.match(api, /"\/wheel\/adsgram\/claim"/);
    assert.match(api, /type === "AD" \? "\/wheel\/spin\/ad"/);
});
