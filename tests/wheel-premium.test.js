const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const {
    WHEEL_PRIZES,
    WHEEL_DEMO_REWARDS,
    wheelStatusValue,
    wheelTargetRotation,
    normalizeWheelReward,
    createWheelWizardState,
    validateWheelWizardStep,
    wheelWizardStepMarkup,
    wheelPageMarkup,
} = require("../miniapp/pages/wheel.js");

test("premium wheel exposes eight sectors and backend-ready target rotation", () => {
    assert.equal(WHEEL_PRIZES.length, 8);
    const rotation = wheelTargetRotation(3, 0, 4);
    assert.ok(rotation >= 4 * 360);
    assert.equal((rotation % 360 + 360) % 360, 202.5);
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
    assert.match(css, /cubic-bezier\(\.12,\.64,\.08,1\)/);
    assert.match(css, /prefers-reduced-motion:reduce/);
    assert.match(css, /wheel-confetti-fall/);
    assert.match(source, /4 \+ Math\.floor\(Math\.random\(\) \* 5\)/);
    assert.match(source, /wheelSpinning/);
});
