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
    assert.match(source, /setTimeout\(\(\) => this\.connect\(\), 1500\)/);
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
    assert.match(css, /aspect-ratio:9\/13/);
});

test("MiniApp navigation exposes Wall Rush and cleans realtime resources", () => {
    assert.match(html, /id="wallRushPage"/);
    assert.match(html, /data-page="wall-rush"/);
    assert.match(html, /pages\/wall-rush\.js/);
    assert.match(app, /window\.wallRushController.*\.stop/);
    assert.match(app, /case "wall-rush"/);
});


test("TADS fullscreen reward is verified by backend wallet state", () => {
    assert.match(html, /https:\/\/w\.tads\.me\/widget\.js/);
    assert.match(source, /widgetId: "11416"/);
    assert.match(source, /type: "fullscreen"/);
    assert.match(source, /debug: false/);
    assert.match(source, /onShowReward: \(\) => this\.confirmTadsReward\(\)/);
    assert.match(source, /this\.api\.wallet\(\)/);
    assert.doesNotMatch(source, /game_tickets\s*\+=|game_tickets\+\+/);
});

test("TADS no-fill keeps Free Play available", () => {
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
