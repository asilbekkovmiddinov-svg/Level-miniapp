(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    else { root.NotificationsApi = api.NotificationsApi; root.NotificationsApiError = api.NotificationsApiError; }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    class NotificationsApiError extends Error {
        constructor(message, status = 0) { super(message); this.name = "NotificationsApiError"; this.status = status; }
    }
    class NotificationsApi {
        constructor({ baseUrl = "", initDataProvider, fetchImpl } = {}) {
            this.baseUrl = String(baseUrl).replace(/\/$/, "");
            this.initDataProvider = initDataProvider || (() => globalThis.Telegram?.WebApp?.initData || "");
            this.fetchImpl = fetchImpl || globalThis.fetch.bind(globalThis);
        }
        async request(path, method = "GET") {
            const initData = this.initDataProvider();
            if (!initData) throw new NotificationsApiError("Login required.", 401);
            const response = await this.fetchImpl(`${this.baseUrl}${path}`, { method, headers: { "X-Telegram-Init-Data": initData } });
            let payload = null;
            try { payload = await response.json(); } catch (_error) { /* mapped below */ }
            if (!response.ok) throw new NotificationsApiError(response.status === 401 ? "Login required." : response.status === 403 ? "Permission denied." : payload?.detail || "Notification serveri vaqtincha ishlamayapti.", response.status);
            if (payload === null) throw new NotificationsApiError("Notification javobi noto‘g‘ri.", response.status);
            return payload;
        }
        list() { return this.request("/notifications"); }
        unreadCount() { return this.request("/notifications/unread-count"); }
        read(id) { return this.request(`/notifications/${Number(id)}/read`, "POST"); }
        readAll() { return this.request("/notifications/read-all", "POST"); }
        click(id) { return this.request(`/notifications/${Number(id)}/click`, "POST"); }
        dismiss(id) { return this.request(`/notifications/${Number(id)}`, "DELETE"); }
    }
    return { NotificationsApi, NotificationsApiError };
});
