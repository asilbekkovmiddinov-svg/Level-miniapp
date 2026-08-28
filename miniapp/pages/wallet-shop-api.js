class WalletShopApiError extends Error {
    constructor(message, status = 0) {
        super(message);
        this.name = "WalletShopApiError";
        this.status = status;
    }
}

class WalletShopApi {
    constructor({
        baseUrl = typeof API_URL !== "undefined" ? API_URL : "",
        fetchImpl = (...args) => globalThis.fetch(...args),
        initDataProvider = () => globalThis.Telegram?.WebApp?.initData || "",
    } = {}) {
        this.baseUrl = String(baseUrl).replace(/\/$/, "");
        this.fetchImpl = fetchImpl;
        this.initDataProvider = initDataProvider;
    }

    async request(path, {
        method = "GET",
        body = null,
        idempotencyKey = null,
    } = {}) {
        const initData = this.initDataProvider();
        if (!initData) {
            throw new WalletShopApiError("Telegram tasdiqlash ma’lumoti topilmadi.", 401);
        }
        let response;
        try {
            response = await this.fetchImpl(`${this.baseUrl}${path}`, {
                method,
                headers: {
                    "X-Telegram-Init-Data": initData,
                    ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
                    ...(body ? { "Content-Type": "application/json" } : {}),
                },
                ...(body ? { body: JSON.stringify(body) } : {}),
            });
        } catch (_error) {
            throw new WalletShopApiError("Magazin serveri bilan aloqa o‘rnatilmadi.");
        }

        let payload = null;
        try { payload = await response.json(); } catch (_error) { /* handled below */ }
        if (!response.ok) {
            const fallback = response.status === 401
                ? "Telegram tasdiqlashi yaroqsiz yoki eskirgan."
                : response.status === 403
                    ? "Bu amalni bajarishga ruxsat yo‘q."
                    : response.status === 409
                        ? "Balans yetarli emas yoki Magazin hali sozlanmagan."
                        : "Magazin amalini bajarib bo‘lmadi.";
            throw new WalletShopApiError(payload?.detail || fallback, response.status);
        }
        if (payload === null) {
            throw new WalletShopApiError("Serverdan noto‘g‘ri javob olindi.", response.status);
        }
        return payload;
    }

    catalog() {
        return this.request("/wallet-shop/catalog");
    }

    buyEfc(efcAmount, idempotencyKey) {
        return this.request("/wallet-shop/buy-efc", {
            method: "POST",
            body: { efc_amount: efcAmount },
            idempotencyKey,
        });
    }

    buyTickets(quantity, idempotencyKey) {
        return this.request("/wallet-shop/buy-ticket", {
            method: "POST",
            body: { quantity },
            idempotencyKey,
        });
    }

    adminSettings() {
        return this.request("/admin/wallet-shop/settings");
    }

    updateAdminSettings(efcPriceUzs, ticketPriceEfc) {
        return this.request("/admin/wallet-shop/settings", {
            method: "PUT",
            body: {
                efc_price_uzs: efcPriceUzs,
                ticket_price_efc: ticketPriceEfc,
            },
        });
    }
}

globalThis.WalletShopApi = WalletShopApi;
globalThis.WalletShopApiError = WalletShopApiError;

if (typeof module !== "undefined" && module.exports) {
    module.exports = { WalletShopApi, WalletShopApiError };
}
