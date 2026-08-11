class DivisionAdminError extends Error {
    constructor(message, status = 0) {
        super(message);
        this.name = "DivisionAdminError";
        this.status = status;
    }
}

class DivisionAdminClient {
    constructor({
        baseUrl = typeof API_URL !== "undefined" ? API_URL : "",
        fetchImpl = (...args) => globalThis.fetch(...args),
        initDataProvider = () => globalThis.Telegram?.WebApp?.initData || "",
    } = {}) {
        this.baseUrl = String(baseUrl).replace(/\/$/, "");
        this.fetchImpl = fetchImpl;
        this.initDataProvider = initDataProvider;
    }

    async request(path, { method = "GET", body = null } = {}) {
        const initData = this.initDataProvider();
        if (!initData) throw new DivisionAdminError(
            "Admin login uchun MiniApp’ni Telegram ichidan oching.", 401,
        );
        let response;
        try {
            response = await this.fetchImpl(this.baseUrl + path, {
                method,
                headers: {
                    "X-Telegram-Init-Data": initData,
                    ...(body ? { "Content-Type": "application/json" } : {}),
                },
                ...(body ? { body: JSON.stringify(body) } : {}),
            });
        } catch (_) {
            throw new DivisionAdminError("Server bilan aloqa o‘rnatilmadi.");
        }
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
            const safe = typeof payload?.detail === "string"
                ? payload.detail : "";
            const defaults = {
                401: "Admin login talab qilinadi.",
                403: "Sizda Division admin ruxsati yo‘q.",
                404: "Division season topilmadi.",
                409: "Division holati bu amalga ruxsat bermaydi.",
                422: "Kiritilgan sanalarni tekshiring.",
            };
            throw new DivisionAdminError(
                safe || defaults[response.status] || "Admin so‘rovi bajarilmadi.",
                response.status,
            );
        }
        return payload;
    }

    overview() {
        return this.request("/division");
    }

    createSeason(input) {
        return this.request("/admin/division/seasons", {
            method: "POST", body: input,
        });
    }

    startSeason(id) {
        return this.request(
            "/admin/division/seasons/" + Number(id) + "/start",
            { method: "POST" },
        );
    }

    finishSeason(id) {
        return this.request(
            "/admin/division/seasons/" + Number(id) + "/finish",
            { method: "POST" },
        );
    }

    applications(id, status = "PENDING") {
        const query = new URLSearchParams({
            status, limit: "100", offset: "0",
        });
        return this.request(
            "/admin/division/seasons/" + Number(id)
                + "/applications?" + query,
        );
    }

    decide(seasonId, participantId, decision) {
        return this.request(
            "/admin/division/seasons/" + Number(seasonId)
                + "/applications/" + Number(participantId) + "/decision",
            { method: "POST", body: { decision } },
        );
    }
}

const divisionAdminApi = new DivisionAdminClient();
