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
        analytics(period = "7D") { return this.request(`/admin/promotions/analytics?period=${encodeURIComponent(period)}`); }
        async exportAnalytics(period = "7D") {
            const initData = this.initDataProvider();
            if (!initData) throw new PromotionsAdminError("Admin login required.", 401);
            const response = await this.fetchImpl(`${this.baseUrl}/admin/promotions/analytics/export?period=${encodeURIComponent(period)}`, {
                headers: { "X-Telegram-Init-Data": initData },
            });
            if (!response.ok) throw new PromotionsAdminError(response.status === 401 ? "Admin login required." : response.status === 403 ? "Admin permission required." : "CSV export failed.", response.status);
            return { blob: await response.blob(), filename: `promotion-analytics-${period.toLowerCase()}.csv` };
        }
        deleteBanner(id) { return this.request(`/admin/promotions/${Number(id)}/banner`, { method: "DELETE" }); }

        uploadBanner(id, blob, onProgress = () => {}, xhrFactory = () => new XMLHttpRequest()) {
            const initData = this.initDataProvider();
            if (!initData) return Promise.reject(new PromotionsAdminError("Admin login required.", 401));
            return new Promise((resolve, reject) => {
                const xhr = xhrFactory();
                xhr.open("POST", `${this.baseUrl}/admin/promotions/${Number(id)}/banner`);
                xhr.setRequestHeader("X-Telegram-Init-Data", initData);
                xhr.upload.onprogress = (event) => {
                    if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
                };
                xhr.onerror = () => reject(new PromotionsAdminError("Banner upload network error."));
                xhr.onload = () => {
                    let payload = null;
                    try { payload = JSON.parse(xhr.responseText || "null"); } catch (_error) { /* handled below */ }
                    if (xhr.status < 200 || xhr.status >= 300) {
                        const message = xhr.status === 401 ? "Admin login required."
                            : xhr.status === 403 ? "Admin permission required."
                                : payload?.detail || "Banner upload failed.";
                        reject(new PromotionsAdminError(message, xhr.status));
                        return;
                    }
                    if (!payload) return reject(new PromotionsAdminError("Serverdan noto‘g‘ri javob olindi.", xhr.status));
                    onProgress(100);
                    resolve(payload);
                };
                const form = new FormData();
                const extension = blob.type === "image/png" ? "png" : blob.type === "image/jpeg" ? "jpg" : "webp";
                form.append("file", blob, `promotion-banner.${extension}`);
                xhr.send(form);
            });
        }
    }

    return { PromotionsAdminApi, PromotionsAdminError };
});
