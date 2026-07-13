function jsonResponse(payload, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => payload,
    };
}

class ArenaSmokeBackend {
    constructor() {
        this.nextId = 1;
        this.matches = new Map();
        this.notifications = [];
        this.calls = [];
        this.transientReads = 0;
    }

    actor(initData) {
        if (initData === "creator-init") return "creator";
        if (initData === "opponent-init") return "opponent";
        return null;
    }

    matchPayload(match, actor) {
        return {
            id: match.id,
            game_type: match.gameType,
            creator_display_name: "Creator",
            opponent_display_name: match.opponent ? "Opponent" : "Raqib kutilmoqda",
            efc_amount: String(match.stake),
            total_pool: String(match.stake * 2),
            winner_reward: String(match.stake * 2),
            status: match.status,
            scheduled_at: match.scheduledAt,
            ready_window_started_at: match.readyWindowStartedAt,
            ready_deadline_at: match.readyDeadlineAt,
            creator_ready: match.creatorReady,
            opponent_ready: match.opponentReady,
            room_code: actor && match.roomCode ? match.roomCode : null,
            my_screenshot_uploaded: actor ? match.evidence[actor].screenshot : false,
            my_video_uploaded: actor ? match.evidence[actor].video : false,
        };
    }

    async fetch(url, options = {}) {
        const parsed = new URL(url);
        const method = options.method || "GET";
        const actor = this.actor(options.headers?.["X-Telegram-Init-Data"]);
        const body = options.body ? JSON.parse(options.body) : {};
        this.calls.push({ method, path: parsed.pathname, actor, body });
        if (!actor) return jsonResponse({ detail: "unauthorized" }, 401);
        if (method === "GET" && this.transientReads > 0) {
            this.transientReads -= 1;
            return jsonResponse({ detail: "temporary" }, 503);
        }

        if (method === "POST" && parsed.pathname === "/matches/") {
            const match = {
                id: this.nextId++,
                gameType: body.game_type,
                stake: Number(body.stake_efc),
                scheduledAt: body.scheduled_at,
                status: "WAITING_PLAYER",
                opponent: false,
                creatorReady: false,
                opponentReady: false,
                readyWindowStartedAt: null,
                readyDeadlineAt: null,
                roomCode: null,
                evidence: {
                    creator: { screenshot: false, video: false },
                    opponent: { screenshot: false, video: false },
                },
            };
            this.matches.set(match.id, match);
            return jsonResponse(this.matchPayload(match, actor));
        }

        const id = Number(parsed.pathname.match(/^\/matches\/(\d+)/)?.[1]);
        const match = this.matches.get(id);
        if (!match) return jsonResponse({ detail: "not found" }, 404);
        if (method === "GET" && parsed.pathname === `/matches/${id}`) {
            return jsonResponse(this.matchPayload(match, actor));
        }
        if (method === "POST" && parsed.pathname === `/matches/${id}/accept`) {
            match.opponent = true;
            match.status = "WAITING_READY";
            return jsonResponse(this.matchPayload(match, actor));
        }
        if (method === "POST" && parsed.pathname === `/matches/${id}/ready`) {
            match[`${actor}Ready`] = true;
            return jsonResponse(this.matchPayload(match, actor));
        }
        if (method === "POST" && parsed.pathname === `/matches/${id}/room-code`) {
            if (actor !== "creator" || match.status !== "ROOM_READY") {
                return jsonResponse({ detail: "conflict" }, 409);
            }
            match.roomCode = body.room_code;
            return jsonResponse(this.matchPayload(match, actor));
        }
        return jsonResponse({ detail: "not found" }, 404);
    }

    openReady(matchId) {
        const match = this.matches.get(matchId);
        match.status = "WAITING_READY";
        match.readyWindowStartedAt = "2030-01-01T11:55:00.000Z";
        match.readyDeadlineAt = "2030-01-01T12:00:00.000Z";
    }

    finishReady(matchId) {
        const match = this.matches.get(matchId);
        match.status = match.creatorReady && match.opponentReady ? "ROOM_READY" : "TECHNICAL_REVIEW";
    }

    startPlaying(matchId) {
        this.matches.get(matchId).status = "PLAYING";
    }

    botEvidence(matchId, actor, type) {
        const match = this.matches.get(matchId);
        match.evidence[actor][type] = true;
        const complete = Object.values(match.evidence).every(
            (evidence) => evidence.screenshot && evidence.video,
        );
        if (complete) match.status = "WAITING_ADMIN";
    }

    adminResolve(matchId, decision) {
        const match = this.matches.get(matchId);
        match.status = decision === "CANCEL" ? "CANCELLED" : "COMPLETED";
        this.notifications.push({ matchId, decision });
    }
}

module.exports = { ArenaSmokeBackend };
