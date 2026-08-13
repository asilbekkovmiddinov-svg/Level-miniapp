const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "../miniapp/pages/wall-rush.js"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "../miniapp/wall-rush.css"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "../miniapp/index.html"), "utf8");
const app = fs.readFileSync(path.join(__dirname, "../miniapp/app.js"), "utf8");

test("Wall Rush uses authenticated backend matchmaking and actions", () => {
    assert.match(source, /X-Telegram-Init-Data/);
    assert.match(source, /\/wall-rush\/matchmaking\/join/);
    assert.match(source, /expected_version/);
    assert.match(source, /idempotency_key/);
});

test("turn timer starts at 30 seconds and follows the backend deadline", () => {
    assert.match(source, /id="wrTimer">30\.0<\/strong>/);
    assert.match(source, /turn_deadline_at/);
    assert.doesNotMatch(source, /id="wrTimer">15\.0<\/strong>/);
});

test("Wall Rush reconnects through authoritative WebSocket state", () => {
    assert.match(source, /\/wall-rush\/ws\?init_data=/);
    assert.match(source, /message\.type === "MATCH_STATE"/);
    assert.match(source, /setTimeout\(\(\) => \{[\s\S]*?this\.connect\(\);[\s\S]*?\}, 1500\)/);
});

test("free and ticket modes preserve the agreed economy", () => {
    assert.match(source, /join\('FREE'\)/);
    assert.match(source, /join\('TICKET'\)/);
    assert.match(source, /Ticket raqib topilmaguncha sarflanmaydi/);
    assert.match(source, /Reklama topilmasa ham bepul rejim doim ochiq qoladi/);
    assert.match(source, /\+1 Tournament Ticket/);
});

test("board is 9 by 13 and supports one selected action", () => {
    assert.match(source, /row < 13/);
    assert.match(source, /column < 9/);
    assert.match(source, /actionMode: "MOVE"/);
    assert.match(source, /setMode\('WALL'\)/);
    assert.match(source, /renderWallTargets\(board\)/);
    assert.match(source, /this\.play\(row, column, orientation\)/);
    assert.match(source, /item\.style\.left =/);
    assert.match(source, /item\.style\.top =/);
    assert.doesNotMatch(source, /setOrientation\(/);
    assert.doesNotMatch(source, />Gorizontal<|>Vertikal</);
    assert.match(css, /aspect-ratio:9\/13/);
    assert.match(css, /\.wr-wall\{position:absolute/);
    assert.match(css, /\.wr-wall\.horizontal\{width:22\.22%;height:9px/);
    assert.match(css, /\.wr-wall\.vertical\{width:9px;height:15\.38%/);
    assert.match(css, /\.wr-wall-target\.horizontal::after\{width:126%;height:9px/);
    assert.match(css, /\.wr-wall-target\.vertical::after\{width:9px;height:128%/);
    assert.match(css, /\.wr-wall-target:active::after\{opacity:1\}/);
    assert.doesNotMatch(css, /\.wr-wall-target:active\{[^}]*background/);
    assert.match(css, /\.wr-wall-target\.horizontal\{height:24px/);
    assert.match(css, /\.wr-wall-target\.vertical\{width:24px/);
});

test("MiniApp navigation exposes Wall Rush and cleans realtime resources", () => {
    assert.match(html, /id="wallRushPage"/);
    assert.match(html, /data-page="wall-rush"/);
    assert.match(html, /pages\/wall-rush\.js/);
    assert.match(app, /window\.wallRushController.*\.stop/);
    assert.match(app, /case "wall-rush"/);
});


test("Adsgram is primary and TADS fullscreen is the verified fallback", () => {
    assert.match(html, /https:\/\/sad\.adsgram\.ai\/js\/sad\.min\.js/);
    assert.match(html, /https:\/\/w\.tads\.me\/widget\.js/);
    assert.match(html, /wall-rush-ad-waterfall\.js/);
    assert.match(source, /blockId: "39763"/);
    assert.match(source, /showAdsgram: \(\) => this\.runAdsgramPrimary\(\)/);
    assert.match(source, /showTads: \(\) => this\.runTadsFallback\(\)/);
    assert.match(source, /widgetId: "11416"/);
    assert.match(source, /type: "fullscreen"/);
    assert.match(source, /debug: false/);
    assert.match(source, /onShowReward: \(\) => this\.confirmTadsReward\(\)/);
    assert.match(source, /this\.api\.wallet\(\)/);
    assert.doesNotMatch(source, /game_tickets\s*\+=|game_tickets\+\+/);
});

test("rewarded ad cooldown shows a live mm:ss countdown", () => {
    assert.match(source, /adCooldownRemainingMs\(\)/);
    assert.match(source, /Keyingi reklamagacha \$\{minutes\}:\$\{rest\}/);
    assert.match(source, /setInterval\(\(\) => this\.updateAdCountdown\(\), 1000\)/);
    assert.match(source, /button\.disabled = !this\.adAvailable\(\)/);
    assert.match(source, /this\.adState = ""/);
});

test("Adsgram and TADS no-fill keep Free Play available", () => {
    assert.match(source, /onBannerNotFound/);
    assert.match(source, /onAdsNotFound/);
    assert.match(source, /Hozir reklama topilmadi\. Bepul o‘yin ochiq\./);
    assert.match(source, /join\('FREE'\)/);
    assert.match(css, /\.wr-ad-card/);
});


test("ticket search can be cancelled and back navigation leaves queue", () => {
    assert.match(source, /\/cancel-waiting/);
    assert.match(source, /Qidirishni to‘xtatish/);
    assert.match(source, /async cancelSearch\(\)/);
    assert.match(source, /async leave\(\)/);
    assert.match(app, /wallRushController\?\.leave/);
});

test("rendered HTML contains no escaped newline artifacts", () => {
    assert.doesNotMatch(html, /\\n/);
});


test("Free Play and Ticket Match have separate result ratings", () => {
    assert.match(source, /\/wall-rush\/leaderboard\?mode=/);
    assert.match(source, /this\.api\.leaderboard\("FREE"\)/);
    assert.match(source, /this\.api\.leaderboard\("TICKET"\)/);
    assert.match(source, /setRatingMode\('FREE'\)/);
    assert.match(source, /setRatingMode\('TICKET'\)/);
    assert.match(source, />O‘ynagan</);
    assert.match(source, />Yutgan</);
    assert.match(source, />Yutqazgan</);
    assert.match(source, /row\.played/);
    assert.match(source, /row\.wins/);
    assert.match(source, /row\.losses/);
    assert.match(css, /\.wr-rating-row\{display:grid/);
    assert.match(css, /minmax\(0,1fr\) repeat\(3,44px\)/);
});
