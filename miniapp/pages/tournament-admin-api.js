class TournamentAdminError extends Error {
    constructor(message, status = 0) {
        super(message);
        this.name = "TournamentAdminError";
        this.status = status;
    }
}

class TournamentAdminClient {
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
        if (!initData) throw new TournamentAdminError(
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
            throw new TournamentAdminError("Server bilan aloqa o‘rnatilmadi.");
        }
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
            throw new TournamentAdminError(
                typeof payload?.detail === "string"
                    ? payload.detail : "Turnir amali bajarilmadi.",
                response.status,
            );
        }
        return payload;
    }

    current() {
        return this.request("/tournaments/current");
    }

    create(input) {
        return this.request("/admin/tournaments", {
            method: "POST", body: input,
        });
    }

    apply(tournamentId) {
        return this.request("/tournaments/" + Number(tournamentId) + "/apply", {
            method: "POST",
        });
    }

    applications(tournamentId, status = "PENDING", {
        limit = 50, offset = 0, search = "",
    } = {}) {
        const query = new URLSearchParams({
            status,
            limit: String(Math.min(100, Math.max(1, Number(limit) || 50))),
            offset: String(Math.max(0, Number(offset) || 0)),
        });
        if (String(search).trim()) query.set("search", String(search).trim());
        return this.request(
            "/admin/tournaments/" + Number(tournamentId)
                + "/applications?" + query,
        );
    }

    decide(tournamentId, participantId, input) {
        return this.request(
            "/admin/tournaments/" + Number(tournamentId)
                + "/applications/" + Number(participantId) + "/decision",
            { method: "POST", body: input },
        );
    }

    schedule(tournamentId, input) {
        return this.request(
            "/admin/tournaments/" + Number(tournamentId) + "/matches",
            { method: "POST", body: input },
        );
    }

    reschedule(tournamentId, matchId, scheduledAt) {
        return this.request(
            "/admin/tournaments/" + Number(tournamentId)
                + "/matches/" + encodeURIComponent(matchId) + "/schedule",
            { method: "PATCH", body: { scheduled_at: scheduledAt } },
        );
    }

    result(tournamentId, matchId, input) {
        return this.request(
            "/admin/tournaments/" + Number(tournamentId)
                + "/matches/" + encodeURIComponent(matchId) + "/result",
            { method: "PUT", body: input },
        );
    }

    finalizeGroups(tournamentId) {
        return this.request(
            "/admin/tournaments/" + Number(tournamentId) + "/groups/finalize",
            { method: "POST" },
        );
    }

    start(tournamentId) {
        return this.request(
            "/admin/tournaments/" + Number(tournamentId) + "/start",
            { method: "POST" },
        );
    }

}

const tournamentAdminApi = new TournamentAdminClient();
