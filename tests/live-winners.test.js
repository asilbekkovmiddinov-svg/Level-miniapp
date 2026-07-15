const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

global.userAvatarComponent = () => '<span class="user-avatar"></span>';
const {
    maskWinnerIdentity,
    normalizeWinnerReward,
    normalizeLiveWinners,
    liveWinnerRelativeTime,
    liveWinnerCard,
} = require("../miniapp/pages/live-winners.js");

test("Live Winners masks display names and usernames client-side", () => {
    assert.equal(maskWinnerIdentity("Asilbek"), "As****k");
    assert.equal(maskWinnerIdentity("@John05"), "Jo****5");
    const data = normalizeLiveWinners({ winners: [{ id: 1, display_name: "Ulugbekjon", username: "levelplayer", amount: 100, currency: "EFC" }] });
    assert.equal(data.winners[0].maskedName, "Ul*******n");
    assert.equal(data.winners[0].maskedUsername, "@le********r");
    assert.doesNotMatch(liveWinnerCard(data.winners[0]), /Ulugbekjon|levelplayer/);
});

test("Live Winners maps EFC, UZS and Coin premium rewards", () => {
    assert.equal(normalizeWinnerReward({ amount: 100, type: "EFC" }).label, "100 EFC");
    assert.equal(normalizeWinnerReward({ amount: 5000, type: "UZS" }).icon, "💵");
    assert.equal(normalizeWinnerReward({ amount: 130, type: "COIN" }).icon, "🪙");
    assert.equal(normalizeWinnerReward({ amount: 2000, type: "COINS" }).icon, "👑");
});

test("Live Winners normalizes backend-ready envelopes and relative time", () => {
    const payload = { data: { items: [{ reward_id: 7, amount: 5000, reward_type: "UZS", won_at: "2030-01-01T10:00:00Z" }], today_stats: { efc: 100 }, last_jackpot: { amount: 2000, type: "COIN" } } };
    const result = normalizeLiveWinners(payload);
    assert.equal(result.winners.length, 1);
    assert.equal(result.today.efc, 100);
    assert.equal(result.jackpot.amount, 2000);
    assert.equal(liveWinnerRelativeTime("2030-01-01T10:00:00Z", Date.parse("2030-01-01T12:00:00Z")), "2 soat oldin");
});

test("Home integrates skeleton, retry, empty, 12-second polling and reduced motion", () => {
    const index = fs.readFileSync(path.join(__dirname, "../miniapp/index.html"), "utf8");
    const source = fs.readFileSync(path.join(__dirname, "../miniapp/pages/live-winners.js"), "utf8");
    const css = fs.readFileSync(path.join(__dirname, "../miniapp/home.css"), "utf8");
    assert.match(index, /So‘nggi yutuqlar/);
    assert.match(source, /setInterval\(\(\) => loadLiveWinners\(\{ silent: true \}\), 12000\)/);
    assert.match(source, /Qayta urinish/);
    assert.match(source, /Bugungi g‘olib/);
    assert.match(css, /prefers-reduced-motion:reduce/);
});
