(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    else root.PromotionsUserApi = api.PromotionsUserApi;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    class PromotionsUserApi {
        constructor({ baseUrl = "", initDataProvider, fetchImpl } = {}) {
            this.baseUrl = String(baseUrl).replace(/\/$/, "");
            this.initDataProvider = initDataProvider || (() => globalThis.Telegram?.WebApp?.initData || "");
            this.fetchImpl = fetchImpl || globalThis.fetch.bind(globalThis);
        }
        async request(path, method = "GET") {
            const initData = this.initDataProvider();
            if (!initData) throw new Error("Telegram authentication required.");
            const response = await this.fetchImpl(`${this.baseUrl}${path}`, { method, headers: { "X-Telegram-Init-Data": initData } });
            if (!response.ok) throw new Error(response.status === 401 ? "Telegram authentication required." : "Promotions serveri vaqtincha ishlamayapti.");
            if (response.status === 204) return null;
            try { return await response.json(); } catch (_error) { throw new Error("Promotions javobi noto‘g‘ri."); }
        }
        active() { return this.request("/promotions/active"); }
        view(id) { return this.request(`/promotions/${Number(id)}/view`, "POST"); }
        click(id) { return this.request(`/promotions/${Number(id)}/click`, "POST"); }
    }
    return { PromotionsUserApi };
});
