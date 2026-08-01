const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const index = fs.readFileSync(path.join(root, "miniapp/index.html"), "utf8");
const styles = fs.readFileSync(path.join(root, "miniapp/home.css"), "utf8");
const controllerSource = fs.readFileSync(path.join(root, "miniapp/home-premium.js"), "utf8");
const liveSource = fs.readFileSync(path.join(root, "miniapp/pages/live-winners.js"), "utf8");
const home = require("../miniapp/home-premium.js");

test("premium hero exposes Telegram identity and notification/settings actions", () => {
    assert.match(index, /id="homeTelegramAvatar"/);
    assert.match(index, /id="homeName"/);
    assert.match(index, /WELCOME BACK/);
    assert.match(index, /data-page="notifications"/);
    assert.match(index, /aria-label="Sozlamalar"/);
    assert.match(controllerSource, /Telegram\?\.WebApp\?\.initDataUnsafe\?\.user/);
});

test("wallet hero preserves authoritative balance targets and actions", () => {
    for (const id of ["efcBalance", "uzsBalance", "lockedEfcBalance", "lockedUzsBalance"]) {
        assert.match(index, new RegExp(`id="${id}"`));
    }
    assert.match(index, /openDeposit\(\)/);
    assert.match(index, /openWithdraw\(\)/);
    assert.match(styles, /\.home-v4-wallet/);
    assert.match(styles, /homeV4Balance/);
});

test("quick actions are the requested premium 2x2 destinations", () => {
    const quick = index.match(/<div class="home-v4-quick-grid[\s\S]*?<\/div>/)?.[0] || "";
    assert.match(quick, /data-page="arena"/);
    assert.match(quick, /data-page="wheel"/);
    assert.match(quick, /data-page="wallet"/);
    assert.match(quick, /data-page="shop"/);
    assert.equal((quick.match(/class="home-v4-quick home-quick-card/g) || []).length, 4);
    assert.match(styles, /\.home-v4-ripple/);
});

test("quick actions use optimized contextual artwork instead of emoji icons", () => {
    const quick = index.match(/<div class="home-v4-quick-grid[\s\S]*?<\/div>/)?.[0] || "";
    for (const asset of ["quick-arena.webp", "quick-wheel.webp", "quick-wallet.webp", "quick-shop.webp"]) {
        assert.match(quick, new RegExp(`assets/home/${asset}`));
    }
    assert.equal((quick.match(/loading="lazy"/g) || []).length, 4);
    assert.equal((quick.match(/class="home-v4-quick-art"/g) || []).length, 4);
    assert.doesNotMatch(quick, /⚔|🎡|💰|🪙/u);
    assert.match(styles, /\.home-v4-quick-art img/);
});

test("live info uses existing Arena and winner read data with honest fallbacks", () => {
    for (const id of ["homeOnlineUsers", "homeActiveMatches", "homeWeeklyPrize", "homeTodayWinners"]) {
        assert.match(index, new RegExp(`id="${id}"`));
    }
    assert.match(controllerSource, /arenaApiClient\.dashboard\(\)/);
    assert.match(controllerSource, /weekly_prize_pool_efc/);
    assert.match(controllerSource, /weeklyPrize === null \? "—"/);
    assert.match(liveSource, /updateHomePremiumLiveInfo\(data, payload\)/);
});

test("live info metrics use optimized contextual artwork", () => {
    const live = index.match(/<div class="home-v4-live-strip"[\s\S]*?<\/div>/)?.[0] || "";
    for (const asset of ["live-online.webp", "live-matches.webp", "live-prize.webp", "live-winners.webp"]) {
        assert.match(live, new RegExp(`assets/home/${asset}`));
    }
    assert.equal((live.match(/loading="lazy"/g) || []).length, 4);
    assert.equal((live.match(/aria-hidden="true"/g) || []).length, 4);
    assert.match(styles, /\.home-v4-live-strip article>img/);
});

test("premium controller normalizes safe URLs and numeric metrics", () => {
    assert.equal(home.homePremiumSafeUrl("http://example.com/a.png"), "");
    assert.equal(home.homePremiumSafeUrl("https://example.com/a.png"), "https://example.com/a.png");
    assert.equal(home.parseHomeMetric("12 345 EFC"), 12345);
    assert.equal(home.parseHomeMetric("—"), null);
});

test("Home follows Arena design tokens, responsive layout and reduced motion", () => {
    for (const token of [
        "--lg-radius-xl", "--lg-shadow-floating", "--lg-gradient-brand", "--lg-glass-blur",
        "--lg-motion-fast", "--lg-ease-spring",
    ]) assert.match(styles, new RegExp(token));
    assert.match(styles, /@media\(max-width:350px\)/);
    assert.match(styles, /@media\(min-width:600px\)/);
    assert.match(styles, /@media\(prefers-reduced-motion:reduce\)/);
    assert.match(index, /home-premium\.js\?v=1\.0\.0/);
});
