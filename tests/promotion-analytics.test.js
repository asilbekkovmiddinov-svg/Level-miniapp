const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const Core = require("../miniapp/pages/promotions-analytics-core.js");
const { PromotionsAdminApi } = require("../miniapp/pages/promotions-admin-api.js");

test("analytics normalizes metrics, rankings, filters and chart data", () => {
    const value = Core.normalize({ period: "30D", summary: { views: "10", clicks: 2, unique_users: 7, ctr: 20 }, promotions: [{ promotion_id: 4, views: 10 }], top_performing: [{ title: "A" }], daily: [{ date: "2026-07-19", views: 10, clicks: 2, ctr: 20 }] });
    assert.equal(value.period, "30D"); assert.equal(value.summary.unique_users, 7);
    assert.equal(Core.metricMap(value).get(4).views, 10);
    assert.equal(value.rankings.top_performing[0].title, "A");
    assert.match(Core.chartPoints(value.daily, "views"), /^150\.0,/);
    assert.deepEqual(Core.PERIODS, ["TODAY", "7D", "30D", "ALL"]);
});

test("analytics and CSV API use verified Telegram auth only", async () => {
    const calls = [];
    const api = new PromotionsAdminApi({ baseUrl: "https://api", initDataProvider: () => "verified", fetchImpl: async (url, options) => { calls.push([url, options]); return url.includes("export") ? { ok: true, status: 200, blob: async () => new Blob(["id"])} : { ok: true, status: 200, json: async () => ({ period: "7D" }) }; } });
    await api.analytics("TODAY"); const csv = await api.exportAnalytics("30D");
    assert.match(calls[0][0], /period=TODAY/); assert.match(calls[1][0], /analytics\/export\?period=30D/);
    assert.equal(calls[1][1].headers["X-Telegram-Init-Data"], "verified");
    assert.doesNotMatch(JSON.stringify(calls), /Internal-Api-Key/i); assert.match(csv.filename, /30d/);
});

test("admin dashboard includes required performance UX", () => {
    const source = fs.readFileSync(path.join(__dirname, "../miniapp/pages/promotions-admin.js"), "utf8");
    for (const text of ["Top Performing", "Worst Performing", "Most Clicked", "Highest CTR", "Daily Views", "Daily Clicks", "CTR Trend", "Unique Users", "exportPromotionsAnalytics"]) assert.match(source, new RegExp(text));
});
