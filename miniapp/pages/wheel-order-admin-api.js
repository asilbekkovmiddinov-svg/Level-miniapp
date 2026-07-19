(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    else root.WheelOrderAdminApi = api.WheelOrderAdminApi;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    class WheelOrderAdminError extends Error {
        constructor(message, status = 0) { super(message); this.name = "WheelOrderAdminError"; this.status = status; }
    }
    class WheelOrderAdminApi {
        constructor({ baseUrl = "", initDataProvider, fetchImpl } = {}) {
            this.baseUrl = String(baseUrl).replace(/\/$/, "");
            this.initDataProvider = initDataProvider || (() => globalThis.Telegram?.WebApp?.initData || "");
            this.fetchImpl = fetchImpl || globalThis.fetch.bind(globalThis);
        }
        async request(path, { method = "GET" } = {}) {
            const initData = this.initDataProvider();
            if (!initData) throw new WheelOrderAdminError("Admin login required.", 401);
            const response = await this.fetchImpl(`${this.baseUrl}${path}`, { method, headers: { "X-Telegram-Init-Data": initData } });
            let payload = null;
            try { payload = await response.json(); } catch (_error) { /* mapped below */ }
            if (!response.ok) {
                const fallback = response.status === 401 ? "Admin login required." : response.status === 403 ? "Admin permission required." : "Wheel Coin Order so‘rovini bajarib bo‘lmadi.";
                throw new WheelOrderAdminError(payload?.detail || fallback, response.status);
            }
            if (payload === null) throw new WheelOrderAdminError("Serverdan noto‘g‘ri javob olindi.", response.status);
            return payload;
        }
        list() { return this.request("/admin/wheel/coin-orders"); }
        cancel(id) { return this.request(`/admin/wheel/coin-orders/${Number(id)}/cancel`, { method: "POST" }); }
    }
    return { WheelOrderAdminApi, WheelOrderAdminError };
});
