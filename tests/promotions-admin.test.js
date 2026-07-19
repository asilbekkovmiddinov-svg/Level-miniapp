const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const Core = require("../miniapp/pages/promotions-admin-core.js");
const { PromotionsAdminApi } = require("../miniapp/pages/promotions-admin-api.js");

const sample = [
    { id: 1, title: "Alpha", subtitle: "First offer", status: "ACTIVE", priority: 10, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-02T00:00:00Z" },
    { id: 2, title: "Beta", subtitle: "Second Alpha", status: "PAUSED", priority: 50, created_at: "2026-02-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
    { id: 3, title: "Gamma", subtitle: "Third", status: "DELETED", priority: 20, created_at: "2026-03-01T00:00:00Z", updated_at: "2026-03-02T00:00:00Z" },
].map(Core.normalizePromotion);

function response(status, payload) {
    return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

test("dashboard counts all Marketing CMS statuses", () => {
    const counts = Core.dashboardCounts(sample);
    assert.equal(counts.TOTAL, 3);
    assert.equal(counts.ACTIVE, 1);
    assert.equal(counts.PAUSED, 1);
    assert.equal(counts.DELETED, 1);
    assert.equal(counts.SCHEDULED, 0);
});

test("filter and title/subtitle search are combined", () => {
    assert.deepEqual(Core.visiblePromotions(sample, { filter: "ACTIVE" }).map((x) => x.id), [1]);
    assert.deepEqual(Core.visiblePromotions(sample, { search: "alpha" }).map((x) => x.id), [2, 1]);
    assert.deepEqual(Core.visiblePromotions(sample, { filter: "PAUSED", search: "second" }).map((x) => x.id), [2]);
});

test("sort supports priority, created and updated", () => {
    assert.deepEqual(Core.visiblePromotions(sample, { sort: "PRIORITY" }).map((x) => x.id), [2, 3, 1]);
    assert.deepEqual(Core.visiblePromotions(sample, { sort: "CREATED" }).map((x) => x.id), [3, 2, 1]);
    assert.deepEqual(Core.visiblePromotions(sample, { sort: "UPDATED" }).map((x) => x.id), [3, 1, 2]);
});

test("create and edit payload covers the backend fields", () => {
    const payload = Core.formPayload({
        title: "  Premium  ", subtitle: "Offer", description: "Description",
        banner_url: "https://cdn.example/banner.webp", badge: "NEW", priority: "25",
        button_text: "Open", button_action: "URL", button_target: "https://example.com",
        status: "SCHEDULED", start_at: "2026-08-01T10:00", end_at: "2026-08-02T10:00",
        max_views: "100", max_clicks: "20",
    });
    assert.equal(payload.title, "Premium");
    assert.equal(payload.priority, 25);
    assert.equal(payload.status, "SCHEDULED");
    assert.equal(payload.max_views, 100);
    assert.equal(payload.max_clicks, 20);
    assert.match(payload.start_at, /^2026-08-01T/);
    assert.throws(() => Core.formPayload({ title: "Test", button_action: "URL" }), /target/);
});

test("Admin API sends Telegram initData and never sends internal key", async () => {
    const calls = [];
    const api = new PromotionsAdminApi({
        baseUrl: "https://backend.example/",
        initDataProvider: () => "verified-admin-init-data",
        fetchImpl: async (url, options) => {
            calls.push({ url, options });
            return response(200, []);
        },
    });
    await api.list();
    assert.equal(calls[0].url, "https://backend.example/admin/promotions?include_deleted=true");
    assert.equal(calls[0].options.headers["X-Telegram-Init-Data"], "verified-admin-init-data");
    assert.equal(calls[0].options.headers["X-Internal-Api-Key"], undefined);
    assert.doesNotMatch(JSON.stringify(calls[0]), /Internal-Api-Key/i);
});

test("Admin API maps create, edit, delete, restore and lifecycle routes", async () => {
    const calls = [];
    const api = new PromotionsAdminApi({
        baseUrl: "https://backend.example",
        initDataProvider: () => "admin-init",
        fetchImpl: async (url, options) => { calls.push([url, options.method]); return response(200, {}); },
    });
    await api.create({ title: "A" });
    await api.update(7, { title: "B" });
    await api.remove(7);
    await api.restore(7);
    await api.activate(7);
    await api.pause(7);
    await api.deactivate(7);
    assert.deepEqual(calls, [
        ["https://backend.example/admin/promotions", "POST"],
        ["https://backend.example/admin/promotions/7", "PATCH"],
        ["https://backend.example/admin/promotions/7", "DELETE"],
        ["https://backend.example/admin/promotions/7/restore", "POST"],
        ["https://backend.example/admin/promotions/7/activate", "POST"],
        ["https://backend.example/admin/promotions/7/pause", "POST"],
        ["https://backend.example/admin/promotions/7/deactivate", "POST"],
    ]);
});

test("Admin API exposes exact 401 and 403 UX errors", async () => {
    const missing = new PromotionsAdminApi({ baseUrl: "x", initDataProvider: () => "", fetchImpl: async () => response(200, {}) });
    await assert.rejects(() => missing.list(), (error) => error.status === 401 && error.message === "Admin login required.");
    const forbidden = new PromotionsAdminApi({
        baseUrl: "x", initDataProvider: () => "init", fetchImpl: async () => response(403, {}),
    });
    await assert.rejects(() => forbidden.list(), (error) => error.status === 403 && error.message === "Admin permission required.");
});

test("Admin page contains dashboard, preview, confirmations and resilient states", () => {
    const source = fs.readFileSync(path.join(__dirname, "../miniapp/pages/promotions-admin.js"), "utf8");
    const index = fs.readFileSync(path.join(__dirname, "../miniapp/index.html"), "utf8");
    const app = fs.readFileSync(path.join(__dirname, "../miniapp/app.js"), "utf8");
    for (const expected of ["Marketing CMS", "promotionsAdminStats", "promotionsAdminSearch", "promotionAdminPreview", "promotionsAdminConfirm", "promotionsAdminToast", "pac-skeleton", "pac-empty", "Qayta urinish"]) {
        assert.match(source, new RegExp(expected));
    }
    for (const action of ["edit", "activate", "pause", "deactivate", "delete", "restore"]) {
        assert.match(source, new RegExp(`data-action=\\"${action}\\"`));
    }
    assert.match(index, /id="promotionsAdminPage"/);
    assert.match(index, /pages\/promotions-admin\.js/);
    assert.match(app, /query\.get\("admin"\) === "promotions"/);
});
