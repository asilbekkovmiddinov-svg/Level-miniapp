(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    else root.PromotionsAdminApi = api.PromotionsAdminApi;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    class PromotionsAdminError extends Error {
        constructor(message, status = 0) {
            super(message);
            this.name = "PromotionsAdminError";
            this.status = status;
        }
    }

    class PromotionsAdminApi {
        constructor({ baseUrl, initDataProvider, fetchImpl } = {}) {
            this.baseUrl = String(baseUrl || "").replace(/\/$/, "");
            this.initDataProvider = initDataProvider || (() => globalThis.Telegram?.WebApp?.initData || "");
            this.fetchImpl = fetchImpl || globalThis.fetch.bind(globalThis);
        }

        async request(path, { method = "GET", body } = {}) {
            const initData = this.initDataProvider();
            if (!initData) throw new PromotionsAdminError("Admin login required.", 401);
            const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
                method,
                headers: {
                    "X-Telegram-Init-Data": initData,
                    ...(body ? { "Content-Type": "application/json" } : {}),
                },
                ...(body ? { body: JSON.stringify(body) } : {}),
            });
            let payload = null;
            try { payload = await response.json(); } catch (_error) { /* handled below */ }
            if (!response.ok) {
                const fallback = response.status === 401
                    ? "Admin login required."
                    : response.status === 403
                        ? "Admin permission required."
                        : "Admin so‘rovini bajarib bo‘lmadi.";
                throw new PromotionsAdminError(payload?.detail || fallback, response.status);
            }
            if (payload === null) throw new PromotionsAdminError("Serverdan noto‘g‘ri javob olindi.", response.status);
            return payload;
        }

        list() { return this.request("/admin/promotions?include_deleted=true"); }
        create(data) { return this.request("/admin/promotions", { method: "POST", body: data }); }
        update(id, data) { return this.request(`/admin/promotions/${Number(id)}`, { method: "PATCH", body: data }); }
        remove(id) { return this.request(`/admin/promotions/${Number(id)}`, { method: "DELETE" }); }
        restore(id) { return this.request(`/admin/promotions/${Number(id)}/restore`, { method: "POST" }); }
        activate(id) { return this.request(`/admin/promotions/${Number(id)}/activate`, { method: "POST" }); }
        pause(id) { return this.request(`/admin/promotions/${Number(id)}/pause`, { method: "POST" }); }
        deactivate(id) { return this.request(`/admin/promotions/${Number(id)}/deactivate`, { method: "POST" }); }
    }

    return { PromotionsAdminApi, PromotionsAdminError };
});
