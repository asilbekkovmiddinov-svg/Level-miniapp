const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const {
    WHEEL_PRIZES,
    WHEEL_DEMO_REWARDS,
    wheelStatusValue,
    wheelTimestamp,
    wheelCooldownState,
    formatWheelCountdown,
    wheelTargetRotation,
    normalizeWheelReward,
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
    assert.equal((rotation % 360 + 360) % 360, 234);
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

test("reward flow supports every requested reward type", () => {
    assert.equal(WHEEL_DEMO_REWARDS.length, 10);
    assert.deepEqual(
        WHEEL_DEMO_REWARDS.map(normalizeWheelReward).map((reward) => reward.label),
        ["Omad kelmadi", "50 EFC", "100 EFC", "500 UZS", "250 EFC", "500 EFC", "1 000 UZS", "5 000 UZS", "130 Coin", "2 000 Coin"],
    );
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
    assert.match(source, /4 \+ Math\.floor\(Math\.random\(\) \* 5\)/);
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
    assert.match(source, /setInterval\(updateWheelCountdowns, 1000\)/);
});
