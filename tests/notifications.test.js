const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const Core = require("../miniapp/pages/notifications-core.js");
const { NotificationsApi } = require("../miniapp/pages/notifications-api.js");

const sample = Core.normalize([
    { id: 1, title: "Coin Sale", message: "Premium coins", status: "UNREAD", button_action: "COIN_SHOP", created_at: "2026-07-19T10:00:00Z" },
    { id: 2, title: "Arena", message: "New match", status: "READ", button_action: "ARENA", created_at: "2026-07-19T11:00:00Z" },
    { id: 3, title: "Referral", message: "Invite friends", status: "CLICKED", button_action: "REFERRAL", created_at: "2026-07-19T12:00:00Z" },
    { id: 4, title: "Hidden", message: "Dismissed", status: "DISMISSED" },
]);

function response(status, payload) {
    return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

test("notification list normalizes order, unread badge, search and filters", () => {
    assert.deepEqual(sample.map((item) => item.id), [3, 2, 1]);
    assert.equal(Core.unreadCount(sample), 1);
    assert.deepEqual(Core.visible(sample, { filter: "UNREAD" }).map((item) => item.id), [1]);
    assert.deepEqual(Core.visible(sample, { filter: "READ" }).map((item) => item.id), [3, 2]);
    assert.deepEqual(Core.visible(sample, { search: "premium" }).map((item) => item.id), [1]);
    assert.equal(Core.icon("WHEEL"), "🎁");
});

test("last successful notification list is cached for offline fallback", () => {
    const memory = new Map();
    const storage = { setItem: (key, value) => memory.set(key, value), getItem: (key) => memory.get(key) };
    Core.save(storage, sample, 1000);
    assert.deepEqual(Core.load(storage, 2000).map((item) => item.id), [3, 2, 1]);
    assert.deepEqual(Core.load(storage, 86401001), []);
});

test("Notification API uses verified initData and exact public routes", async () => {
    const calls = [];
    const api = new NotificationsApi({ baseUrl: "https://backend.example/", initDataProvider: () => "verified", fetchImpl: async (url, options) => { calls.push([url, options]); return response(200, url.endsWith("unread-count") ? { unread_count: 2 } : []); } });
    await api.list(); await api.unreadCount(); await api.read(7); await api.readAll(); await api.click(7); await api.dismiss(7);
    assert.deepEqual(calls.map(([url, options]) => [url, options.method]), [
        ["https://backend.example/notifications", "GET"], ["https://backend.example/notifications/unread-count", "GET"],
        ["https://backend.example/notifications/7/read", "POST"], ["https://backend.example/notifications/read-all", "POST"],
        ["https://backend.example/notifications/7/click", "POST"], ["https://backend.example/notifications/7", "DELETE"],
    ]);
    assert.ok(calls.every(([, options]) => options.headers["X-Telegram-Init-Data"] === "verified"));
    assert.doesNotMatch(JSON.stringify(calls), /admin\/|Internal-Api-Key/i);
});

test("Notification API exposes 401, 403 and retryable server errors", async () => {
    const missing = new NotificationsApi({ baseUrl: "x", initDataProvider: () => "", fetchImpl: async () => response(200, []) });
    await assert.rejects(() => missing.list(), (error) => error.status === 401 && error.message === "Login required.");
    const forbidden = new NotificationsApi({ baseUrl: "x", initDataProvider: () => "init", fetchImpl: async () => response(403, {}) });
    await assert.rejects(() => forbidden.list(), (error) => error.status === 403 && error.message === "Permission denied.");
    const server = new NotificationsApi({ baseUrl: "x", initDataProvider: () => "init", fetchImpl: async () => response(503, {}) });
    await assert.rejects(() => server.list(), /vaqtincha/);
});

test("Notification Center contains premium resilient UX and action routing", () => {
    const source = fs.readFileSync(path.join(__dirname, "../miniapp/pages/notifications.js"), "utf8");
    const index = fs.readFileSync(path.join(__dirname, "../miniapp/index.html"), "utf8");
    const app = fs.readFileSync(path.join(__dirname, "../miniapp/app.js"), "utf8");
    for (const expected of ["notificationBellBadge", "markNotificationRead", "markAllNotificationsRead", "activateNotification", "dismissNotification", "touchstart", "touchmove", "data-notifications-retry", "nfc-skeleton", "Hozircha bildirishnomalar yo‘q", "setInterval(() => refreshNotifications(), 30000)", "promotion_id", "PromotionsUserCore.resolveAction"]) assert.match(source, new RegExp(expected.replace(/[()]/g, "\\$&")));
    assert.match(index, /id="notificationsPage"/); assert.match(index, /data-page="notifications"/); assert.match(index, /notifications\.css/);
    assert.match(app, /case "notifications"/); assert.match(app, /startNotificationsAutoRefresh/);
});
