const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const index = fs.readFileSync(path.join(root, "miniapp/index.html"), "utf8");
const styles = fs.readFileSync(path.join(root, "miniapp/home.css"), "utf8");
const source = fs.readFileSync(path.join(root, "miniapp/home-premium-s3.js"), "utf8");
const home = require("../miniapp/home-premium-s3.js");

test("dynamic hero exposes greeting, particles and parallax without changing identity contract", () => {
    assert.match(index, /id="homeGreeting"/);
    assert.match(index, /home-s3-particles/);
    assert.match(index, /id="homeTelegramAvatar"/);
    assert.equal(home.homeS3Greeting(8), "GOOD MORNING");
    assert.equal(home.homeS3Greeting(14), "GOOD AFTERNOON");
    assert.equal(home.homeS3Greeting(21), "GOOD EVENING");
    assert.match(source, /prefers-reduced-motion: reduce/);
    assert.match(source, /pointer: fine/);
});

test("smart quick actions source badges from Promotions API data", () => {
    for (const page of ["arena", "wheel", "wallet", "shop"]) {
        assert.match(index, new RegExp(`data-home-smart-badge="${page}"`));
    }
    assert.match(source, /promotionsUserState\.items/);
    assert.match(source, /PromotionsUserCore\.resolveAction/);
    assert.doesNotMatch(index, /data-home-smart-badge="[^"]+"[^>]*>\s*(NEW|HOT)/);
    assert.match(styles, /\.home-v4-quick\.is-active/);
    assert.match(styles, /\.home-v4-quick\.is-pressed/);
});

test("personal dashboard uses only existing API reads", () => {
    assert.match(index, /id="homePersonalDashboard"/);
    for (const call of ["arenaApiClient.profile", "getWallet", "getReferralSummary", "getWheelStatus"]) {
        assert.match(source, new RegExp(call.replace(".", "\\.")));
    }
    assert.equal(home.homeS3Metric({ wins: 7 }, ["wins"]), "7");
    assert.equal(home.homeS3Metric({}, ["wins"]), "—");
    assert.equal(home.homeS3Metric(null, ["wins"]), "—");
    assert.doesNotMatch(source, /Math\.random/);
});

test("news and events classify real promotion dates and use existing countdown", () => {
    const now = Date.parse("2026-07-26T12:00:00Z");
    assert.equal(home.homeS3PromotionState({ start_at: "2026-07-27T12:00:00Z" }, now).key, "upcoming");
    assert.equal(home.homeS3PromotionState({ end_at: "2026-07-28T12:00:00Z" }, now).key, "ending");
    assert.equal(home.homeS3PromotionState({ end_at: "2026-08-12T12:00:00Z" }, now).key, "live");
    assert.match(source, /PromotionsUserCore\.countdown/);
    assert.match(index, /Upcoming · Live · Ending Soon/);
});

test("premium footer exposes required release labels", () => {
    assert.match(index, /home-s3-footer/);
    for (const label of ["Version V2", "Build Premium Home", "Support", "Community"]) {
        assert.match(index, new RegExp(label));
    }
});

test("Sprint 3 stays responsive, token-aligned and reduced-motion safe", () => {
    for (const token of [
        "--lg-radius-xl", "--lg-shadow-floating", "--lg-glass-blur",
        "--lg-motion-medium", "--lg-ease-out", "--home-v4-border",
    ]) assert.match(styles, new RegExp(token));
    assert.match(styles, /@media\(max-width:350px\)/);
    assert.match(styles, /@media\(min-width:600px\)/);
    assert.match(styles, /@media\(prefers-reduced-motion:reduce\)/);
    assert.match(index, /home-premium-s3\.js\?v=1\.0\.0/);
});
