const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const {
    WHEEL_PRIZES,
    wheelStatusValue,
    wheelTargetRotation,
    wheelPageMarkup,
} = require("../miniapp/pages/wheel.js");

test("premium wheel exposes eight sectors and backend-ready target rotation", () => {
    assert.equal(WHEEL_PRIZES.length, 8);
    const rotation = wheelTargetRotation(3, 0, 4);
    assert.ok(rotation >= 4 * 360);
    assert.equal((rotation % 360 + 360) % 360, 202.5);
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
});

test("wheel animation is transform-only and supports reduced motion", () => {
    const css = fs.readFileSync(path.join(__dirname, "../miniapp/style.css"), "utf8");
    const source = fs.readFileSync(path.join(__dirname, "../miniapp/pages/wheel.js"), "utf8");
    assert.match(css, /cubic-bezier\(\.12,\.64,\.08,1\)/);
    assert.match(css, /prefers-reduced-motion:reduce/);
    assert.match(source, /4 \+ Math\.floor\(Math\.random\(\) \* 5\)/);
    assert.match(source, /wheelSpinning/);
});
