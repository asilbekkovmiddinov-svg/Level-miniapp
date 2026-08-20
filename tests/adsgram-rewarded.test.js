const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
    runAdsgramRewardedFlow,
    pollMonetagRewardStatus,
    runMonetagPostbackFlow,
    wheelRewardedSlotState,
    wheelRewardedSlotsMarkup,
    registerWheelAdsgramNoFillDiagnostics,
    showWheelAdsgramAd,
    WHEEL_ADSGRAM_BLOCK_ID,
    WHEEL_ADSGRAM_START_TIMEOUT_MS,
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
    assert.equal(WHEEL_ADSGRAM_START_TIMEOUT_MS, 15000);
    assert.match(html, /https:\/\/sad\.adsgram\.ai\/js\/sad\.min\.js/);
    assert.match(api, /"\/wheel\/adsgram\/session"/);
    assert.match(api, /"\/wheel\/adsgram\/claim"/);
    assert.match(api, /type === "AD" \? "\/wheel\/spin\/ad"/);
});


test("production rewarded UI exposes only the Adsgram card without a provider name", async () => {
    assert.deepEqual(
        WHEEL_REWARDED_ADS.slots.map(({ id, label, subtitle, provider }) => ({ id, label, subtitle, provider })),
        [
            { id: "1", label: "Watch Ad", subtitle: "Get 1 Spin", provider: "ADSGRAM" },
        ],
    );

    const markup = wheelRewardedSlotsMarkup({ adRewardReady: true });
    assert.equal((markup.match(/data-wheel-ad-slot=/g) || []).length, 1);
    assert.equal((markup.match(/Watch Ad/g) || []).length, 1);
    assert.equal((markup.match(/Get 1 Spin/g) || []).length, 1);
    assert.doesNotMatch(markup, /Adsgram|Monetag/i);
});

test("the rewarded card keeps the server-based cooldown state", () => {
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
    assert.equal((markup.match(/data-wheel-ad-slot=/g) || []).length, 1);
    assert.equal((markup.match(/Watch Ad/g) || []).length, 1);
    assert.equal((markup.match(/00:59:48/g) || []).length, 1);
});

test("one claimed rewarded spin blocks the Adsgram card", () => {
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


test("Monetag SDK uses the production zone and secure URL", () => {
    const html = fs.readFileSync(path.join(__dirname, "../miniapp/index.html"), "utf8");
    assert.match(html, /src="https:\/\/libtl\.com\/sdk\.js"/);
    assert.match(html, /data-zone="11422269"/);
    assert.match(html, /data-sdk="show_11422269"/);
});

test("Adsgram card runs only Adsgram", async () => {
    const previous = globalThis.show_11422269;
    let adsgramCalls = 0;
    let monetagCalls = 0;
    globalThis.show_11422269 = async () => {
        monetagCalls += 1;
    };

    try {
        const result = await WHEEL_REWARDED_ADS.run("1", {
            ADSGRAM_AVAILABLE: true,
            ADSGRAM: async () => {
                adsgramCalls += 1;
                return { done: true, error: false, provider: "ADSGRAM" };
            },
        });
        assert.equal(result.provider, "ADSGRAM");
        assert.equal(adsgramCalls, 1);
        assert.equal(monetagCalls, 0);
    } finally {
        if (previous === undefined) delete globalThis.show_11422269;
        else globalThis.show_11422269 = previous;
    }
});

test("dormant Monetag provider retains the official object API", async () => {
    const previous = globalThis.show_11422269;
    const selected = [];
    globalThis.show_11422269 = async (format) => {
        assert.deepEqual(format, {
            type: "pop",
            ymid: "11111111-2222-4333-8444-555555555555",
            requestVar: "wheel_reward",
        });
        selected.push("MONETAG");
    };

    try {
        await WHEEL_REWARDED_ADS.MonetagProvider.showRewarded({
            ymid: "11111111-2222-4333-8444-555555555555",
        });
        assert.deepEqual(selected, ["MONETAG"]);
        assert.equal(WHEEL_REWARDED_ADS.MonetagProvider.getName(), "MONETAG");
        assert.equal(WHEEL_REWARDED_ADS.MonetagProvider.isAvailable(), true);
    } finally {
        if (previous === undefined) delete globalThis.show_11422269;
        else globalThis.show_11422269 = previous;
    }
});

test("Monetag waits for the backend postback and never performs a frontend claim", async () => {
    const calls = [];
    const result = await runMonetagPostbackFlow({
        createYmid: () => "11111111-2222-4333-8444-555555555555",
        createSession: async (ymid) => {
            calls.push(["session", ymid]);
            return { ymid, status: "PENDING" };
        },
        showAd: async (ymid) => calls.push(["show", ymid]),
        pollStatus: async (ymid) => {
            calls.push(["poll", ymid]);
            return { ymid, status: "CLAIMED" };
        },
    });
    assert.equal(result.status, "CLAIMED");
    assert.deepEqual(calls.map(([name]) => name), ["session", "show", "poll"]);
});

test("Monetag polling accepts only backend CLAIMED and rejects terminal failures", async () => {
    let reads = 0;
    const claimed = await pollMonetagRewardStatus("ymid", {
        getStatus: async () => ({ status: ++reads === 2 ? "CLAIMED" : "PENDING" }),
        wait: async () => {},
    });
    assert.equal(claimed.status, "CLAIMED");
    await assert.rejects(
        pollMonetagRewardStatus("ymid", {
            getStatus: async () => ({ status: "REJECTED" }),
            wait: async () => {},
        }),
        /tasdiqlanmadi/,
    );
});


test("Adsgram rejection does not automatically call Monetag", async () => {
    const previous = globalThis.show_11422269;
    let monetagCalls = 0;
    globalThis.show_11422269 = async () => {
        monetagCalls += 1;
    };

    try {
        await assert.rejects(
            WHEEL_REWARDED_ADS.run("1", {
                ADSGRAM_AVAILABLE: true,
                ADSGRAM: async () => {
                    throw new Error("adsgram-no-fill");
                },
            }),
            /adsgram-no-fill/,
        );
        assert.equal(monetagCalls, 0);
    } finally {
        if (previous === undefined) delete globalThis.show_11422269;
        else globalThis.show_11422269 = previous;
    }
});

test("dormant Monetag Promise rejection remains diagnostic", async () => {
    const previous = globalThis.show_11422269;
    globalThis.show_11422269 = async () => {
        throw new Error("monetag-reject");
    };

    try {
        const result = await WHEEL_REWARDED_ADS.MonetagProvider.showRewarded({
            ymid: "11111111-2222-4333-8444-555555555555",
        });
        await Promise.resolve();
        assert.equal(result.shown, true);
    } finally {
        if (previous === undefined) delete globalThis.show_11422269;
        else globalThis.show_11422269 = previous;
    }
});

test("Adsgram reward becomes a ready spin without automatic wheel rotation", () => {
    const source = fs.readFileSync(path.join(__dirname, "../miniapp/pages/wheel.js"), "utf8");
    const adsgramSuccess = source.match(
        /await runAdsgramRewardedFlow\([\s\S]*?if \(hint\) hint\.textContent = "1 ta Ad Spin qo‘shildi";([\s\S]*?)\} catch/,
    );
    assert.ok(adsgramSuccess);
    assert.match(adsgramSuccess[1], /await refreshWheelState\(\);/);
    assert.doesNotMatch(adsgramSuccess[1], /spinFreeWheel/);
});

test("manual Wheel button click does not pass the browser event as a spin type", () => {
    const source = fs.readFileSync(path.join(__dirname, "../miniapp/pages/wheel.js"), "utf8");
    assert.match(source, /addEventListener\("click", \(\) => spinFreeWheel\(\)\)/);
    assert.match(source, /typeof arguments\[0\] === "string" \? arguments\[0\] : null/);
});

test("Adsgram diagnostics register the official rewarded lifecycle events", async () => {
    const listeners = {};
    const controller = {
        addEventListener(name, callback) {
            listeners[name] = callback;
        },
        show: async () => {
            throw new Error("adsgram-no-fill");
        },
    };
    const originalInfo = console.info;
    const logs = [];
    console.info = (...args) => logs.push(args);

    try {
        assert.equal(registerWheelAdsgramNoFillDiagnostics(controller), controller);
        assert.deepEqual(Object.keys(listeners), [
            "onStart",
            "onReward",
            "onComplete",
            "onSkip",
            "onError",
            "onBannerNotFound",
            "onNonStopShow",
            "onTooLongSession",
        ]);
        listeners.onBannerNotFound({ description: "No banner found" });
        assert.equal(logs.length, 1);
        assert.match(logs[0][0], /adsgram_event/);
        assert.equal(logs[0][1].event, "onBannerNotFound");
        await assert.rejects(controller.show(), /adsgram-no-fill/);
    } finally {
        console.info = originalInfo;
    }
});

test("Adsgram no-fill event rejects a hanging show and clears loading", async () => {
    const listeners = {};
    const controller = {
        addEventListener(name, callback) { listeners[name] = callback; },
        removeEventListener(name, callback) {
            if (listeners[name] === callback) delete listeners[name];
        },
        show: () => new Promise(() => {}),
    };
    const pending = showWheelAdsgramAd(controller);
    await Promise.resolve();
    listeners.onBannerNotFound({ description: "No banner found" });
    await assert.rejects(
        pending,
        (error) => error.code === "ADSGRAM_NO_FILL"
            && /reklama mavjud emas/.test(error.message),
    );
    assert.equal(listeners.onBannerNotFound, undefined);
});

for (const [eventName, expectedCode] of [
    ["onError", "ADSGRAM_SHOW_FAILED"],
    ["onSkip", "ADSGRAM_SKIPPED"],
    ["onNonStopShow", "ADSGRAM_BUSY"],
    ["onTooLongSession", "ADSGRAM_SESSION_STALE"],
]) {
    test(`Adsgram ${eventName} releases a hanging show`, async () => {
        const listeners = {};
        const controller = {
            addEventListener(name, callback) { listeners[name] = callback; },
            removeEventListener(name, callback) {
                if (listeners[name] === callback) delete listeners[name];
            },
            show: () => new Promise(() => {}),
        };
        const pending = showWheelAdsgramAd(controller);
        await Promise.resolve();
        listeners[eventName]({ description: eventName });
        await assert.rejects(pending, (error) => error.code === expectedCode);
        assert.deepEqual(listeners, {});
    });
}

test("Adsgram startup watchdog releases a silent WebView", async () => {
    const controller = {
        addEventListener() {},
        removeEventListener() {},
        show: () => new Promise(() => {}),
    };
    await assert.rejects(
        showWheelAdsgramAd(controller, { startTimeoutMs: 5 }),
        (error) => error.code === "ADSGRAM_START_TIMEOUT"
            && /Reklama yuklanmadi/.test(error.message),
    );
});

test("Adsgram startup watchdog stops after the first ad frame", async () => {
    const listeners = {};
    const controller = {
        addEventListener(name, callback) { listeners[name] = callback; },
        removeEventListener(name, callback) {
            if (listeners[name] === callback) delete listeners[name];
        },
        show: () => new Promise((resolve) => {
            listeners.onStart();
            setTimeout(() => resolve({ done: true, error: false }), 25);
        }),
    };
    assert.deepEqual(
        await showWheelAdsgramAd(controller, { startTimeoutMs: 5 }),
        { done: true, error: false },
    );
});

test("Adsgram video is not interrupted by the removed 20 second wrapper timeout", async () => {
    const controller = {
        addEventListener() {},
        removeEventListener() {},
        show: () => new Promise((resolve) => {
            setTimeout(() => resolve({ done: true, error: false }), 25);
        }),
    };
    assert.deepEqual(
        await showWheelAdsgramAd(controller),
        { done: true, error: false },
    );
});

test("ten completed rewarded videos each reach exactly one backend claim", async () => {
    const claimedTokens = [];
    for (let attempt = 1; attempt <= 10; attempt += 1) {
        const token = `reward-token-${attempt}`;
        await runAdsgramRewardedFlow({
            createSession: async () => ({ token }),
            showAd: async () => showWheelAdsgramAd({
                addEventListener() {},
                removeEventListener() {},
                show: async () => ({ done: true, error: false }),
            }),
            claimReward: async (claimedToken) => {
                claimedTokens.push(claimedToken);
                return { remaining_ad_spins: 1 };
            },
        });
    }
    assert.deepEqual(
        claimedTokens,
        Array.from({ length: 10 }, (_, index) => `reward-token-${index + 1}`),
    );
});

test("provider diagnostics include independent provider attempts", () => {
    const source = fs.readFileSync(path.join(__dirname, "../miniapp/pages/wheel-ad-providers.js"), "utf8");
    assert.match(source, /monetag_show_called/);
    assert.match(source, /provider_failed/);
    assert.match(source, /provider_unavailable/);
});

test("global pending lock and existing exact-once claim flow remain wired", () => {
    const source = fs.readFileSync(path.join(__dirname, "../miniapp/pages/wheel.js"), "utf8");
    assert.match(source, /if \(wheelAdsgramPending \|\| !wheelCooldownSnapshot\?\.adRewardReady\) return/);
    assert.match(source, /wheelAdsgramPending = true/);
    assert.match(source, /wheelAdsgramPending = false/);
    assert.match(source, /claimReward\(session\.token\)/);
});
