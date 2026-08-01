class ArenaV3ClientError extends Error {
    constructor(message, status = 0) {
        super(message);
        this.name = "ArenaV3ClientError";
        this.status = status;
    }
}

class ArenaV3Client {
    constructor({
        baseUrl = typeof API_URL !== "undefined" ? API_URL : "",
        fetchImpl = (...args) => globalThis.fetch(...args),
        initDataProvider = () => globalThis.Telegram?.WebApp?.initData || "",
        xhrFactory = () => new XMLHttpRequest(),
    } = {}) {
        this.baseUrl = String(baseUrl).replace(/\/$/, "");
        this.fetchImpl = fetchImpl;
        this.initDataProvider = initDataProvider;
        this.xhrFactory = xhrFactory;
    }

    async request(path, { method = "GET", body = null, idempotencyKey = null } = {}) {
        const initData = this.initDataProvider();
        if (!initData) throw new ArenaV3ClientError("Telegram tasdiqlashi topilmadi.", 401);
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
        } catch (_) {
            throw new ArenaV3ClientError("Arena serveri bilan aloqa o‘rnatilmadi.");
        }
        let payload;
        try {
            payload = await response.json();
        } catch (_) {
            throw new ArenaV3ClientError("Arena serveridan noto‘g‘ri javob olindi.");
        }
        if (!response.ok) {
            const safeMessages = {
                400: "Kiritilgan ma’lumotlarni tekshiring.",
                401: "Telegram tasdiqlashi eskirgan.",
                403: "Bu amal uchun ruxsat yo‘q.",
                404: "Arena V3 hozircha ochilmagan.",
                409: "Match holati o‘zgargan. Yangilab qayta urining.",
                422: "Forma ma’lumotlari noto‘g‘ri.",
                500: "Arena serverida vaqtinchalik xatolik.",
                503: "Arena vaqtincha mavjud emas.",
            };
            throw new ArenaV3ClientError(
                safeMessages[response.status] || "Arena so‘rovi bajarilmadi.",
                response.status,
            );
        }
        return payload;
    }

    async open() {
        const payload = await this.request("/arena/open?limit=50&offset=0");
        return Array.isArray(payload?.matches) ? payload.matches.map(normalizeArenaV3Match) : [];
    }

    async active() {
        const payload = await this.request("/arena/active");
        if (!payload?.match) return null;
        const match = normalizeArenaV3Match(payload.match);
        return arenaV3IsActiveStatus(match.status) ? match : null;
    }

    async detail(matchId) {
        return normalizeArenaV3Match(await this.request(`/arena/${Number(matchId)}`));
    }

    async create(input) {
        return normalizeArenaV3Match(await this.request("/arena/create", {
            method: "POST",
            idempotencyKey: arenaV3Key("create"),
            body: {
                owner_efootball_username: input.username,
                stake_efc: input.stake,
                match_type: input.matchType,
                match_time_minutes: input.matchTime,
                extra_time_enabled: false,
                penalties_enabled: true,
                rules_accepted: true,
            },
        }));
    }

    async join(matchId, username) {
        return normalizeArenaV3Match(await this.request(`/arena/${Number(matchId)}/join`, {
            method: "POST",
            idempotencyKey: arenaV3Key(`join-${Number(matchId)}`),
            body: {
                opponent_efootball_username: username,
                rules_accepted: true,
            },
        }));
    }

    async ready(matchId) {
        return normalizeArenaV3Match(await this.request(`/arena/${Number(matchId)}/ready`, {
            method: "POST",
            body: {},
        }));
    }

    async submitRoomCode(matchId, roomCode) {
        const normalized = String(roomCode || "").trim();
        if (!normalized || normalized.length > 8) {
            throw new ArenaV3ClientError("Room Code 1–8 belgidan iborat bo‘lishi kerak.", 400);
        }
        return normalizeArenaV3Match(await this.request(`/arena/${Number(matchId)}/room-code`, {
            method: "POST",
            body: { room_code: normalized },
        }));
    }

    async cancel(matchId) {
        return normalizeArenaV3Match(await this.request(`/arena/${Number(matchId)}/cancel`, {
            method: "POST",
            idempotencyKey: arenaV3Key(`cancel-${Number(matchId)}`),
            body: { reason_code: "USER_CANCELLED" },
        }));
    }

    async screenshots(matchId) {
        const payload = await this.request(`/arena/${Number(matchId)}/screenshots`);
        return Array.isArray(payload?.screenshots) ? payload.screenshots.map(normalizeArenaV3Screenshot) : [];
    }

    async result(matchId) {
        return normalizeArenaV3Result(await this.request(`/arena/${Number(matchId)}/result`));
    }

    async confirmResult(matchId) {
        return this.request(`/arena/${Number(matchId)}/confirm-result`, {
            method: "POST",
            idempotencyKey: arenaV3Key(`confirm-result-${Number(matchId)}`),
        });
    }

    async profile() {
        return normalizeArenaV3Profile(await this.request("/arena/profile"));
    }

    async history({ limit = 20, offset = 0 } = {}) {
        const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20));
        const safeOffset = Math.max(0, Number(offset) || 0);
        const payload = await this.request(`/arena/history?limit=${safeLimit}&offset=${safeOffset}`);
        return Array.isArray(payload?.matches) ? payload.matches.map(normalizeArenaV3Match) : [];
    }

    async ranking(period = "all") {
        const normalized = String(period).toLowerCase();
        if (!["weekly", "monthly", "all"].includes(normalized)) {
            throw new ArenaV3ClientError("Daily ranking backend tomonidan qo‘llanmaydi.", 400);
        }
        const payload = await this.request(`/arena/ranking?period=${normalized}`);
        const rows = payload?.players || payload?.ranking || [];
        return Array.isArray(rows) ? rows.map(normalizeArenaV3RankingPlayer) : [];
    }

    uploadAppeal(matchId, file, reason, onProgress = () => {}) {
        if (!file || !String(file.type || "").startsWith("video/")) {
            return Promise.reject(new ArenaV3ClientError("Faqat video fayl yuborish mumkin.", 400));
        }
        if (!String(reason || "").trim()) {
            return Promise.reject(new ArenaV3ClientError("Appeal sababini yozing.", 400));
        }
        const initData = this.initDataProvider();
        if (!initData) return Promise.reject(new ArenaV3ClientError("Telegram tasdiqlashi topilmadi.", 401));
        return new Promise((resolve, reject) => {
            const xhr = this.xhrFactory();
            const query = new URLSearchParams({ reason: String(reason || "").trim() });
            xhr.open("POST", `${this.baseUrl}/arena/${Number(matchId)}/appeal?${query}`);
            xhr.setRequestHeader("X-Telegram-Init-Data", initData);
            xhr.setRequestHeader("Idempotency-Key", arenaV3Key(`appeal-${Number(matchId)}`));
            xhr.responseType = "json";
            xhr.upload.addEventListener("progress", (event) => {
                if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
            });
            xhr.addEventListener("load", () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    onProgress(100);
                    resolve(xhr.response || { status: "SUBMITTED" });
                } else {
                    reject(new ArenaV3ClientError(arenaV3HttpMessage(xhr.status), xhr.status));
                }
            });
            xhr.addEventListener("error", () =>
                reject(new ArenaV3ClientError("Appeal yuklashda tarmoq xatosi.")));
            const form = new FormData();
            form.append("video", file, file.name);
            xhr.send(form);
        });
    }

    uploadScreenshot(matchId, file, onProgress = () => {}) {
        if (!file || !["image/png", "image/jpeg"].includes(file.type)) {
            return Promise.reject(new ArenaV3ClientError("Faqat PNG yoki JPEG yuborish mumkin.", 400));
        }
        if (Number(file.size) > 5 * 1024 * 1024) {
            return Promise.reject(new ArenaV3ClientError(
                "413 Payload Too Large: Screenshot hajmi 5 MB dan oshmasligi kerak.",
                413,
            ));
        }
        const initData = this.initDataProvider();
        if (!initData) return Promise.reject(new ArenaV3ClientError("Telegram tasdiqlashi topilmadi.", 401));
        return new Promise((resolve, reject) => {
            const xhr = this.xhrFactory();
            xhr.open("POST", `${this.baseUrl}/arena/${Number(matchId)}/upload-screenshot`);
            xhr.setRequestHeader("X-Telegram-Init-Data", initData);
            xhr.setRequestHeader("Idempotency-Key", arenaV3Key(`screenshot-${Number(matchId)}`));
            xhr.responseType = "json";
            xhr.timeout = 120000;
            xhr.upload.addEventListener("progress", (event) => {
                if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
            });
            xhr.addEventListener("load", () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    onProgress(100);
                    resolve(normalizeArenaV3Screenshot(xhr.response));
                } else {
                    reject(arenaV3UploadError(xhr));
                }
            });
            xhr.addEventListener("error", () =>
                reject(arenaV3UploadError(xhr)));
            xhr.addEventListener("timeout", () => reject(new ArenaV3ClientError(
                "Upload timeout: server 120 soniyada javob bermadi.",
                408,
            )));
            xhr.addEventListener("abort", () => reject(new ArenaV3ClientError(
                "Screenshot yuklash bekor qilindi.",
                0,
            )));
            const form = new FormData();
            form.append("file", file, file.name);
            xhr.send(form);
        });
    }
}

function arenaV3UploadError(xhr) {
    const status = Number(xhr?.status) || 0;
    let detail = "";
    if (typeof xhr?.response?.detail === "string") {
        detail = xhr.response.detail.trim();
    } else {
        try {
            const parsed = JSON.parse(xhr?.responseText || "{}");
            if (typeof parsed?.detail === "string") detail = parsed.detail.trim();
        } catch (_) {
            // Non-JSON proxy responses are represented by their HTTP status.
        }
    }
    if (status === 0) {
        return new ArenaV3ClientError(
            "HTTP status 0: server javobi olinmadi. Internet, CORS yoki reverse proxy ulanishi uzilgan.",
            0,
        );
    }
    const labels = {
        400: "Bad Request",
        401: "Unauthorized",
        403: "Forbidden",
        404: "Not Found",
        408: "Request Timeout",
        409: "Conflict",
        413: "Payload Too Large",
        422: "Unprocessable Content",
        500: "Internal Server Error",
        502: "Bad Gateway",
        503: "Service Unavailable",
        504: "Gateway Timeout",
    };
    const prefix = `${status} ${labels[status] || "HTTP Error"}`;
    return new ArenaV3ClientError(
        `${prefix}: ${detail || arenaV3HttpMessage(status)}`,
        status,
    );
}

function arenaV3HttpMessage(status) {
    const messages = {
        400: "Screenshot formati noto‘g‘ri.",
        401: "Telegram tasdiqlashi eskirgan.",
        403: "Screenshot yuborishga ruxsat yo‘q.",
        404: "Arena match topilmadi.",
        409: "Screenshot oynasi yopilgan yoki fayl avval yuborilgan.",
        413: "Screenshot hajmi juda katta.",
        422: "Screenshot tekshiruvdan o‘tmadi.",
        500: "Arena serverida vaqtinchalik xatolik.",
        502: "Screenshot saqlash xizmati ishlamayapti.",
        503: "Screenshot xizmati vaqtincha mavjud emas.",
    };
    return messages[status] || "Screenshot yuklanmadi.";
}

function normalizeArenaV3Screenshot(value) {
    if (!value || !Number.isInteger(value.id) || !Number.isInteger(value.player_id)) {
        throw new ArenaV3ClientError("Screenshot javobi noto‘g‘ri.");
    }
    return {
        id: value.id,
        playerId: value.player_id,
        mimeType: value.mime_type,
        fileSize: value.file_size,
        width: value.width,
        height: value.height,
        validationStatus: value.validation_status,
        uploadedAt: value.uploaded_at,
    };
}

function normalizeArenaV3Result(value) {
    if (!value?.match) throw new ArenaV3ClientError("Arena result javobi noto‘g‘ri.");
    return { match: normalizeArenaV3Match(value.match) };
}

function normalizeArenaV3Profile(value) {
    if (!value || !Number.isInteger(value.player_id)) {
        throw new ArenaV3ClientError("Arena profile javobi noto‘g‘ri.");
    }
    return {
        playerId: value.player_id,
        totalMatches: Number(value.total_matches) || 0,
        wins: Number(value.wins) || 0,
        losses: Number(value.losses) || 0,
        goalsFor: Number(value.goals_for) || 0,
        goalsAgainst: Number(value.goals_against) || 0,
        winRate: Number(value.win_rate) || 0,
        currentStreak: Number(value.current_streak) || 0,
        bestStreak: Number(value.best_streak) || 0,
        totalEfcWon: Number(value.total_efc_won) || 0,
        totalEfcLost: Number(value.total_efc_lost) || 0,
        lockedRewardsEfc: Number(value.locked_rewards_efc) || 0,
        pendingAppeals: Number(value.pending_appeals) || 0,
    };
}

function normalizeArenaV3RankingPlayer(value, index) {
    return {
        playerId: Number(value?.player_id) || 0,
        rank: Number(value?.rank) || index + 1,
        username: value?.username || value?.display_name || "O‘yinchi",
        avatar: value?.avatar_url || null,
        totalMatches: Number(value?.total_matches) || 0,
        wins: Number(value?.wins) || 0,
        losses: Number(value?.losses) || 0,
        goalsFor: Number(value?.goals_for) || 0,
        totalEfcWon: Number(value?.total_efc_won) || 0,
        winRate: Number(value?.win_rate) || 0,
    };
}

function normalizeArenaV3Match(value) {
    if (!value || !Number.isInteger(value.id) || typeof value.status !== "string") {
        throw new ArenaV3ClientError("Arena match javobi noto‘g‘ri.");
    }
    return {
        id: value.id,
        publicId: value.public_id || `#${value.id}`,
        ownerId: value.owner_id,
        opponentId: value.opponent_id ?? null,
        ownerUsername: value.owner_efootball_username || "O‘yinchi",
        opponentUsername: value.opponent_efootball_username || null,
        stake: String(value.stake_efc ?? "0"),
        totalPool: String(value.total_pool_efc ?? "0"),
        commission: String(value.commission_efc ?? "0"),
        winnerReward: String(value.winner_reward_efc ?? "0"),
        matchType: value.match_type || "STANDARD",
        matchTime: Number(value.match_time_minutes) || 10,
        status: value.status,
        ownerReadyAt: value.owner_ready_at || null,
        opponentReadyAt: value.opponent_ready_at || null,
        roomCode: value.room_code || null,
        roomCodeCreatedAt: value.room_code_created_at || null,
        playingStartedAt: value.playing_started_at || null,
        winnerId: value.winner_id ?? null,
        loserId: value.loser_id ?? null,
        ownerScore: value.owner_score ?? null,
        opponentScore: value.opponent_score ?? null,
        resultSource: value.result_source || null,
        settlementStatus: value.settlement_status || null,
        settledAt: value.settled_at || null,
        finishedAt: value.finished_at || null,
        appealDeadlineAt: value.appeal_deadline_at || null,
        hasAppeal: Boolean(value.has_appeal),
        rewardHoldStatus: value.reward_hold_status || "NONE",
        currentResultType: value.current_result_type || null,
        rewardReleaseAt: value.reward_release_at || null,
        ownerResultConfirmedAt: value.owner_result_confirmed_at || null,
        opponentResultConfirmedAt: value.opponent_result_confirmed_at || null,
        createdAt: value.created_at || null,
        updatedAt: value.updated_at || null,
    };
}

function arenaV3Key(scope) {
    const random = globalThis.crypto?.randomUUID?.()
        || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `arena-v3-${scope}-${random}`;
}

function arenaV3Escape(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

const ARENA_V3_TIMELINE = Object.freeze([
    ["OPEN", "Match yaratildi"],
    ["READY", "Raqib topildi"],
    ["PLAYING", "O‘yin boshlandi"],
    ["WAITING_SCREENSHOT", "Screenshot yuboring"],
    ["WAITING_ADMIN", "Admin tekshirmoqda"],
    ["FINISHED", "Natija"],
]);

const ARENA_V3_ACTIVE_STATUSES = new Set([
    "OPEN", "READY", "WAITING_ROOM_CODE", "PLAYING",
    "WAITING_SCREENSHOT", "WAITING_ADMIN",
]);

function arenaV3IsActiveStatus(status) {
    return ARENA_V3_ACTIVE_STATUSES.has(String(status || ""));
}

const arenaV3State = {
    view: "home",
    openMatches: [],
    activeMatch: null,
    selectedMatch: null,
    screenshots: [],
    result: null,
    screenshotFile: null,
    screenshotPreview: null,
    uploadProgress: 0,
    evidenceError: null,
    loading: false,
    actionLoading: null,
    refreshTimer: null,
    clockTimer: null,
    touchStart: 0,
    profile: null,
    history: [],
    historyResults: {},
    historyOffset: 0,
    historyHasMore: true,
    ranking: [],
    rankingPeriod: "all",
    sectionLoading: false,
    sectionError: null,
    appealFile: null,
    appealProgress: 0,
    appealStatus: null,
    appealReason: "",
    appealOpen: false,
};

const arenaV3Client = new ArenaV3Client();

function arenaV3TelegramUser() {
    return globalThis.Telegram?.WebApp?.initDataUnsafe?.user || {};
}

function arenaV3ScreenshotAccepted(screenshots, playerId) {
    const id = Number(playerId);
    return id > 0 && Array.isArray(screenshots)
        && screenshots.some((item) => item.playerId === id);
}

function arenaV3Initial(value) {
    return Array.from(String(value || "L").trim())[0]?.toLocaleUpperCase("uz-UZ") || "L";
}

function arenaV3Date(value) {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) return "Hozirgina";
    const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
    if (seconds < 60) return "Hozirgina";
    if (seconds < 3600) return `${Math.floor(seconds / 60)} daqiqa oldin`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} soat oldin`;
    return date.toLocaleDateString("uz-UZ", { day: "2-digit", month: "short" });
}

function arenaV3FullDate(value) {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString("uz-UZ", {
        day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
}

function arenaV3Track(name, properties = {}) {
    try {
        if (typeof globalThis.analytics?.track === "function") globalThis.analytics.track(name, properties);
        else if (typeof globalThis.gtag === "function") globalThis.gtag("event", name, properties);
    } catch (_) {}
}

function arenaV3Skeleton(count = 3) {
    return `<div class="arena-v3x-skeleton" role="status" aria-label="Arena yuklanmoqda">
        ${Array.from({ length: count }, () => `<article><i></i><section><b></b><span></span></section><em></em></article>`).join("")}
    </div>`;
}

function arenaV3Toast(message, type = "success") {
    const page = document.getElementById("arenaPage");
    if (!page) return;
    page.querySelector(".arena-v3x-toast")?.remove();
    const toast = document.createElement("div");
    toast.className = `arena-v3x-toast is-${type}`;
    toast.setAttribute("role", "status");
    toast.textContent = message;
    page.appendChild(toast);
    setTimeout(() => toast.classList.add("is-visible"), 20);
    setTimeout(() => {
        toast.classList.remove("is-visible");
        setTimeout(() => toast.remove(), 220);
    }, 2600);
}

function arenaV3HomeCards() {
    const cards = [
        ["open", "⚔", "Open Matches", `${arenaV3State.openMatches.length} ta ochiq match`, true],
        ["create", "＋", "Create Match", "Yangi Arena ochish", true],
        ["active", "◉", "My Active Match", arenaV3State.activeMatch ? "Davom ettirish" : "Faol match yo‘q", true],
        ["history", "↺", "History", "Match natijalari", true],
        ["ranking", "♛", "Ranking", "Top o‘yinchilar", true],
        ["profile", "◇", "Profile", "Statistika", true],
    ];
    return `<section class="arena-v3x-menu" aria-label="Arena bo‘limlari">${cards.map(([view, icon, title, text, enabled]) =>
        `<button type="button" data-arena-v3-view="${view}" ${enabled ? "" : "disabled"} aria-disabled="${!enabled}">
            <span>${icon}</span><section><strong>${title}</strong><small>${text}</small></section><i>›</i>
        </button>`).join("")}</section>`;
}

function arenaV3Hero() {
    const user = arenaV3TelegramUser();
    const name = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || "O‘yinchi";
    return `<header class="arena-v3x-hero">
        <div class="arena-v3x-brand"><span>LEVEL</span><b>ARENA</b><i>V4</i></div>
        <section><small>WELCOME TO THE NEXT LEVEL</small><h2>Battle. Prove. Win.</h2>
            <p>eFootball 1v1 — admin tomonidan tekshirilgan xavfsiz natija.</p></section>
        <footer><span class="arena-v3x-user-avatar">${arenaV3Initial(name)}</span>
            <div><small>PLAYER</small><strong>${arenaV3Escape(name)}</strong></div>
            <i class="arena-v3x-live-dot"></i><b>ONLINE</b></footer>
    </header>`;
}

function arenaV3Shell(content) {
    return `<div class="arena-v3x">
        ${arenaV3Hero()}
        <div class="arena-v3x-pull" aria-hidden="true"><span>↓</span><small>Yangilash uchun torting</small></div>
        ${content}
    </div>`;
}

function arenaV3MatchCard(match) {
    return `<article class="arena-v3x-match" data-arena-v3-match="${match.id}">
        <header><span class="arena-v3x-avatar">${arenaV3Initial(match.ownerUsername)}</span>
            <section><small>CREATOR</small><strong>${arenaV3Escape(match.ownerUsername)}</strong>
                <em>${arenaV3Escape(arenaV3Date(match.createdAt))}</em></section>
            <b>${arenaV3Escape(match.stake)} <small>EFC</small></b></header>
        <div><span><i>◆</i>${arenaV3Escape(match.matchType)}</span>
            <span><i>◷</i>${match.matchTime} min</span>
            <span><i>●</i>OPEN</span></div>
        <button type="button" data-arena-v3-detail="${match.id}">Match Detail <i>→</i></button>
    </article>`;
}

function arenaV3OpenView() {
    return `<section class="arena-v3x-panel">
        <header><button type="button" data-arena-v3-back>‹</button>
            <section><small>LIVE LOBBY</small><h3>Open Matches</h3></section>
            <button class="arena-v3x-refresh" type="button" data-arena-v3-refresh aria-label="Yangilash">↻</button></header>
        <div class="arena-v3x-list">${arenaV3State.openMatches.length
            ? arenaV3State.openMatches.map(arenaV3MatchCard).join("")
            : `<div class="arena-v3x-empty"><span>⚔</span><h4>Ochiq match yo‘q</h4>
                <p>Birinchi matchni siz yarating.</p><button data-arena-v3-view="create">Match yaratish</button></div>`}</div>
    </section>`;
}

function arenaV3StoredUsername() {
    const telegramId = Number(arenaV3TelegramUser()?.id);
    if (!Number.isInteger(telegramId) || telegramId <= 0) return "";
    try {
        return globalThis.localStorage?.getItem(
            `arena-v3-efootball-username:${telegramId}`
        ) || "";
    } catch (_) {
        return "";
    }
}

function arenaV3SaveUsername(username) {
    const telegramId = Number(arenaV3TelegramUser()?.id);
    if (!Number.isInteger(telegramId) || telegramId <= 0) return;
    try {
        globalThis.localStorage?.setItem(
            `arena-v3-efootball-username:${telegramId}`,
            username
        );
    } catch (_) {
        // Storage can be unavailable in restricted Telegram WebViews.
    }
}

function arenaV3CreateView() {
    return `<section class="arena-v3x-panel arena-v3x-create">
        <header><button type="button" data-arena-v3-back>‹</button>
            <section><small>NEW BATTLE</small><h3>Create Match</h3></section><span></span></header>
        <form id="arenaV3CreateForm">
            <label><span>eFootball username</span>
                <input name="username" maxlength="64" required autocomplete="off"
                    value="${arenaV3Escape(arenaV3StoredUsername())}" placeholder="Masalan: ASILBEK_FC"></label>
            <fieldset><legend>Stake</legend><div class="arena-v3x-choice" data-choice="stake">
                ${[100, 500, 1000, 5000].map((value, index) =>
                    `<button type="button" class="${index === 0 ? "is-selected" : ""}" data-value="${value}">${value}<small>EFC</small></button>`).join("")}
            </div></fieldset>
            <fieldset><legend>Match type</legend><div class="arena-v3x-choice" data-choice="type">
                <button type="button" class="is-selected" data-value="STANDARD">Standard<small>1 VS 1</small></button>
            </div></fieldset>
            <fieldset><legend>Match time</legend><div class="arena-v3x-choice arena-v3x-time" data-choice="time">
                ${[6, 8, 10, 12, 15].map((value) =>
                    `<button type="button" class="${value === 10 ? "is-selected" : ""}" data-value="${value}">${value}<small>MIN</small></button>`).join("")}
            </div></fieldset>
            <div class="arena-v3x-rules"><span>✓</span><p>Extra time o‘chiq. Penalties yoqilgan. Arena qoidalarini qabul qilaman.</p></div>
            <button class="arena-v3x-primary" type="submit">Create Match <i>→</i></button>
        </form>
    </section>`;
}

function arenaV3StatusIndex(status) {
    if (status === "CANCELLED") return -1;
    const visibleStatus = status === "WAITING_ROOM_CODE" ? "READY" : status;
    return ARENA_V3_TIMELINE.findIndex(([key]) => key === visibleStatus);
}

function arenaV3IsOwner(match) {
    return String(arenaV3TelegramUser().id || "") === String(match?.ownerId || "");
}

function arenaV3MatchDetailView() {
    const match = arenaV3State.selectedMatch;
    if (!match) return arenaV3Skeleton(1);
    return `<section class="arena-v3x-panel arena-v3x-detail">
        <header><button type="button" data-arena-v3-back-open>‹</button>
            <section><small>MATCH DETAIL</small><h3>${arenaV3Escape(match.publicId)}</h3></section>
            <b class="arena-v3x-status">${arenaV3Escape(match.status)}</b></header>
        <article class="arena-v3x-detail-card">
            <span class="arena-v3x-avatar arena-v3x-avatar--large">${arenaV3Initial(match.ownerUsername)}</span>
            <small>CREATOR</small><h3>${arenaV3Escape(match.ownerUsername)}</h3>
            <div><span>Stake<b>${arenaV3Escape(match.stake)} EFC</b></span>
                <span>Match Type<b>${arenaV3Escape(match.matchType)}</b></span>
                <span>Match Time<b>${match.matchTime} MIN</b></span>
                <span>Created<b>${arenaV3Escape(arenaV3Date(match.createdAt))}</b></span></div>
            <button class="arena-v3x-primary" type="button" data-arena-v3-join="${match.id}">
                Join Match <i>→</i></button>
        </article></section>`;
}

function arenaV3PlayingClock(match) {
    const started = new Date(match.playingStartedAt);
    if (!match.playingStartedAt || Number.isNaN(started.getTime())) return "00:00";
    const endsAt = started.getTime() + (match.matchTime * 60000);
    const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
    return `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;
}

function arenaV3ScreenshotSeconds(match, now = Date.now()) {
    const started = new Date(match?.playingStartedAt).getTime();
    if (!Number.isFinite(started)) return 0;
    const screenshotStartsAt = started + (match.matchTime * 60000);
    return Math.max(0, Math.ceil((screenshotStartsAt + 600000 - now) / 1000));
}

function arenaV3EvidenceState(match) {
    const ownId = Number(arenaV3TelegramUser().id);
    const own = arenaV3State.screenshots.some((item) => item.playerId === ownId);
    const opponentId = arenaV3IsOwner(match) ? match.opponentId : match.ownerId;
    const opponent = arenaV3State.screenshots.some((item) => item.playerId === Number(opponentId));
    return { own, opponent, count: Number(own) + Number(opponent) };
}

function arenaV3ScreenshotPanel(match) {
    const evidence = arenaV3EvidenceState(match);
    const seconds = arenaV3ScreenshotSeconds(match);
    const preview = arenaV3State.screenshotPreview
        ? `<img src="${arenaV3Escape(arenaV3State.screenshotPreview)}" alt="Screenshot preview">`
        : `<span class="arena-v3x-upload-icon">▧</span>`;
    return `<section class="arena-v3x-stage-card arena-v3x-evidence">
        <small>SCREENSHOT EVIDENCE</small><h3>Match History yuboring</h3>
        <div class="arena-v3x-countdown ${seconds <= 10 ? "is-urgent" : ""}">
            <b data-arena-v3-countdown>${seconds}</b><span>SONIYA</span></div>
        <div class="arena-v3x-upload-status">
            <span class="${evidence.own ? "is-uploaded" : ""}"><i>${evidence.own ? "✓" : "1"}</i>
                <b>Player</b><small>${evidence.own ? "Uploaded" : "Waiting"}</small></span>
            <span class="${evidence.opponent ? "is-uploaded" : ""}"><i>${evidence.opponent ? "✓" : "2"}</i>
                <b>Opponent</b><small>${evidence.opponent ? "Uploaded" : "Waiting"}</small></span></div>
        <div class="arena-v3x-evidence-progress"><i style="width:${evidence.count * 50}%"></i></div>
        ${evidence.own ? `<p class="arena-v3x-uploaded-note">✓ Screenshot muvaffaqiyatli yuborildi</p>` :
            `<label class="arena-v3x-file-picker">${preview}
                <span>${arenaV3State.screenshotFile ? arenaV3Escape(arenaV3State.screenshotFile.name) : "PNG yoki JPEG tanlang"}</span>
                <input type="file" accept="image/png,image/jpeg" data-arena-v3-file></label>
            ${arenaV3State.evidenceError ? `<p class="arena-v3x-inline-error">${arenaV3Escape(arenaV3State.evidenceError)}</p>` : ""}
            <button class="arena-v3x-primary" data-arena-v3-upload
                ${!arenaV3State.screenshotFile || seconds <= 0 ? "disabled" : ""}>Upload Screenshot</button>
            <div class="arena-v3x-upload-progress" aria-label="Upload progress">
                <i style="width:${arenaV3State.uploadProgress}%"></i><span>${arenaV3State.uploadProgress}%</span></div>`}
    </section>`;
}

function arenaV3AdminReviewPanel() {
    return `<section class="arena-v3x-stage-card arena-v3x-admin-review">
        <span class="arena-v3x-shield">🛡</span><small>ADMIN REVIEW</small>
        <h3>Admin tekshirmoqda</h3>
        <p>Screenshotlar qabul qilindi. Yakuniy hisob admin tomonidan tekshiriladi.</p>
        <i class="arena-v3x-spinner"></i></section>`;
}

function arenaV3RewardSeconds(match, now = Date.now()) {
    const deadline = new Date(match?.rewardReleaseAt).getTime();
    return Number.isFinite(deadline) ? Math.max(0, Math.ceil((deadline - now) / 1000)) : 0;
}

function arenaV3RewardClock(match) {
    const seconds = arenaV3RewardSeconds(match);
    return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function arenaV3CanAppeal(match) {
    const deadline = new Date(match?.appealDeadlineAt).getTime();
    const ownConfirmed = arenaV3IsOwner(match)
        ? match.ownerResultConfirmedAt : match.opponentResultConfirmedAt;
    return match.status === "FINISHED" && !match.hasAppeal && !ownConfirmed
        && Number.isFinite(deadline) && deadline > Date.now();
}

function arenaV3AppealForm(match) {
    if (!arenaV3CanAppeal(match) || !arenaV3State.appealOpen) return "";
    return `<section class="arena-v3x-appeal-form"><h4>Norozilik bildirish</h4>
        <p>Video va sabab majburiy. Muddati tugagach appeal yopiladi.</p>
        <textarea data-arena-v3-appeal-reason maxlength="500" placeholder="Sababni yozing">${arenaV3Escape(arenaV3State.appealReason)}</textarea>
        <label class="arena-v3x-file-picker"><span class="arena-v3x-upload-icon">▶</span>
            <span>${arenaV3State.appealFile ? arenaV3Escape(arenaV3State.appealFile.name) : "Video tanlang"}</span>
            <input type="file" accept="video/*" data-arena-v3-appeal-file></label>
        <button class="arena-v3x-primary" data-arena-v3-appeal-upload
            ${!arenaV3State.appealFile || !arenaV3State.appealReason.trim() ? "disabled" : ""}>Yuborish</button></section>`;
}

function arenaV3ResultPanel(match) {
    const ownId = Number(arenaV3TelegramUser().id);
    const cancelled = match.currentResultType === "CANCEL";
    const ownWon = Number(match.winnerId) === ownId;
    const winner = cancelled ? "Cancel" : Number(match.winnerId) === Number(match.ownerId)
        ? match.ownerUsername : match.opponentUsername;
    const title = cancelled ? "Match bekor qilindi"
        : ownWon ? "Siz g‘olib bo‘ldingiz" : "Siz yutqazdingiz";
    const ownConfirmed = arenaV3IsOwner(match)
        ? match.ownerResultConfirmedAt : match.opponentResultConfirmedAt;
    const bothConfirmed = match.ownerResultConfirmedAt && match.opponentResultConfirmedAt;
    const locked = match.rewardHoldStatus === "LOCKED";
    return `<section class="arena-v3x-stage-card arena-v3x-result">
        <div class="arena-v3x-result-crown">♛</div><small>YAKUNIY NATIJA</small>
        <h3>${arenaV3Escape(title)}</h3><p>${arenaV3Escape(winner || "—")}</p>
        <div class="arena-v3x-admin-badge"><span>🛡</span><b>Admin tomonidan tekshirildi</b></div>
        <div><span>Hisob<b>${arenaV3Escape(`${match.ownerScore ?? "—"} : ${match.opponentScore ?? "—"}`)}</b></span>
            <span>Reward<b>${arenaV3Escape(ownWon ? match.winnerReward : cancelled ? match.stake : "0")} EFC</b></span>
            <span>Platform fee<b>${arenaV3Escape(match.commission)} EFC</b></span>
            <span>Status<b>${arenaV3Escape(match.rewardHoldStatus)}</b></span></div>
        ${locked ? `<div class="arena-v3x-reward-lock"><span>🔒</span><section><small>MUKOFOT VAQTINCHA BLOKLANGAN</small>
            <b data-arena-v3-reward-clock>${arenaV3RewardClock(match)}</b><p>${ownWon || cancelled
                ? "Mukofot norozilik muddati tugaguncha bloklangan"
                : "Natijani tasdiqlash muddati"}</p></section></div>` : ""}
        ${locked && !ownConfirmed ? `<section class="arena-v3x-confirm-question"><h4>Natija to‘g‘rimi?</h4>
            <button class="arena-v3x-primary" data-arena-v3-confirm-result>✅ Ha, natija to‘g‘ri</button>
            <button class="arena-v3x-secondary" data-arena-v3-reject-result>❌ Yo‘q, natija noto‘g‘ri</button></section>
            <p class="arena-v3x-confirm-warning">Ikkala o‘yinchi tasdiqlagach reward darhol ochiladi. Javob bo‘lmasa 30 daqiqada avtomatik ochiladi.</p>` : ""}
        ${ownConfirmed && !bothConfirmed ? `<p class="arena-v3x-uploaded-note">✓ Siz tasdiqladingiz · Raqib kutilmoqda</p>` : ""}
        ${bothConfirmed ? `<p class="arena-v3x-uploaded-note">✓ Ikkala o‘yinchi tasdiqladi</p>` : ""}
        ${match.hasAppeal ? `<p class="arena-v3x-uploaded-note">⚠ Appeal admin ko‘rib chiqishida</p>` : arenaV3AppealForm(match)}
        <button class="arena-v3x-secondary" data-arena-v3-continue>Davom etish</button></section>`;
}

function arenaV3PanelHeader(kicker, title) {
    return `<header><button type="button" data-arena-v3-back>‹</button>
        <section><small>${kicker}</small><h3>${title}</h3></section>
        <button class="arena-v3x-refresh" type="button" data-arena-v3-section-retry aria-label="Yangilash">↻</button></header>`;
}

function arenaV3Avatar(name, url) {
    const safeUrl = /^https:\/\//.test(String(url || "")) ? url : "";
    return safeUrl
        ? `<img class="arena-v3x-profile-avatar" src="${arenaV3Escape(safeUrl)}" alt="">`
        : `<span class="arena-v3x-profile-avatar">${arenaV3Initial(name)}</span>`;
}

function arenaV3ProfileView() {
    if (arenaV3State.sectionLoading) return `<section class="arena-v3x-panel">${arenaV3PanelHeader("PLAYER", "Arena Profile")}${arenaV3Skeleton(4)}</section>`;
    if (arenaV3State.sectionError) return arenaV3SectionError("Profile", arenaV3State.sectionError);
    const profile = arenaV3State.profile;
    if (!profile) return arenaV3Skeleton(3);
    const user = arenaV3TelegramUser();
    const name = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || "O‘yinchi";
    const stats = [
        ["Total Matches", profile.totalMatches], ["Wins", profile.wins], ["Losses", profile.losses],
        ["Win Rate", `${profile.winRate}%`], ["Goals For", profile.goalsFor],
        ["Goals Against", profile.goalsAgainst], ["Current Streak", profile.currentStreak],
        ["Best Streak", profile.bestStreak], ["Total EFC Won", profile.totalEfcWon],
        ["Total EFC Lost", profile.totalEfcLost],
    ];
    return `<section class="arena-v3x-panel arena-v3x-profile">${arenaV3PanelHeader("PLAYER", "Arena Profile")}
        <article class="arena-v3x-profile-identity">${arenaV3Avatar(name, user.photo_url)}
            <div><small>DISPLAY NAME</small><h3>${arenaV3Escape(name)}</h3>
                <p>@${arenaV3Escape(user.username || "telegram")}</p></div></article>
        <article class="arena-v3x-username"><span>eFootball username</span>
            <strong>${arenaV3Escape(arenaV3StoredUsername() || "Kiritilmagan")}</strong>
            <small>Backend tahrirlash endpointi mavjud bo‘lganda edit ochiladi.</small></article>
        <div class="arena-v3x-v4-summary">
            <article><span>🔒</span><small>Locked Rewards</small><b>${arenaV3Escape(profile.lockedRewardsEfc)} EFC</b></article>
            <article><span>⚠</span><small>Pending Appeal</small><b>${arenaV3Escape(profile.pendingAppeals)}</b></article>
        </div>
        <div class="arena-v3x-stats">${stats.map(([label, value]) =>
            `<article><small>${label}</small><b data-arena-v3-counter="${arenaV3Escape(value)}">${arenaV3Escape(value)}</b></article>`).join("")}</div>
    </section>`;
}

function arenaV3HistoryCard(match) {
    const ownId = Number(arenaV3TelegramUser().id);
    const owner = ownId === Number(match.ownerId);
    const opponent = owner ? match.opponentUsername : match.ownerUsername;
    const winner = match.currentResultType === "CANCEL" ? "Cancel"
        : Number(match.winnerId) === Number(match.ownerId) ? match.ownerUsername : match.opponentUsername;
    const score = match.ownerScore != null && match.opponentScore != null
        ? `${match.ownerScore} : ${match.opponentScore}` : "—";
    const ownWon = Number(match.winnerId) === ownId;
    const reward = ownWon ? match.winnerReward
        : match.currentResultType === "CANCEL" ? match.stake : "0";
    return `<article class="arena-v3x-history-card">
        <i class="arena-v3x-history-dot"></i><header><span class="arena-v3x-avatar">${arenaV3Initial(opponent)}</span>
            <section><small>OPPONENT</small><strong>${arenaV3Escape(opponent || "O‘yinchi")}</strong>
                <em>${arenaV3Escape(arenaV3FullDate(match.finishedAt || match.updatedAt))}</em></section>
            <b>${arenaV3Escape(score)}</b></header>
        <div><span>Winner<b>${arenaV3Escape(winner || "—")}</b></span>
            <span>Reward<b>${arenaV3Escape(reward)} EFC</b></span>
            <span>Fee<b>${arenaV3Escape(match.commission)} EFC</b></span>
            <span>Appeal<b>${match.hasAppeal ? "Pending" : arenaV3CanAppeal(match) ? "Available" : "Closed"}</b></span></div>
        <footer><b>🛡 ADMIN VERIFIED</b><button data-arena-v3-history-result="${match.id}">Natijani ko‘rish</button></footer>
    </article>`;
}

function arenaV3HistoryView() {
    if (arenaV3State.sectionLoading && !arenaV3State.history.length) {
        return `<section class="arena-v3x-panel">${arenaV3PanelHeader("TIMELINE", "Match History")}${arenaV3Skeleton(4)}</section>`;
    }
    if (arenaV3State.sectionError && !arenaV3State.history.length) return arenaV3SectionError("Match History", arenaV3State.sectionError);
    return `<section class="arena-v3x-panel arena-v3x-history">${arenaV3PanelHeader("TIMELINE", "Match History")}
        <div class="arena-v3x-history-list">${arenaV3State.history.length
            ? arenaV3State.history.map(arenaV3HistoryCard).join("")
            : `<div class="arena-v3x-empty"><span>↺</span><h4>History bo‘sh</h4><p>Yakunlangan matchlar shu yerda chiqadi.</p></div>`}</div>
        ${arenaV3State.historyHasMore ? `<button class="arena-v3x-load-more" data-arena-v3-history-more
            ${arenaV3State.sectionLoading ? "disabled" : ""}>${arenaV3State.sectionLoading ? "Yuklanmoqda…" : "Ko‘proq yuklash"}</button>
            <i data-arena-v3-history-sentinel></i>` : ""}
    </section>`;
}

function arenaV3RankingView() {
    const filters = [["daily", "Daily"], ["weekly", "Weekly"], ["monthly", "Monthly"], ["all", "All Time"]];
    return `<section class="arena-v3x-panel arena-v3x-ranking">${arenaV3PanelHeader("LEADERBOARD", "Top Players")}
        <div class="arena-v3x-rank-filters">${filters.map(([key, label]) =>
            `<button data-arena-v3-period="${key}" class="${arenaV3State.rankingPeriod === key ? "is-active" : ""}"
                ${key === "daily" ? `disabled title="Backend daily periodni qo‘llamaydi"` : ""}>${label}</button>`).join("")}</div>
        ${arenaV3State.sectionLoading ? arenaV3Skeleton(3) : arenaV3State.sectionError
            ? `<div class="arena-v3x-error"><span>UNAVAILABLE</span><h3>Ranking hozircha ochilmagan</h3>
                <p>${arenaV3Escape(arenaV3State.sectionError)}</p><button data-arena-v3-section-retry>Retry</button></div>`
            : `<div class="arena-v3x-rank-table">
                ${arenaV3State.ranking.map((row) => `<article>
                    <b class="arena-v3x-rank-position">#${row.rank}</b>
                    ${arenaV3Avatar(row.username, row.avatar)}
                    <section><strong>${arenaV3Escape(row.username)}</strong>
                        <small>${row.winRate}% g‘alaba</small></section>
                    <div class="arena-v3x-rank-metrics">
                        <span><small>O‘yin</small><b>${row.totalMatches}</b></span>
                        <span><small>G‘alaba</small><b>${row.wins}</b></span>
                        <span><small>Mag‘lubiyat</small><b>${row.losses}</b></span>
                        <span><small>Gollar</small><b>${row.goalsFor}</b></span>
                        <span class="is-efc"><small>Yutilgan EFC</small><b>${arenaV3Escape(row.totalEfcWon)} EFC</b></span>
                    </div>
                </article>`).join("")}</div>
              ${!arenaV3State.ranking.length ? `<div class="arena-v3x-empty"><span>♛</span><h4>Ranking bo‘sh</h4></div>` : ""}`}
    </section>`;
}

function arenaV3SectionError(title, message) {
    return `<section class="arena-v3x-panel">${arenaV3PanelHeader("ARENA", title)}
        <div class="arena-v3x-error"><span>ERROR</span><h3>${title} yuklanmadi</h3>
            <p>${arenaV3Escape(message)}</p><button data-arena-v3-section-retry>Retry</button></div></section>`;
}

function arenaV3StageAction(match) {
    if (match.status === "READY") {
        const owner = arenaV3IsOwner(match);
        const playerReady = owner ? match.ownerReadyAt : match.opponentReadyAt;
        return `<section class="arena-v3x-stage-card">
            <small>READY CHECK</small><h3>Matchga tayyormisiz?</h3>
            <div class="arena-v3x-ready-grid">
                <span class="${match.ownerReadyAt ? "is-ready" : ""}"><i>${match.ownerReadyAt ? "✓" : "1"}</i>
                    <b>Player Ready</b><small>${match.ownerReadyAt ? "Tayyor" : "Kutilmoqda"}</small></span>
                <span class="${match.opponentReadyAt ? "is-ready" : ""}"><i>${match.opponentReadyAt ? "✓" : "2"}</i>
                    <b>Opponent Ready</b><small>${match.opponentReadyAt ? "Tayyor" : "Kutilmoqda"}</small></span>
            </div>
            <button class="arena-v3x-primary" data-arena-v3-ready ${playerReady ? "disabled" : ""}>
                ${playerReady ? "Ready yuborildi" : "READY"}</button></section>`;
    }
    if (match.status === "WAITING_ROOM_CODE") {
        if (arenaV3IsOwner(match)) {
            return `<section class="arena-v3x-stage-card"><small>ROOM CODE</small>
                <h3>Room Code kiriting</h3><p>Raqibingiz eFootball xonasiga kirishi uchun 1–8 belgi.</p>
                <form id="arenaV3RoomCodeForm"><input name="roomCode" minlength="1" maxlength="8"
                    required autocomplete="off" placeholder="ROOM CODE">
                    <button class="arena-v3x-primary" type="submit">Boshlash <i>→</i></button></form></section>`;
        }
        return `<section class="arena-v3x-stage-card arena-v3x-waiting">
            <i class="arena-v3x-spinner"></i><small>ROOM CODE</small>
            <h3>Creator Room Code yuborishini kuting</h3><p>Status avtomatik yangilanadi.</p></section>`;
    }
    if (match.status === "PLAYING") {
        const opponent = arenaV3IsOwner(match) ? match.opponentUsername : match.ownerUsername;
        return `<section class="arena-v3x-stage-card arena-v3x-playing">
            <small>LIVE MATCH</small><h3>${arenaV3Escape(opponent || "Raqib")}</h3>
            <div><span>Room Code<b>${arenaV3Escape(match.roomCode || "—")}</b></span>
                <span>Match Timer<b data-arena-v3-clock>${arenaV3PlayingClock(match)}</b></span>
                <span>Status<b>PLAYING</b></span></div>
            <p>Match tugagach screenshot yuborish uchun 10 daqiqa beriladi.</p></section>`;
    }
    if (match.status === "WAITING_SCREENSHOT") {
        return arenaV3ScreenshotPanel(match);
    }
    if (match.status === "WAITING_ADMIN") return arenaV3AdminReviewPanel();
    if (match.status === "FINISHED") return arenaV3ResultPanel(match);
    return "";
}

function arenaV3ActiveView() {
    const match = arenaV3State.activeMatch;
    if (!match) {
        return `<section class="arena-v3x-panel"><header><button data-arena-v3-back>‹</button>
            <section><small>YOUR BATTLE</small><h3>Active Match</h3></section><span></span></header>
            <div class="arena-v3x-empty"><span>◉</span><h4>Faol match yo‘q</h4>
                <p>Ochiq matchga qo‘shiling yoki yangisini yarating.</p>
                <button data-arena-v3-view="open">Open Matches</button></div></section>`;
    }
    const active = arenaV3StatusIndex(match.status);
    return `<section class="arena-v3x-panel arena-v3x-active">
        <header><button data-arena-v3-back>‹</button><section><small>YOUR BATTLE</small><h3>Active Match</h3></section>
            <b class="arena-v3x-status">${arenaV3Escape(match.status.replaceAll("_", " "))}</b></header>
        <article class="arena-v3x-versus">
            <section><span class="arena-v3x-avatar">${arenaV3Initial(match.ownerUsername)}</span>
                <strong>${arenaV3Escape(match.ownerUsername)}</strong><small>OWNER</small></section>
            <div><span>VS</span><b>${arenaV3Escape(match.stake)} EFC</b></div>
            <section><span class="arena-v3x-avatar">${arenaV3Initial(match.opponentUsername || "?")}</span>
                <strong>${arenaV3Escape(match.opponentUsername || "Raqib kutilmoqda")}</strong><small>OPPONENT</small></section>
        </article>
        <ol class="arena-v3x-timeline">${ARENA_V3_TIMELINE.map(([key, label], index) =>
            `<li class="${index < active ? "is-done" : index === active ? "is-active" : ""}">
                <i>${index < active ? "✓" : index + 1}</i><span><strong>${label}</strong>
                <small>${index === active ? "Hozirgi bosqich" : index < active ? "Yakunlandi" : "Kutilmoqda"}</small></span></li>`).join("")}</ol>
        ${arenaV3StageAction(match)}
        <div class="arena-v3x-info"><span>Match ID</span><b>${arenaV3Escape(match.publicId)}</b>
            <span>Format</span><b>${arenaV3Escape(match.matchType)} · ${match.matchTime} MIN</b></div>
        ${["OPEN", "READY", "WAITING_ROOM_CODE"].includes(match.status)
            ? `<button class="arena-v3x-cancel" type="button" data-arena-v3-cancel>Matchni bekor qilish</button>`
            : ""}
    </section>`;
}

function arenaV3TerminalResultView() {
    const match = arenaV3State.result?.match;
    if (!match || arenaV3IsActiveStatus(match.status)) return arenaV3HomeCards();
    return `<section class="arena-v3x-panel arena-v3x-terminal-result">
        <header><button type="button" data-arena-v3-back-history>‹</button>
            <section><small>MATCH HISTORY</small><h3>Match natijasi</h3></section>
            <b class="arena-v3x-status">${arenaV3Escape(match.status)}</b></header>
        ${arenaV3ResultPanel(match)}</section>`;
}

function arenaV3Render() {
    const page = document.getElementById("arenaPage");
    if (!page) return;
    let body = arenaV3HomeCards();
    if (arenaV3State.view === "open") body = arenaV3OpenView();
    if (arenaV3State.view === "create") body = arenaV3CreateView();
    if (arenaV3State.view === "active") body = arenaV3ActiveView();
    if (arenaV3State.view === "result") body = arenaV3TerminalResultView();
    if (arenaV3State.view === "detail") body = arenaV3MatchDetailView();
    if (arenaV3State.view === "profile") body = arenaV3ProfileView();
    if (arenaV3State.view === "history") body = arenaV3HistoryView();
    if (arenaV3State.view === "ranking") body = arenaV3RankingView();
    page.innerHTML = arenaV3Shell(body);
    arenaV3Bind(page);
}

function arenaV3Error(error, retry) {
    const page = document.getElementById("arenaPage");
    if (!page) return;
    const labels = { 401: "AUTH", 403: "ACCESS", 404: "NOT FOUND", 409: "CONFLICT", 500: "SERVER" };
    page.innerHTML = arenaV3Shell(`<div class="arena-v3x-error" data-status="${error.status || 0}">
        <span>${labels[error.status] || "NETWORK"}</span>
        <h3>Arena yuklanmadi</h3><p>${arenaV3Escape(error.message)}</p>
        <button type="button" id="arenaV3Retry">Qayta urinish</button></div>`);
    page.querySelector("#arenaV3Retry")?.addEventListener("click", retry);
}

async function arenaV3Load({ silent = false } = {}) {
    if (arenaV3State.loading) return;
    arenaV3State.loading = true;
    const page = document.getElementById("arenaPage");
    if (!silent && page) page.innerHTML = arenaV3Shell(arenaV3Skeleton());
    try {
        const [openMatches, activeMatch] = await Promise.all([
            arenaV3Client.open(),
            arenaV3Client.active(),
        ]);
        arenaV3State.openMatches = openMatches;
        arenaV3State.activeMatch = activeMatch;
        await arenaV3RefreshEvidence(activeMatch);
        arenaV3Render();
    } catch (error) {
        if (!silent) arenaV3Error(error, () => arenaV3Load());
        else arenaV3Toast(error.message, "error");
    } finally {
        arenaV3State.loading = false;
    }
}

async function loadArenaV3Page() {
    Navbar.setActive("arena");
    showPage("arenaPage", "Arena");
    arenaV3State.view = "home";
    clearInterval(arenaV3State.refreshTimer);
    clearInterval(arenaV3State.clockTimer);
    await arenaV3Load();
    arenaV3State.refreshTimer = setInterval(async () => {
        const page = document.getElementById("arenaPage");
        if (!page?.classList.contains("active") || arenaV3State.loading) return;
        try {
            const previousMatch = arenaV3State.activeMatch;
            const previous = previousMatch?.status;
            arenaV3State.activeMatch = await arenaV3Client.active();
            if (!arenaV3State.activeMatch && previousMatch) {
                try {
                    const terminal = await arenaV3Client.result(previousMatch.id);
                    arenaV3State.result = terminal;
                    if (!arenaV3IsActiveStatus(terminal.match.status)) {
                        arenaV3State.view = "result";
                    }
                } catch (_) {}
            }
            await arenaV3RefreshEvidence(arenaV3State.activeMatch);
            if (arenaV3State.view === "active" || arenaV3State.view === "result") {
                arenaV3Render();
            }
            if (previous && arenaV3State.activeMatch?.status !== previous) {
                arenaV3Toast(`Status: ${arenaV3State.activeMatch?.status || "Yakunlandi"}`);
            }
        } catch (error) {
            arenaV3Toast(error.message, "error");
        }
    }, 5000);
    arenaV3State.clockTimer = setInterval(arenaV3TickClocks, 1000);
}

async function arenaV3RefreshEvidence(match) {
    if (!match) {
        arenaV3State.screenshots = [];
        return;
    }
    if (["PLAYING", "WAITING_SCREENSHOT", "WAITING_ADMIN", "FINISHED"].includes(match.status)) {
        try {
            arenaV3State.screenshots = await arenaV3Client.screenshots(match.id);
        } catch (_) {}
    }
    if (match.status === "FINISHED") {
        try {
            arenaV3State.result = await arenaV3Client.result(match.id);
        } catch (error) {
            if (error.status !== 404) arenaV3State.evidenceError = error.message;
        }
    }
}

function arenaV3TickClocks() {
    const match = arenaV3State.activeMatch || arenaV3State.result?.match;
    const clock = document.querySelector("[data-arena-v3-clock]");
    if (clock && match) clock.textContent = arenaV3PlayingClock(match);
    const countdown = document.querySelector("[data-arena-v3-countdown]");
    if (countdown && match) {
        const seconds = arenaV3ScreenshotSeconds(match);
        countdown.textContent = String(seconds);
        countdown.parentElement?.classList.toggle("is-urgent", seconds <= 10);
        if (seconds <= 0) document.querySelector("[data-arena-v3-upload]")?.setAttribute("disabled", "");
    }
    const rewardClock = document.querySelector("[data-arena-v3-reward-clock]");
    if (rewardClock && match) rewardClock.textContent = arenaV3RewardClock(match);
}

function arenaV3Select(view) {
    if (!["home", "open", "create", "active", "detail", "profile", "history", "ranking"].includes(view)) return;
    arenaV3State.view = view;
    arenaV3Render();
    if (view === "profile") arenaV3LoadProfile();
    if (view === "history") arenaV3LoadHistory(true);
    if (view === "ranking") arenaV3LoadRanking();
}

async function arenaV3LoadProfile() {
    arenaV3State.sectionLoading = true;
    arenaV3State.sectionError = null;
    arenaV3Render();
    arenaV3Track("arena_profile_open");
    try {
        arenaV3State.profile = await arenaV3Client.profile();
    } catch (error) {
        arenaV3State.sectionError = error.message;
    } finally {
        arenaV3State.sectionLoading = false;
        arenaV3Render();
    }
}

async function arenaV3LoadHistory(reset = false) {
    if (arenaV3State.sectionLoading) return;
    if (reset) {
        arenaV3State.history = [];
        arenaV3State.historyResults = {};
        arenaV3State.historyOffset = 0;
        arenaV3State.historyHasMore = true;
        arenaV3Track("arena_history_open");
    }
    arenaV3State.sectionLoading = true;
    arenaV3State.sectionError = null;
    arenaV3Render();
    try {
        const page = await arenaV3Client.history({ limit: 20, offset: arenaV3State.historyOffset });
        arenaV3State.history.push(...page);
        arenaV3State.historyOffset += page.length;
        arenaV3State.historyHasMore = page.length === 20;
        const results = await Promise.allSettled(page.map((match) => arenaV3Client.result(match.id)));
        results.forEach((result, index) => {
            if (result.status === "fulfilled") arenaV3State.historyResults[page[index].id] = result.value;
        });
    } catch (error) {
        arenaV3State.sectionError = error.message;
    } finally {
        arenaV3State.sectionLoading = false;
        arenaV3Render();
    }
}

async function arenaV3LoadRanking(period = arenaV3State.rankingPeriod) {
    arenaV3State.rankingPeriod = period;
    arenaV3State.sectionLoading = true;
    arenaV3State.sectionError = null;
    arenaV3Render();
    arenaV3Track("arena_ranking_open", { period });
    try {
        arenaV3State.ranking = await arenaV3Client.ranking(period);
    } catch (error) {
        arenaV3State.ranking = [];
        arenaV3State.sectionError = error.message;
    } finally {
        arenaV3State.sectionLoading = false;
        arenaV3Render();
    }
}

async function arenaV3ShowHistoryResult(matchId) {
    try {
        arenaV3State.result = arenaV3State.historyResults[matchId] || await arenaV3Client.result(matchId);
        arenaV3State.activeMatch = null;
        arenaV3State.view = "result";
        arenaV3Track("arena_result_open", { match_id: Number(matchId) });
        arenaV3Render();
    } catch (error) {
        arenaV3Toast(error.message, "error");
    }
}

function arenaV3SelectAppeal(input) {
    const file = input.files?.[0] || null;
    arenaV3State.evidenceError = null;
    if (!file || !String(file.type || "").startsWith("video/")) {
        arenaV3State.appealFile = null;
        arenaV3State.evidenceError = "Faqat video fayl tanlang.";
    } else {
        arenaV3State.appealFile = file;
        arenaV3State.appealProgress = 0;
        arenaV3Track("arena_appeal_upload", {
            match_id: arenaV3State.activeMatch?.id || arenaV3State.result?.match?.id,
        });
    }
    arenaV3Render();
}

async function arenaV3UploadAppeal() {
    const match = arenaV3State.activeMatch || arenaV3State.result?.match;
    if (!match || !arenaV3State.appealFile || arenaV3State.actionLoading) return;
    arenaV3State.actionLoading = "appeal";
    arenaV3State.appealStatus = "uploading";
    arenaV3State.evidenceError = null;
    arenaV3Render();
    try {
        await arenaV3Client.uploadAppeal(
            match.id, arenaV3State.appealFile, arenaV3State.appealReason, (progress) => {
            arenaV3State.appealProgress = progress;
            const bar = document.querySelector(".arena-v3x-upload-progress i");
            const label = document.querySelector(".arena-v3x-upload-progress span");
            if (bar) bar.style.width = `${progress}%`;
            if (label) label.textContent = `${progress}%`;
            },
        );
        arenaV3State.appealStatus = "submitted";
        arenaV3State.appealReason = "";
        match.hasAppeal = true;
        arenaV3Track("arena_appeal_submit", { match_id: match.id });
        arenaV3Toast("Appeal yuborildi.");
    } catch (error) {
        arenaV3State.appealStatus = null;
        arenaV3State.evidenceError = error.message;
        arenaV3Toast(error.message, "error");
    } finally {
        arenaV3State.actionLoading = null;
        arenaV3Render();
    }
}

async function arenaV3ConfirmResult() {
    const match = arenaV3State.activeMatch || arenaV3State.result?.match;
    if (!match || arenaV3State.actionLoading) return;
    const accepted = await arenaV3ResultConfirmationDialog();
    if (!accepted) return;
    arenaV3State.actionLoading = "confirm-result";
    try {
        await arenaV3Client.confirmResult(match.id);
        arenaV3State.result = await arenaV3Client.result(match.id);
        arenaV3State.activeMatch = arenaV3IsActiveStatus(arenaV3State.result.match.status)
            ? arenaV3State.result.match : null;
        arenaV3State.view = arenaV3State.activeMatch ? "active" : "result";
        arenaV3Toast("Natija tasdiqlandi.");
    } catch (error) {
        arenaV3Toast(error.message, "error");
    } finally {
        arenaV3State.actionLoading = null;
        arenaV3Render();
    }
}

function arenaV3ResultConfirmationDialog() {
    return new Promise((resolve) => {
        const modal = document.createElement("div");
        modal.className = "arena-v3x-modal";
        modal.innerHTML = `<section role="dialog" aria-modal="true" aria-labelledby="arenaV3ResultConfirmTitle">
            <button type="button" data-close aria-label="Yopish">×</button><small>CONFIRM</small>
            <h3 id="arenaV3ResultConfirmTitle">Natijani tasdiqlaysizmi?</h3>
            <p>Natijani tasdiqlaganingizdan so'ng ushbu match bo'yicha norozilik (appeal) yubora olmaysiz.</p>
            <p>Davom etasizmi?</p>
            <div class="arena-v3x-modal-actions"><button type="button" data-close>Bekor qilish</button>
                <button class="arena-v3x-primary" type="button" data-confirm>Ha, tasdiqlayman</button></div></section>`;
        document.body.appendChild(modal);
        let resolved = false;
        const finish = (accepted) => {
            if (resolved) return;
            resolved = true;
            modal.remove();
            resolve(accepted);
        };
        modal.querySelectorAll("[data-close]").forEach((button) =>
            button.addEventListener("click", () => finish(false)));
        modal.querySelector("[data-confirm]").addEventListener("click", () => finish(true));
    });
}

async function arenaV3OpenDetail(matchId) {
    arenaV3State.view = "detail";
    arenaV3State.selectedMatch = null;
    arenaV3Render();
    try {
        arenaV3State.selectedMatch = await arenaV3Client.detail(matchId);
        arenaV3Render();
    } catch (error) {
        arenaV3Error(error, () => arenaV3OpenDetail(matchId));
    }
}

async function arenaV3RunAction(key, action, success) {
    if (arenaV3State.actionLoading) return;
    arenaV3State.actionLoading = key;
    const controls = document.querySelectorAll("[data-arena-v3-ready], #arenaV3RoomCodeForm button, [data-arena-v3-cancel]");
    controls.forEach((control) => {
        control.disabled = true;
        control.classList.add("is-loading");
        control.setAttribute("aria-busy", "true");
    });
    try {
        const updatedMatch = await action();
        arenaV3State.activeMatch = arenaV3IsActiveStatus(updatedMatch?.status)
            ? updatedMatch : null;
        arenaV3State.view = arenaV3State.activeMatch ? "active" : "home";
        arenaV3Render();
        arenaV3Toast(success);
    } catch (error) {
        controls.forEach((control) => {
            control.disabled = false;
            control.classList.remove("is-loading");
            control.removeAttribute("aria-busy");
        });
        arenaV3Toast(error.message, "error");
    } finally {
        arenaV3State.actionLoading = null;
    }
}

function arenaV3SelectScreenshot(input) {
    const file = input.files?.[0] || null;
    arenaV3State.evidenceError = null;
    if (!file || !["image/png", "image/jpeg"].includes(file.type)) {
        arenaV3State.screenshotFile = null;
        arenaV3State.evidenceError = "Faqat PNG yoki JPEG fayl tanlang.";
        arenaV3Render();
        return;
    }
    if (arenaV3State.screenshotPreview) URL.revokeObjectURL(arenaV3State.screenshotPreview);
    arenaV3State.screenshotFile = file;
    arenaV3State.screenshotPreview = URL.createObjectURL(file);
    arenaV3State.uploadProgress = 0;
    arenaV3Render();
}

async function arenaV3UploadScreenshot() {
    const match = arenaV3State.activeMatch;
    const file = arenaV3State.screenshotFile;
    if (!match || !file || arenaV3State.actionLoading) return;
    arenaV3State.actionLoading = "screenshot";
    arenaV3State.evidenceError = null;
    const button = document.querySelector("[data-arena-v3-upload]");
    button?.classList.add("is-loading");
    button?.setAttribute("disabled", "");
    try {
        await arenaV3Client.uploadScreenshot(match.id, file, (progress) => {
            arenaV3State.uploadProgress = progress;
            const bar = document.querySelector(".arena-v3x-upload-progress i");
            const label = document.querySelector(".arena-v3x-upload-progress span");
            if (bar) bar.style.width = `${progress}%`;
            if (label) label.textContent = `${progress}%`;
        });
        arenaV3State.screenshots = await arenaV3Client.screenshots(match.id);
        arenaV3State.screenshotFile = null;
        if (arenaV3State.screenshotPreview) URL.revokeObjectURL(arenaV3State.screenshotPreview);
        arenaV3State.screenshotPreview = null;
        arenaV3Render();
        arenaV3Toast("✅ Screenshot muvaffaqiyatli yuborildi");
    } catch (error) {
        if ([0, 408].includes(Number(error?.status))) {
            try {
                const screenshots = await arenaV3Client.screenshots(match.id);
                const playerId = Number(arenaV3TelegramUser().id);
                if (arenaV3ScreenshotAccepted(screenshots, playerId)) {
                    arenaV3State.screenshots = screenshots;
                    arenaV3State.screenshotFile = null;
                    if (arenaV3State.screenshotPreview) URL.revokeObjectURL(arenaV3State.screenshotPreview);
                    arenaV3State.screenshotPreview = null;
                    arenaV3Render();
                    arenaV3Toast("✅ Screenshot muvaffaqiyatli yuborildi");
                    return;
                }
            } catch (_) {}
        }
        arenaV3State.evidenceError = error.message;
        arenaV3Render();
        arenaV3Toast(error.message, "error");
    } finally {
        arenaV3State.actionLoading = null;
    }
}

async function arenaV3RetryResult() {
    const match = arenaV3State.activeMatch;
    if (!match) return;
    try {
        arenaV3State.result = await arenaV3Client.result(match.id);
        arenaV3Render();
    } catch (error) {
        arenaV3Toast(error.message, "error");
    }
}

function arenaV3Ready() {
    const match = arenaV3State.activeMatch;
    if (match) arenaV3RunAction("ready", () => arenaV3Client.ready(match.id), "Ready qabul qilindi.");
}

function arenaV3RoomCodeSubmit(form) {
    const match = arenaV3State.activeMatch;
    const code = String(new FormData(form).get("roomCode") || "").trim();
    if (!code || code.length > 8) return arenaV3Toast("Room Code 1–8 belgi bo‘lishi kerak.", "error");
    if (match) arenaV3RunAction("room", () => arenaV3Client.submitRoomCode(match.id, code), "Match boshlandi.");
}

function arenaV3CancelConfirm() {
    const match = arenaV3State.activeMatch;
    if (!match || !["OPEN", "READY", "WAITING_ROOM_CODE"].includes(match.status)) return;
    const modal = document.createElement("div");
    modal.className = "arena-v3x-modal";
    modal.innerHTML = `<section role="dialog" aria-modal="true" aria-labelledby="arenaV3CancelTitle">
        <button type="button" data-close aria-label="Yopish">×</button><small>CONFIRM</small>
        <h3 id="arenaV3CancelTitle">Matchni bekor qilasizmi?</h3>
        <p>Bu amal matchni CANCELLED holatiga o‘tkazadi.</p>
        <div class="arena-v3x-modal-actions"><button type="button" data-close>Yo‘q</button>
            <button class="arena-v3x-cancel" type="button" data-confirm>Ha, bekor qilish</button></div></section>`;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", close));
    modal.querySelector("[data-confirm]").addEventListener("click", () => {
        close();
        arenaV3RunAction("cancel", () => arenaV3Client.cancel(match.id), "Match bekor qilindi.");
    });
}

function arenaV3Choice(event) {
    const button = event.target.closest(".arena-v3x-choice button");
    if (!button) return;
    button.parentElement.querySelectorAll("button").forEach((item) =>
        item.classList.toggle("is-selected", item === button));
}

async function arenaV3CreateSubmit(form) {
    const username = String(new FormData(form).get("username") || "").trim();
    if (!username) return arenaV3Toast("eFootball username kiriting.", "error");
    const selected = (name) => form.querySelector(`[data-choice="${name}"] .is-selected`)?.dataset.value;
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    submit.classList.add("is-loading");
    try {
        const match = await arenaV3Client.create({
            username,
            stake: Number(selected("stake")),
            matchType: selected("type"),
            matchTime: Number(selected("time")),
        });
        try {
            arenaV3SaveUsername(username);
        } catch (_) {}
        arenaV3State.activeMatch = match;
        arenaV3State.view = "active";
        arenaV3Render();
        arenaV3Toast("Match muvaffaqiyatli yaratildi.");
    } catch (error) {
        arenaV3Toast(error.message, "error");
        submit.disabled = false;
        submit.classList.remove("is-loading");
    }
}

function arenaV3JoinModal(matchId) {
    const match = arenaV3State.openMatches.find((item) => item.id === Number(matchId));
    if (!match) return;
    const modal = document.createElement("div");
    modal.className = "arena-v3x-modal";
    modal.innerHTML = `<section role="dialog" aria-modal="true" aria-labelledby="arenaV3JoinTitle">
        <button type="button" data-close aria-label="Yopish">×</button><span>⚔</span>
        <small>JOIN BATTLE</small><h3 id="arenaV3JoinTitle">${arenaV3Escape(match.ownerUsername)}</h3>
        <p>${arenaV3Escape(match.stake)} EFC · ${match.matchTime} MIN</p>
        <label><span>Sizning eFootball username</span><input maxlength="64" value="${arenaV3Escape(arenaV3StoredUsername())}" placeholder="USERNAME"></label>
        <button class="arena-v3x-primary" type="button" data-confirm>Join Match <i>→</i></button>
    </section>`;
    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add("is-visible"));
    const close = () => {
        modal.classList.remove("is-visible");
        setTimeout(() => modal.remove(), 220);
    };
    modal.querySelector("[data-close]").addEventListener("click", close);
    modal.addEventListener("click", (event) => {
        if (event.target === modal) close();
    });
    modal.querySelector("[data-confirm]").addEventListener("click", async (event) => {
        const username = modal.querySelector("input").value.trim();
        if (!username) return arenaV3Toast("eFootball username kiriting.", "error");
        event.currentTarget.disabled = true;
        event.currentTarget.classList.add("is-loading");
        event.currentTarget.setAttribute("aria-busy", "true");
        try {
            const active = await arenaV3Client.join(match.id, username);
            try {
                arenaV3SaveUsername(username);
            } catch (_) {}
            close();
            arenaV3State.activeMatch = active;
            arenaV3State.view = "active";
            arenaV3Render();
            arenaV3Toast("Matchga qo‘shildingiz.");
        } catch (error) {
            event.currentTarget.disabled = false;
            event.currentTarget.classList.remove("is-loading");
            event.currentTarget.removeAttribute("aria-busy");
            arenaV3Toast(error.message, "error");
        }
    });
}

function arenaV3Bind(page) {
    page.querySelectorAll("[data-arena-v3-view]").forEach((button) =>
        button.addEventListener("click", () => arenaV3Select(button.dataset.arenaV3View)));
    page.querySelectorAll("[data-arena-v3-back]").forEach((button) =>
        button.addEventListener("click", () => arenaV3Select("home")));
    page.querySelectorAll("[data-arena-v3-back-open]").forEach((button) =>
        button.addEventListener("click", () => arenaV3Select("open")));
    page.querySelectorAll("[data-arena-v3-refresh]").forEach((button) =>
        button.addEventListener("click", () => arenaV3Load({ silent: true })));
    page.querySelectorAll("[data-arena-v3-join]").forEach((button) =>
        button.addEventListener("click", () => arenaV3JoinModal(button.dataset.arenaV3Join)));
    page.querySelectorAll("[data-arena-v3-detail]").forEach((button) =>
        button.addEventListener("click", () => arenaV3OpenDetail(button.dataset.arenaV3Detail)));
    page.querySelector("[data-arena-v3-ready]")?.addEventListener("click", arenaV3Ready);
    page.querySelector("[data-arena-v3-cancel]")?.addEventListener("click", arenaV3CancelConfirm);
    page.querySelector("[data-arena-v3-file]")?.addEventListener("change", (event) =>
        arenaV3SelectScreenshot(event.currentTarget));
    page.querySelector("[data-arena-v3-upload]")?.addEventListener("click", arenaV3UploadScreenshot);
    page.querySelector("[data-arena-v3-retry-result]")?.addEventListener("click", arenaV3RetryResult);
    page.querySelector("[data-arena-v3-appeal-file]")?.addEventListener("change", (event) =>
        arenaV3SelectAppeal(event.currentTarget));
    page.querySelector("[data-arena-v3-appeal-upload]")?.addEventListener("click", arenaV3UploadAppeal);
    page.querySelector("[data-arena-v3-appeal-reason]")?.addEventListener("input", (event) => {
        arenaV3State.appealReason = event.currentTarget.value;
        const button = page.querySelector("[data-arena-v3-appeal-upload]");
        if (button) button.disabled = !arenaV3State.appealFile || !arenaV3State.appealReason.trim();
    });
    page.querySelector("[data-arena-v3-confirm-result]")?.addEventListener("click", arenaV3ConfirmResult);
    page.querySelector("[data-arena-v3-reject-result]")?.addEventListener("click", () => {
        arenaV3State.appealOpen = true;
        arenaV3Render();
    });
    page.querySelector("[data-arena-v3-history-more]")?.addEventListener("click", () => arenaV3LoadHistory(false));
    page.querySelectorAll("[data-arena-v3-history-result]").forEach((button) =>
        button.addEventListener("click", () => arenaV3ShowHistoryResult(Number(button.dataset.arenaV3HistoryResult))));
    page.querySelector("[data-arena-v3-back-history]")?.addEventListener("click", () => {
        arenaV3State.view = "history";
        arenaV3Render();
    });
    page.querySelectorAll("[data-arena-v3-period]").forEach((button) =>
        button.addEventListener("click", () => arenaV3LoadRanking(button.dataset.arenaV3Period)));
    page.querySelectorAll("[data-arena-v3-section-retry]").forEach((button) =>
        button.addEventListener("click", () => {
            if (arenaV3State.view === "profile") arenaV3LoadProfile();
            if (arenaV3State.view === "history") arenaV3LoadHistory(true);
            if (arenaV3State.view === "ranking") arenaV3LoadRanking();
        }));
    page.querySelector("[data-arena-v3-continue]")?.addEventListener("click", async () => {
        arenaV3State.view = "home";
        await arenaV3Load();
    });
    page.querySelector("#arenaV3RoomCodeForm")?.addEventListener("submit", (event) => {
        event.preventDefault();
        arenaV3RoomCodeSubmit(event.currentTarget);
    });
    page.querySelectorAll(".arena-v3x-choice").forEach((choice) =>
        choice.addEventListener("click", arenaV3Choice));
    page.querySelector("#arenaV3CreateForm")?.addEventListener("submit", (event) => {
        event.preventDefault();
        arenaV3CreateSubmit(event.currentTarget);
    });
    page.addEventListener("touchstart", (event) => {
        arenaV3State.touchStart = event.touches[0]?.clientY || 0;
    }, { passive: true, once: true });
    page.addEventListener("touchend", (event) => {
        const distance = (event.changedTouches[0]?.clientY || 0) - arenaV3State.touchStart;
        if (page.scrollTop <= 0 && distance > 80) arenaV3Load({ silent: true });
    }, { passive: true, once: true });
    const sentinel = page.querySelector("[data-arena-v3-history-sentinel]");
    if (sentinel && typeof IntersectionObserver !== "undefined") {
        const observer = new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) {
                observer.disconnect();
                arenaV3LoadHistory(false);
            }
        }, { rootMargin: "180px" });
        observer.observe(sentinel);
    }
}

Object.assign(globalThis, {
    loadArenaPage: loadArenaV3Page,
    loadArenaV3Page,
    arenaV3Load,
});

if (typeof module !== "undefined") {
    module.exports = {
        ArenaV3Client,
        ArenaV3ClientError,
        normalizeArenaV3Match,
        ARENA_V3_TIMELINE,
        arenaV3Key,
        arenaV3Date,
        arenaV3Initial,
        arenaV3Skeleton,
        arenaV3MatchCard,
        arenaV3StatusIndex,
        arenaV3IsActiveStatus,
        arenaV3ScreenshotAccepted,
        arenaV3PlayingClock,
        arenaV3IsOwner,
        arenaV3ScreenshotSeconds,
        arenaV3EvidenceState,
        normalizeArenaV3Screenshot,
        normalizeArenaV3Result,
        normalizeArenaV3Profile,
        normalizeArenaV3RankingPlayer,
        arenaV3Track,
        arenaV3StoredUsername,
        arenaV3SaveUsername,
    };
}
