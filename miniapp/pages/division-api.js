class DivisionApiError extends Error {
    constructor(message, status = 0) {
        super(message);
        this.name = "DivisionApiError";
        this.status = status;
    }
}

class DivisionApiClient {
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
        if (!initData) throw new DivisionApiError(
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
            throw new DivisionApiError("Server bilan aloqa o‘rnatilmadi.");
        }
        let payload = null;
        try {
            payload = await response.json();
        } catch (_) {}
        if (!response.ok) {
            const messages = {
                401: "Telegram tasdiqlashi eskirgan.",
                403: "Division’da qatnashish tasdiqlanmagan.",
                404: "Global Division hozircha ochilmagan.",
                409: "Amalni hozir bajarib bo‘lmaydi.",
                422: "Ma’lumot formati noto‘g‘ri.",
                503: "Division vaqtincha mavjud emas.",
            };
            const safeDetail = typeof payload?.detail === "string"
                && payload.detail.length < 140 ? payload.detail : "";
            throw new DivisionApiError(
                safeDetail || messages[response.status]
                    || "Division so‘rovi bajarilmadi.",
                response.status,
            );
        }
        return payload;
    }

    async overview() {
        return normalizeDivisionOverview(await this.request("/division"));
    }

    async apply() {
        return normalizeDivisionParticipant(await this.request(
            "/division/apply", { method: "POST" },
        ));
    }

    async standings() {
        return normalizeDivisionStandings(await this.request(
            "/division/standings?limit=100&offset=0",
        ));
    }

    async wallet() {
        const value = await this.request("/wall-rush/wallet");
        return {
            tournamentTickets: Number(value?.tournament_tickets) || 0,
            lockedTournamentTickets:
                Number(value?.locked_tournament_tickets) || 0,
        };
    }

    async activeMatch() {
        return normalizeDivisionMatch(await this.request(
            "/division/matches/active",
        ));
    }

    async joinMatchmaking() {
        return normalizeDivisionMatch(await this.request(
            "/division/matchmaking/join", { method: "POST" },
        ));
    }

    async cancelWaiting(matchId) {
        return normalizeDivisionMatch(await this.request(
            "/division/matches/" + encodeURIComponent(matchId)
                + "/cancel-waiting",
            { method: "POST" },
        ));
    }
}

const divisionApiClient = new DivisionApiClient();
