const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const index = fs.readFileSync(path.join(root, "miniapp/index.html"), "utf8");
const styles = fs.readFileSync(path.join(root, "miniapp/home.css"), "utf8");
const controllerSource = fs.readFileSync(path.join(root, "miniapp/home-premium-s2.js"), "utf8");
const promotionsSource = fs.readFileSync(path.join(root, "miniapp/pages/promotions-user.js"), "utf8");
const home = require("../miniapp/home-premium-s2.js");

test("Home exposes premium promotion, mission, featured and activity surfaces", () => {
    for (const id of ["homePromotions", "homeDailyMissions", "homeFeaturedCards", "homeRecentActivity"]) {
        assert.match(index, new RegExp(`id="${id}"`));
    }
    assert.match(index, /home-premium-s2\.js\?v=1\.0\.0/);
});

test("promotion hero preserves existing API carousel behavior", () => {
    assert.match(promotionsSource, /promotionsUserApi\.active\(\)/);
    assert.match(promotionsSource, /setInterval\(\(\) => movePromotionSlide/);
    assert.match(promotionsSource, /touchstart/);
    assert.match(promotionsSource, /touchend/);
    assert.match(promotionsSource, /data-carousel-index/);
    assert.match(promotionsSource, /prefers-reduced-motion: reduce/);
    assert.match(promotionsSource, /home-s2-promotion-empty/);
});

test("recent activity uses existing read functions and requires real timestamps", () => {
    for (const call of [
        "arenaApiClient.myMatches", "getWalletTransactions", "getWheelStatus",
        "getUserOrders", "getReferralSummary",
    ]) assert.match(controllerSource, new RegExp(call.replace(".", "\\.")));
    assert.equal(home.homeS2Timestamp({ created_at: "2026-07-26T10:00:00Z" }), 1785060000000);
    assert.equal(home.homeS2Timestamp({}), null);
    assert.deepEqual(home.homeS2Array({ data: { transactions: [{ id: 1 }] } }, ["transactions"]), [{ id: 1 }]);
});

test("daily missions render only explicit server progress and never fabricate totals", () => {
    const rows = home.explicitMissionRows({
        api: { data: { daily_missions: [{ title: "Arena", progress: 1, target: 3 }] } },
    });
    assert.deepEqual(rows[0], { title: "Arena", progress: 1, target: 3, completed: false, icon: "◆" });
    assert.deepEqual(home.explicitMissionRows({ api: { total_matches: 12, total_referrals: 5 } }), []);
    assert.match(controllerSource, /Kunlik missiyalar kutilmoqda/);
});

test("featured cards are sourced from active promotions rather than static fixtures", () => {
    assert.match(controllerSource, /promotionsUserState\.items\.slice\(0, 3\)/);
    assert.match(controllerSource, /activatePromotion/);
    assert.doesNotMatch(controllerSource, /Weekly Tournament.*Hot Promotion.*New Feature/s);
});

test("Sprint 2 follows Arena motion tokens, responsive rules and reduced motion", () => {
    for (const token of [
        "--lg-radius-xl", "--lg-shadow-floating", "--lg-glass-blur",
        "--lg-motion-medium", "--lg-ease-out", "--home-v4-border",
    ]) assert.match(styles, new RegExp(token));
    assert.match(styles, /@media\(max-width:350px\)/);
    assert.match(styles, /@media\(min-width:600px\)/);
    assert.match(styles, /@media\(prefers-reduced-motion:reduce\)/);
    assert.match(styles, /homeS2Shimmer/);
    assert.match(styles, /homeS2Reveal/);
});
