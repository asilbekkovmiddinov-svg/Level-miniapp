class TournamentApiError extends Error {
    constructor(message, status = 0) {
        super(message);
        this.name = "TournamentApiError";
        this.status = status;
    }
}

class TournamentApiClient {
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
        if (!initData) throw new TournamentApiError(
            "Telegram tasdiqlashi topilmadi.", 401,
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
            throw new TournamentApiError("Server bilan aloqa o‘rnatilmadi.");
        }
        let payload = null;
        try { payload = await response.json(); } catch (_) {}
        if (!response.ok) {
            const safeDetail = typeof payload?.detail === "string"
                && payload.detail.length < 160 ? payload.detail : "";
            const messages = {
                401: "Telegram tasdiqlashi eskirgan.",
                403: "Bu turnir amaliga ruxsat yo‘q.",
                404: "Turnir topilmadi.",
                409: "Amalni turnirning hozirgi holatida bajarib bo‘lmaydi.",
                422: "Ma’lumot formati noto‘g‘ri.",
            };
            throw new TournamentApiError(
                safeDetail || messages[response.status] || "Turnir so‘rovi bajarilmadi.",
                response.status,
            );
        }
        return payload;
    }

    async overview() {
        return normalizeTournamentOverview(await this.request("/tournaments/current"));
    }

    async apply(tournamentId) {
        return normalizeTournamentParticipant(await this.request(
            `/tournaments/${Number(tournamentId)}/apply`, { method: "POST" },
        ));
    }
}

const tournamentApiClient = new TournamentApiClient();
