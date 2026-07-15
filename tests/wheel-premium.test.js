const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const {
    WHEEL_PRIZES,
    wheelStatusValue,
    wheelStatusFlag,
    wheelHasStatusField,
    wheelTimestamp,
    wheelCooldownState,
    formatWheelCountdown,
    wheelNextSpinHint,
    wheelExpiredRefreshKey,
    normalizeWheelDegrees,
    wheelFinalRotationForSector,
    wheelSectorIndexFromRotation,
    wheelTransformValue,
    wheelTargetRotation,
    normalizeWheelReward,
    wheelSectorIndexForReward,
    wheelSpinType,
    normalizeWheelLastWin,
    wheelRelativeTime,
    createWheelWizardState,
    validateWheelWizardStep,
    wheelWizardStepMarkup,
    wheelPageMarkup,
} = require("../miniapp/pages/wheel.js");

test("premium wheel exposes production sectors and backend-ready target rotation", () => {
    assert.equal(WHEEL_PRIZES.length, 10);
    assert.deepEqual(WHEEL_PRIZES.map((prize) => prize.label), [
        "Omad kelmadi", "50 EFC", "100 EFC", "500 UZS", "250 EFC",
        "500 EFC", "1000 UZS", "5000 UZS", "130 Coin", "2000 Coin",
    ]);
    const rotation = wheelTargetRotation(3, 0, 4);
    assert.ok(rotation >= 4 * 360);
    assert.equal((rotation % 360 + 360) % 360, 252);
});

test("all 10 rewards land at the pointer center", () => {
    const sectorAngle = 360 / WHEEL_PRIZES.length;
    const markup = wheelPageMarkup();
    const labelAngles = [...markup.matchAll(/--prize-angle:([\d.]+)deg/g)].map((match) => Number(match[1]));

    assert.equal(labelAngles.length, 10);
    WHEEL_PRIZES.forEach((prize, index) => {
        const expectedCenter = index * sectorAngle;
        const rotation = wheelTargetRotation(index, 0, 6);
        const landedCenter = (expectedCenter + rotation) % 360;
        assert.equal(labelAngles[index], expectedCenter, `${prize.label} label markazda emas`);
        assert.equal(landedCenter, 0, `${prize.label} pointer markaziga tushmadi`);
    });
});

test("all 10 final transforms normalize to the backend reward sector", () => {
    WHEEL_PRIZES.forEach((prize, index) => {
        const animated = wheelTargetRotation(index, 317.25, 8);
        const finalRotation = wheelFinalRotationForSector(index);
        const transform = wheelTransformValue(finalRotation);

        assert.ok(animated > 317.25, `${prize.label} animation oldinga yurmayapti`);
        assert.ok(finalRotation >= 0 && finalRotation < 360, `${prize.label} final rotation normalize qilinmagan`);
        assert.equal(wheelSectorIndexFromRotation(finalRotation), index, `${prize.label} pointer sektori modalga mos emas`);
        assert.equal(wheelSectorIndexFromRotation(finalRotation + 1e-10), index, `${prize.label} positive float drift bilan almashdi`);
        assert.equal(wheelSectorIndexFromRotation(finalRotation - 1e-10), index, `${prize.label} negative float drift bilan almashdi`);
        assert.equal(transform, `translateZ(0) rotate(${finalRotation}deg)`);
    });
    assert.equal(normalizeWheelDegrees(360), 0);
    assert.equal(normalizeWheelDegrees(-36), 324);
});

test("spin completion waits for transform transition and snaps before modal", () => {
    const source = fs.readFileSync(path.join(__dirname, "../miniapp/pages/wheel.js"), "utf8");
    assert.match(source, /addEventListener\("transitionend", handleTransitionEnd\)/);
    assert.match(source, /event\.propertyName === "transform"/);
    assert.match(source, /wheelRotation = wheelFinalRotationForSector\(resultIndex\)/);
    assert.match(source, /disc\.style\.transform = wheelTransformValue\(wheelRotation\)/);
    assert.ok(
        source.indexOf("wheelRotation = wheelFinalRotationForSector(resultIndex)") < source.indexOf("openWheelResult(backendResult)"),
        "modal final visual snapdan oldin ochilmoqda",
    );
});

test("daily and ad timers use backend deadlines with 24h/1h timestamp fallbacks", () => {
    const now = Date.parse("2030-01-02T12:00:00Z");
    const status = {
        free_spins: 0,
        ad_spins: 0,
        last_free_spin_at: "2030-01-02T00:00:00Z",
        last_ad_spin_at: "2030-01-02T11:30:00Z",
    };
    const state = wheelCooldownState(status, now);
    assert.equal(state.freeAt, Date.parse("2030-01-03T00:00:00Z"));
    assert.equal(state.adAt, Date.parse("2030-01-02T12:30:00Z"));
    assert.equal(state.canSpin, false);
    assert.equal(formatWheelCountdown(state.freeAt, now), "12:00:00");
    assert.equal(formatWheelCountdown(state.adAt, now), "00:30:00");
    assert.equal(wheelTimestamp({ next_free_spin_at: "2030-01-02T13:00:00Z" }, ["next_free_spin_at"], [], 86400000), Date.parse("2030-01-02T13:00:00Z"));
});

test("countdown unlocks automatically at backend availability time", () => {
    const deadline = Date.parse("2030-01-02T12:00:01Z");
    const status = { free_spins: 0, ad_spins: 0, next_free_spin_at: new Date(deadline).toISOString() };
    assert.equal(wheelCooldownState(status, deadline - 1).freeReady, false);
    assert.equal(wheelCooldownState(status, deadline).freeReady, true);
    assert.equal(formatWheelCountdown(deadline, deadline), "00:00:00");
    assert.equal(wheelExpiredRefreshKey(wheelCooldownState(status, deadline), deadline), `free:${deadline}`);
});

test("backend readiness fields restore free spin and remove cooldown", () => {
    const readyByFlag = wheelCooldownState({ free_spin_available: true, remaining_free_spins: 0 });
    const readyByCount = wheelCooldownState({ free_spin_available: false, remaining_free_spins: 1 });
    const unavailable = wheelCooldownState({ remaining_free_spins: 0 });
    assert.equal(wheelStatusFlag({ free_spin_available: "true" }, ["free_spin_available"]), true);
    assert.equal(readyByFlag.freeReady, true);
    assert.equal(readyByFlag.freeCooldown, false);
    assert.equal(readyByCount.freeReady, true);
    assert.equal(readyByCount.freeSpins, 1);
    assert.equal(unavailable.freeReady, false);
    assert.equal(unavailable.freeCooldown, false);
});

test("production legacy contract maps to READY free/ad availability", () => {
    const legacy = wheelCooldownState({
        success: true,
        free_spin_used: false,
        ad_spin_count: 0,
        bonus_spin_count: 0,
        max_ad_spins: 10,
        next_ad_spin_at: null,
    });
    assert.equal(wheelHasStatusField({ free_spin_used: false }, ["free_spin_used"]), true);
    assert.equal(legacy.freeSpins, 1);
    assert.equal(legacy.freeReady, true);
    assert.equal(legacy.adSpins, 10);
    assert.equal(legacy.adReady, true);
    assert.equal(legacy.canSpin, true);
});

test("legacy used/cooldown state remains unavailable until backend deadline", () => {
    const now = Date.parse("2030-01-02T12:00:00Z");
    const legacy = wheelCooldownState({
        free_spin_used: true,
        ad_spin_count: 1,
        max_ad_spins: 10,
        next_ad_spin_at: "2030-01-02T12:30:00Z",
    }, now);
    assert.equal(legacy.freeSpins, 0);
    assert.equal(legacy.freeReady, false);
    assert.equal(legacy.adSpins, 9);
    assert.equal(legacy.adReady, false);
    assert.equal(legacy.adCooldown, true);
    assert.equal(legacy.canSpin, false);
});

test("new contract remains authoritative when legacy fields are also present", () => {
    const mixed = wheelCooldownState({
        free_spin_available: false,
        remaining_free_spins: 0,
        ad_spin_available: false,
        remaining_ad_spins: 0,
        free_spin_used: false,
        ad_spin_count: 0,
        max_ad_spins: 10,
    });
    assert.equal(mixed.freeReady, false);
    assert.equal(mixed.adReady, false);
    assert.equal(mixed.canSpin, false);
});

test("countdown cards and disabled button always show unambiguous timer copy", () => {
    const now = Date.parse("2030-01-02T12:00:00Z");
    const state = wheelCooldownState({
        free_spins: 0,
        ad_spins: 0,
        next_free_spin_at: "2030-01-03T11:59:58Z",
        next_ad_spin_at: "2030-01-02T12:48:21Z",
    }, now);
    assert.equal(formatWheelCountdown(state.freeAt, now), "23:59:58");
    assert.equal(formatWheelCountdown(state.adAt, now), "00:48:21");
    assert.equal(wheelNextSpinHint(state, now), "Keyingi reklama spini: 00:48:21");
    assert.equal(wheelNextSpinHint({ ...state, canSpin: true }, now), "Spin tayyor");
});

test("Coin wizard is restricted to four validated steps", () => {
    const state = createWheelWizardState(normalizeWheelReward({ type: "COIN", amount: 130 }));
    assert.equal(state.step, 1);
    assert.match(validateWheelWizardStep(state, ""), /email/i);
    assert.match(validateWheelWizardStep(state, "invalid"), /format/i);
    assert.equal(validateWheelWizardStep(state, "player@example.com"), "");
    state.email = "player@example.com";
    state.step = 2;
    assert.match(validateWheelWizardStep(state, ""), /parol/i);
    assert.equal(validateWheelWizardStep(state, "secret"), "");
    state.step = 4;
    state.password = "secret";
    assert.match(wheelWizardStepMarkup(state), /Reward/);
    assert.match(wheelWizardStepMarkup(state), /Tasdiqlash|Platformani tanlang/);
});

test("Coin wizard markup never persists credentials", () => {
    const source = fs.readFileSync(path.join(__dirname, "../miniapp/pages/wheel.js"), "utf8");
    assert.doesNotMatch(source, /localStorage|sessionStorage/);
    assert.match(source, /state\.password = ""/);
    assert.match(source, /type="password"/);
    assert.match(source, /1\/4/);
});

test("production backend reward selects its exact sector", () => {
    assert.equal(wheelSectorIndexForReward({ reward_type: "NONE", reward_amount: 0, reward_code: "lose" }), 0);
    assert.equal(wheelSectorIndexForReward({ reward_type: "EFC", reward_amount: 100 }), 2);
    assert.equal(wheelSectorIndexForReward({ reward_type: "COIN_ORDER", reward_amount: 130 }), 8);
    assert.equal(normalizeWheelReward({ reward_type: "COIN_ORDER", reward_amount: 2000 }).label, "2 000 Coin");
});

test("production spin type follows backend-ready state", () => {
    assert.equal(wheelSpinType({ freeReady: true, adReady: false }), "FREE");
    assert.equal(wheelSpinType({ freeReady: false, adReady: true }), "AD");
    assert.equal(wheelSpinType({ freeReady: false, adReady: false }, { bonus_spin_count: 1 }), "BONUS");
    assert.throws(() => wheelSpinType({ freeReady: false, adReady: false }, {}), /Spin mavjud emas/);
});

test("balance and Coin rewards expose the correct premium actions", () => {
    const efc = normalizeWheelReward({ reward_type: "EFC", reward_amount: 250 });
    const uzs = normalizeWheelReward({ currency: "UZS", amount: 5000 });
    const coin = normalizeWheelReward({ type: "COINS", value: 2000 });
    assert.equal(efc.credited, true);
    assert.equal(uzs.credited, true);
    assert.equal(coin.credited, false);
    assert.equal(coin.isCoin, true);
    assert.equal(coin.isLarge, true);
});

test("target rotation always advances and supports 4–8 turns", () => {
    for (let turns = 4; turns <= 8; turns += 1) {
        assert.ok(wheelTargetRotation(0, 700, turns) > 700);
    }
});

test("wheel status accepts current backend fields without contract changes", () => {
    const status = { free_spins: 1, ad_spins: 2, last_reward: "20 EFC" };
    assert.equal(wheelStatusValue(status, ["free_spins"]), 1);
    assert.equal(wheelStatusValue(status, ["last_prize", "last_reward"]), "20 EFC");
});

test("premium wheel markup contains loading, stats, spin and result UX", () => {
    const markup = wheelPageMarkup();
    assert.match(markup, /premiumWheelDisc/);
    assert.match(markup, /wheelStatusRegion/);
    assert.match(markup, /Aylantirish/);
    assert.doesNotMatch(markup, /Qolgan spinlar[\s\S]*?COOLDOWN[\s\S]*?Oxirgi yutuq/);
    assert.match(markup, /Tabriklaymiz!/);
    assert.match(markup, /Balansingizga avtomatik qo‘shildi/);
    assert.match(markup, /Coin buyurtmasini rasmiylashtirish/);
    assert.match(markup, /Davom etish/);
});

test("wheel animation is transform-only and supports reduced motion", () => {
    const css = fs.readFileSync(path.join(__dirname, "../miniapp/style.css"), "utf8");
    const source = fs.readFileSync(path.join(__dirname, "../miniapp/pages/wheel.js"), "utf8");
    assert.match(css, /cubic-bezier\(\.18,\.72,\.08,1\)/);
    assert.match(css, /prefers-reduced-motion:reduce/);
    assert.match(css, /wheel-confetti-fall/);
    assert.doesNotMatch(source, /Math\.random|WHEEL_DEMO_REWARDS/);
    assert.match(source, /spinProductionWheel\(spinType\)/);
    assert.match(source, /wheelSpinning/);
});

test("visual release includes metal, glass, pointer landing and reward effects", () => {
    const css = fs.readFileSync(path.join(__dirname, "../miniapp/style.css"), "utf8");
    const markup = wheelPageMarkup();
    assert.match(markup, /wheel-metal-ring/);
    assert.match(markup, /wheel-glass-reflection/);
    assert.match(markup, /wheel-reward-particles/);
    assert.match(css, /wheel-pointer-bounce/);
    assert.match(css, /wheel-gold-flash/);
    assert.match(css, /wheel-sparkle/);
});

test("last win supports reward icon, relative time and sound-ready cues", () => {
    const win = normalizeWheelLastWin({ type: "COIN", amount: 2000, won_at: "2030-01-01T10:00:00Z" });
    assert.equal(win.icon, "👑");
    assert.equal(win.label, "2 000 Coin");
    assert.equal(wheelRelativeTime("2030-01-01T10:00:00Z", Date.parse("2030-01-01T12:00:00Z")), "2 soat oldin");
    const source = fs.readFileSync(path.join(__dirname, "../miniapp/pages/wheel.js"), "utf8");
    assert.match(source, /levelgroup:wheel-sound/);
    assert.doesNotMatch(source, /Demo spin/);
    assert.match(source, /refreshWheelAfterSpin\(\)/);
    assert.match(source, /setInterval\(updateWheelCountdowns, 1000\)/);
    assert.match(source, /refreshWheelState\(\)/);
});
