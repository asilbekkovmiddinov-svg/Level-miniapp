const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
    runAdsgramRewardedFlow,
    wheelRewardedSlotState,
    wheelRewardedSlotsMarkup,
    WHEEL_ADSGRAM_BLOCK_ID,
    WHEEL_REWARDED_ADS,
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


test("three rewarded slots are independently selectable through the provider registry", async () => {
    assert.deepEqual(
        WHEEL_REWARDED_ADS.slots.map(({ id, label, provider }) => ({ id, label, provider })),
        [
            { id: "1", label: "Watch Ad #1", provider: "ADSGRAM" },
            { id: "2", label: "Watch Ad #2", provider: "ADSGRAM" },
            { id: "3", label: "Watch Ad #3", provider: "ADSGRAM" },
        ],
    );

    const selected = [];
    for (const slot of WHEEL_REWARDED_ADS.slots) {
        await WHEEL_REWARDED_ADS.run(slot.id, {
            ADSGRAM: async () => selected.push(slot.id),
        });
    }
    assert.deepEqual(selected, ["1", "2", "3"]);
});

test("all rewarded slots share one server-based cooldown state", () => {
    const now = Date.parse("2026-07-27T12:00:00Z");
    const cooldown = {
        adRewardReady: false,
        adReady: false,
        adCooldown: true,
        adAt: now + 3_588_000,
    };

    for (const slot of WHEEL_REWARDED_ADS.slots) {
        const view = wheelRewardedSlotState(cooldown, slot.id, now);
        assert.equal(view.disabled, true);
        assert.equal(view.status, "⏳ Keyingi imkoniyat: 00:59:48");
    }

    const markup = wheelRewardedSlotsMarkup(cooldown, now);
    assert.equal((markup.match(/data-wheel-ad-slot=/g) || []).length, 3);
    assert.match(markup, /Watch Ad #1/);
    assert.match(markup, /Watch Ad #2/);
    assert.match(markup, /Watch Ad #3/);
    assert.equal((markup.match(/00:59:48/g) || []).length, 3);
});

test("one claimed rewarded spin blocks all three slots", () => {
    const state = {
        adRewardReady: false,
        adReady: true,
        adCooldown: true,
        adAt: Date.parse("2026-07-27T13:00:00Z"),
    };
    for (const slot of WHEEL_REWARDED_ADS.slots) {
        const view = wheelRewardedSlotState(state, slot.id, Date.parse("2026-07-27T12:00:00Z"));
        assert.equal(view.disabled, true);
    }
});

test("provider module loads before the Wheel page controller", () => {
    const html = fs.readFileSync(path.join(__dirname, "../miniapp/index.html"), "utf8");
    const providerAt = html.indexOf("pages/wheel-ad-providers.js");
    const wheelAt = html.indexOf("pages/wheel.js");
    assert.ok(providerAt >= 0);
    assert.ok(wheelAt > providerAt);
});
