class ArenaApiError extends Error {
    constructor(message, { status = 0, retryable = false } = {}) {
        super(message);
        this.name = "ArenaApiError";
        this.status = status;
        this.retryable = retryable;
    }
}

class ArenaApiClient {
    constructor({
        baseUrl = typeof API_URL !== "undefined" ? API_URL : "",
        timeoutMs = 10000,
        retries = 2,
        fetchImpl = (...args) => globalThis.fetch(...args),
        initDataProvider = () => globalThis.Telegram?.WebApp?.initData || "",
    } = {}) {
        this.baseUrl = String(baseUrl).replace(/\/$/, "");
        this.timeoutMs = Math.max(50, Number(timeoutMs) || 10000);
        this.retries = Math.max(0, Number(retries) || 0);
        this.fetchImpl = fetchImpl;
        this.initDataProvider = initDataProvider;
    }

    async request(path, { method = "GET", query = null, body = null } = {}) {
        const initData = this.initDataProvider();
        if (!initData) {
            throw new ArenaApiError("Telegram tasdiqlash ma’lumoti topilmadi.", { status: 401 });
        }
        const params = new URLSearchParams();
        Object.entries(query || {}).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== "") {
                params.set(key, String(value));
            }
        });
        const suffix = params.size ? `?${params.toString()}` : "";
        const transientStatuses = new Set([429, 500, 502, 503, 504]);
        const maxAttempts = method === "GET" ? this.retries : 0;
        for (let attempt = 0; attempt <= maxAttempts; attempt += 1) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), this.timeoutMs);
            try {
                const response = await this.fetchImpl(`${this.baseUrl}${path}${suffix}`, {
                    method,
                    headers: {
                        "X-Telegram-Init-Data": initData,
                        ...(body ? { "Content-Type": "application/json" } : {}),
                    },
                    ...(body ? { body: JSON.stringify(body) } : {}),
                    signal: controller.signal,
                });
                let payload;
                try {
                    payload = await response.json();
                } catch (_) {
                    throw new ArenaApiError("Arena serveridan noto‘g‘ri javob olindi.");
                }
                if (!response.ok) {
                    const retryable = transientStatuses.has(response.status);
                    if (retryable && attempt < maxAttempts) continue;
                    throw new ArenaApiError(arenaHttpMessage(response.status), {
                        status: response.status,
                        retryable,
                    });
                }
                return payload;
            } catch (error) {
                if (error instanceof ArenaApiError) throw error;
                const timeout = error?.name === "AbortError";
                if (attempt < maxAttempts) continue;
                throw new ArenaApiError(
                    timeout
                        ? "Arena serveri javob bermadi. Qayta urinib ko‘ring."
                        : "Arena serveri bilan aloqa o‘rnatilmadi.",
                    { retryable: true },
                );
            } finally {
                clearTimeout(timer);
            }
        }
        throw new ArenaApiError("Arena so‘rovi bajarilmadi.");
    }

    async openMatches({ skip = 0, limit = 20 } = {}) {
        return normalizeMatchList(await this.request("/matches/open", { query: { skip, limit } }));
    }

    async myMatches({ skip = 0, limit = 20 } = {}) {
        return normalizeMatchList(await this.request("/matches/me", { query: { skip, limit } }));
    }

    async match(matchId) {
        return normalizeMatch(await this.request(`/matches/${Number(matchId)}`));
    }

    async stats() {
        return await this.request("/matches/stats/me");
    }

    async dashboard() {
        const payload = await this.request("/arena/dashboard");
        if (!payload || !Array.isArray(payload.stakes)) {
            throw new ArenaApiError("Arena dashboard javobi noto‘g‘ri formatda.");
        }
        return payload.stakes.map(normalizeArenaStakeMetrics);
    }

    async profile() {
        return normalizeArenaProfile(await this.request("/arena/profile"));
    }

    async v4Leaderboard({ period = "all", limit = 100 } = {}) {
        const payload = await this.request("/arena/leaderboard", { query: { period, limit } });
        if (!payload || !Array.isArray(payload.users)) {
            throw new ArenaApiError("Arena leaderboard javobi noto‘g‘ri formatda.");
        }
        return {
            period: payload.period,
            users: payload.users.map(normalizeArenaLeaderboardUser),
        };
    }

    async leaderboard({ period = "all", limit = 20 } = {}) {
        const payload = await this.request("/matches/leaderboard", { query: { period, limit } });
        if (!payload || !Array.isArray(payload.users)) {
            throw new ArenaApiError("Arena reyting javobi noto‘g‘ri formatda.");
        }
        return payload;
    }

    async guide() {
        return await this.request("/matches/guide");
    }

    async createMatch({ gameType, stakeEfc, scheduledAt, rulesAccepted }) {
        if (rulesAccepted !== true) {
            throw new ArenaApiError("Arena qoidalarini qabul qilish majburiy.", {
                status: 400,
            });
        }
        return normalizeMatch(await this.request("/matches/", {
            method: "POST",
            body: {
                game_type: gameType,
                stake_efc: stakeEfc,
                scheduled_at: scheduledAt,
                rules_accepted: true,
            },
        }));
    }

    async acceptMatch(matchId, { rulesAccepted }) {
        if (rulesAccepted !== true) {
            throw new ArenaApiError("Arena qoidalarini qabul qilish majburiy.", {
                status: 400,
            });
        }
        return normalizeMatch(await this.request(`/matches/${Number(matchId)}/accept`, {
            method: "POST",
            body: { rules_accepted: true },
        }));
    }

    async readyMatch(matchId) {
        return normalizeMatch(await this.request(`/matches/${Number(matchId)}/ready`, {
            method: "POST",
            body: {},
        }));
    }

    async setRoomCode(matchId, roomCode) {
        const normalized = String(roomCode || "").trim();
        if (!normalized) {
            throw new ArenaApiError("Room code kiritilishi shart.", { status: 400 });
        }
        return normalizeMatch(await this.request(`/matches/${Number(matchId)}/room-code`, {
            method: "POST",
            body: { room_code: normalized },
        }));
    }
}

function arenaHttpMessage(status) {
    const messages = {
        400: "Arena so‘rovi noto‘g‘ri.",
        401: "Telegram tasdiqlashi yaroqsiz yoki eskirgan.",
        403: "Bu Arena ma’lumotini ko‘rishga ruxsat yo‘q.",
        404: "Arena match topilmadi.",
        409: "Match holati o‘zgargan. Ma’lumotni yangilang.",
        422: "Arena so‘rovi formati noto‘g‘ri.",
        429: "Arena serveri band. Birozdan keyin urinib ko‘ring.",
    };
    return status >= 500
        ? "Arena serverida vaqtinchalik xatolik yuz berdi."
        : messages[status] || "Arena so‘rovi bajarilmadi.";
}

function normalizeMatch(value) {
    if (!value || !Number.isInteger(value.id) || typeof value.status !== "string") {
        throw new ArenaApiError("Arena match javobi noto‘g‘ri formatda.");
    }
    return {
        id: value.id,
        gameType: value.game_type || "EFOOTBALL",
        creatorName: value.creator_display_name || "O‘yinchi",
        opponentName: value.opponent_display_name || "Raqib kutilmoqda",
        stakeEfc: String(value.efc_amount ?? "0"),
        totalPool: String(value.total_pool ?? "0"),
        winnerReward: String(value.winner_reward ?? "0"),
        status: value.status,
        scheduledAt: value.scheduled_at || null,
        readyWindowStartedAt: value.ready_window_started_at || null,
        readyDeadlineAt: value.ready_deadline_at || null,
        creatorReady: Boolean(value.creator_ready),
        opponentReady: Boolean(value.opponent_ready),
        myScreenshotUploaded: Boolean(value.my_screenshot_uploaded),
        myVideoUploaded: Boolean(value.my_video_uploaded),
        roomCode: value.room_code || null,
        resultType: value.result_type || null,
        result: value.result || null,
        reward: String(value.reward ?? "0"),
        createdAt: value.created_at || null,
        completedAt: value.completed_at || value.resolved_at || null,
    };
}

function normalizeMatchList(value) {
    if (!value || !Array.isArray(value.matches)) {
        throw new ArenaApiError("Arena matchlar ro‘yxati noto‘g‘ri formatda.");
    }
    return value.matches.map(normalizeMatch);
}

function normalizeArenaStakeMetrics(value) {
    const stake = Number(value?.stake);
    if (!ARENA_V3_STAKES.includes(stake)) {
        throw new ArenaApiError("Arena stake statistikasi noto‘g‘ri formatda.");
    }
    return {
        stake,
        onlinePlayers: Math.max(0, Number(value.online_players) || 0),
        openRooms: Math.max(0, Number(value.open_rooms) || 0),
        averageWaitTime: Math.max(0, Number(value.average_wait_time) || 0),
    };
}

function normalizeArenaProfile(value) {
    if (!value || typeof value !== "object") {
        throw new ArenaApiError("Arena profil javobi noto‘g‘ri formatda.");
    }
    return {
        totalMatches: Number(value.total_matches) || 0,
        wins: Number(value.wins) || 0,
        losses: Number(value.losses) || 0,
        winRate: Number(value.win_rate) || 0,
        totalEfcWon: String(value.total_efc_won ?? "0"),
        currentStreak: Number(value.current_streak) || 0,
        bestStreak: Number(value.best_streak) || 0,
    };
}

function normalizeArenaLeaderboardUser(value) {
    return {
        rank: Number(value?.rank) || 0,
        displayName: value?.display_name || "O‘yinchi",
        wins: Number(value?.wins) || 0,
        losses: Number(value?.losses) || 0,
        winRate: Number(value?.win_rate) || 0,
        totalMatches: Number(value?.total_matches) || 0,
        totalEfcWon: String(value?.total_efc_won ?? "0"),
    };
}

const arenaApiClient = new ArenaApiClient();
const ARENA_V3_STAKES = Object.freeze([100, 500, 1000, 5000, 10000]);
const arenaView = {
    tab: "open",
    selectedStake: 100,
    dashboard: [],
    playerProfile: null,
    leaderboardPeriod: "weekly",
    loading: false,
    mutationPending: false,
    createDraft: null,
    detailMatchId: null,
    countdownTimer: null,
    refreshTimer: null,
};

async function runArenaMutation(task) {
    if (arenaView.mutationPending) return null;
    arenaView.mutationPending = true;
    try {
        return await task();
    } finally {
        arenaView.mutationPending = false;
    }
}

function arenaEscape(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function arenaStatus(status) {
    return ({
        WAITING_PLAYER: "Raqib kutilmoqda",
        WAITING_READY: "Tayyorlik kutilmoqda",
        ROOM_READY: "Room tayyor",
        PLAYING: "O‘yin davom etmoqda",
        TECHNICAL_REVIEW: "Texnik tekshiruv",
        WAITING_ADMIN: "Admin tekshirmoqda",
        COMPLETED: "Yakunlangan",
        CANCELLED: "Bekor qilingan",
    })[status] || status;
}

function arenaDate(value) {
    if (!value) return "Vaqt belgilanmagan";
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? "Vaqt noto‘g‘ri"
        : date.toLocaleString("uz-UZ", { dateStyle: "medium", timeStyle: "short" });
}

function arenaStakeValue(value) {
    const stake = Number(value);
    return ARENA_V3_STAKES.includes(stake) ? stake : ARENA_V3_STAKES[0];
}

function arenaMatchesForStake(matches, stake = arenaView.selectedStake) {
    const selected = arenaStakeValue(stake);
    return matches.filter((match) => Number(match.stakeEfc) === selected);
}

function arenaStakeNavigation() {
    const metrics = new Map(arenaView.dashboard.map((item) => [item.stake, item]));
    return `<section class="arena-v3-lobby" aria-label="Arena stake xonalari">
        <header><div><small>STAKE LOBBY</small><h3>${arenaEscape(arenaView.selectedStake)} EFC xonalari</h3></div>
            <button class="arena-v3-quick" type="button" onclick="startArenaQuickMatch()">⚡ Tez o‘yin</button></header>
        <div class="arena-v3-stake-grid">${ARENA_V3_STAKES.map((stake) => {
            const item = metrics.get(stake);
            return (
            `<button type="button" data-arena-stake="${stake}" class="${stake === arenaView.selectedStake ? "active" : ""}"
                aria-pressed="${stake === arenaView.selectedStake}" onclick="selectArenaStake(${stake})">
                <strong>${stake.toLocaleString("uz-UZ")} <small>EFC</small></strong>
                ${item ? `<span>● ${item.onlinePlayers} online</span><span>▣ ${item.openRooms} xona</span>
                    <span>◷ ${arenaWaitTime(item.averageWaitTime)}</span>` : '<i class="arena-v4-metric-loading"></i>'}
            </button>`); }).join("")}</div>
        <p>Tez o‘yin tanlangan stake bo‘yicha ochiq xonaga qo‘shadi. Xona bo‘lmasa eFootball xonasi yaratiladi. Bosish orqali Arena qoidalarini qabul qilasiz.</p>
    </section>`;
}

function arenaWaitTime(seconds) {
    const value = Math.max(0, Number(seconds) || 0);
    if (value < 60) return `${Math.round(value)} soniya`;
    return `${Math.round(value / 60)} daqiqa`;
}

function arenaSafeAvatarUrl(value) {
    try {
        const url = new URL(String(value || ""));
        return url.protocol === "https:" ? url.href : "";
    } catch (_) {
        return "";
    }
}

function arenaTelegramProfile() {
    const user = globalThis.Telegram?.WebApp?.initDataUnsafe?.user || {};
    const displayName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim()
        || user.username || "O‘yinchi";
    return {
        displayName,
        photoUrl: arenaSafeAvatarUrl(user.photo_url),
        initial: Array.from(displayName.trim())[0]?.toLocaleUpperCase("uz-UZ") || "L",
    };
}

const ARENA_UI_HOOKS = Object.freeze({
    BUTTON_CLICK: "button-click",
    MATCH_FOUND: "match-found",
    VICTORY: "victory",
});

function arenaEmitUiHook(name, detail = {}) {
    if (typeof document === "undefined" || typeof CustomEvent !== "function") return false;
    document.dispatchEvent(new CustomEvent("arena:ui-hook", {
        detail: { name, ...detail },
    }));
    return true;
}

function arenaEntranceOverlay() {
    const particles = Array.from({ length: 14 }, (_, index) =>
        `<i style="--particle:${index}" aria-hidden="true"></i>`).join("");
    return `<div class="arena-v8-entry" role="status" aria-label="Arena yuklanmoqda">
        <div class="arena-v8-entry-particles">${particles}</div>
        <span class="arena-v8-entry-logo"><b>LEVEL</b><strong>GROUP</strong></span>
        <small>ENTERING ARENA</small>
    </div>`;
}

const arenaEntranceState = { cleanupTimer: null };

function arenaCleanupEntranceOverlay(page = document.getElementById("arenaPage")) {
    clearTimeout(arenaEntranceState.cleanupTimer);
    arenaEntranceState.cleanupTimer = null;
    page?.querySelectorAll(".arena-v8-entry").forEach((overlay) => overlay.remove());
}

function arenaScheduleEntranceOverlayCleanup(page) {
    clearTimeout(arenaEntranceState.cleanupTimer);
    globalThis.requestAnimationFrame?.(() => page?.querySelector(".arena-v8-entry")?.classList.add("is-ready"));
    arenaEntranceState.cleanupTimer = setTimeout(() => arenaCleanupEntranceOverlay(page), 1450);
}

function arenaInitializePremiumUi(page) {
    if (!page) return;
    arenaScheduleEntranceOverlayCleanup(page);
    if (page.dataset.arenaPremiumUi === "1") return;
    page.dataset.arenaPremiumUi = "1";
    page.addEventListener("pointerdown", (event) => {
        const button = event.target.closest("button");
        if (!button || button.disabled) return;
        arenaEmitUiHook(ARENA_UI_HOOKS.BUTTON_CLICK, { action: button.dataset.arenaAction || "button" });
        const ripple = document.createElement("i");
        ripple.className = "arena-v8-button-ripple";
        const bounds = button.getBoundingClientRect();
        ripple.style.setProperty("--x", `${event.clientX - bounds.left}px`);
        ripple.style.setProperty("--y", `${event.clientY - bounds.top}px`);
        button.appendChild(ripple);
        setTimeout(() => ripple.remove(), 620);
    });
}

function arenaLiveBadge(status) {
    const states = {
        PLAYING: ["live", "● LIVE"],
        ROOM_READY: ["playing", "PLAYING"],
        WAITING_PLAYER: ["waiting", "WAITING"],
        WAITING_READY: ["waiting", "READY"],
        WAITING_ADMIN: ["review", "REVIEW"],
    };
    const state = states[status];
    return state ? `<span class="arena-v8-live is-${state[0]}">${state[1]}</span>` : "";
}

function arenaPlayerLevel(matches) {
    const value = Math.max(0, Number(matches) || 0);
    return Math.max(1, Math.min(99, Math.floor(value / 5) + 1));
}

function arenaHeroHeader() {
    const profile = arenaTelegramProfile();
    const onlinePlayers = arenaView.dashboard.reduce((total, item) => total + item.onlinePlayers, 0);
    const avatar = profile.photoUrl
        ? `<img src="${arenaEscape(profile.photoUrl)}" alt="" loading="eager" decoding="async"
            onerror="this.remove();this.parentElement.classList.add('is-fallback')">`
        : "";
    return `<header id="arenaPremiumHero" class="arena-v5-hero">
        <div class="arena-v5-identity"><span class="arena-v5-avatar ${avatar ? "" : "is-fallback"}">
            <b>${arenaEscape(profile.initial)}</b>${avatar}</span>
            <span><small>WELCOME BACK</small><strong>${arenaEscape(profile.displayName)}</strong></span></div>
        <span class="arena-v5-online"><i></i>${arenaEscape(onlinePlayers)} ONLINE</span>
        <section><small>LEVEL_GROUP ARENA</small><h2>Ready to Battle</h2>
            <p>Stake tanlang. Raqib toping. G‘alaba qozoning.</p></section>
        <div id="arenaV2Stats">Statistika yuklanmoqda...</div>
    </header>`;
}

function arenaCountdown(target, now = Date.now()) {
    const targetTime = new Date(target).getTime();
    if (!target || Number.isNaN(targetTime)) return "--:--";
    const remaining = Math.max(0, targetTime - Number(now));
    const totalSeconds = Math.floor(remaining / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours ? `${String(hours).padStart(2, "0")}:` : ""}${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function arenaReadyStorageKey(matchId) {
    return `arena-ready-${Number(matchId)}`;
}

function arenaRoleStorageKey(matchId) {
    return `arena-role-${Number(matchId)}`;
}

function rememberArenaRole(matchId, role) {
    if (role !== "creator" && role !== "opponent") return;
    try {
        globalThis.localStorage?.setItem(arenaRoleStorageKey(matchId), role);
    } catch (_) {
        // Role hint is optional; authorization always remains on the backend.
    }
}

function getArenaRole(matchId) {
    try {
        const role = globalThis.localStorage?.getItem(arenaRoleStorageKey(matchId));
        return role === "creator" || role === "opponent" ? role : null;
    } catch (_) {
        return null;
    }
}

function isArenaSelfReady(matchId) {
    try {
        return globalThis.localStorage?.getItem(arenaReadyStorageKey(matchId)) === "1";
    } catch (_) {
        return false;
    }
}

function rememberArenaSelfReady(matchId) {
    try {
        globalThis.localStorage?.setItem(arenaReadyStorageKey(matchId), "1");
    } catch (_) {
        // Storage is optional; backend remains the source of truth.
    }
}

function stopArenaLiveUpdates() {
    if (arenaView.countdownTimer) clearInterval(arenaView.countdownTimer);
    if (arenaView.refreshTimer) clearInterval(arenaView.refreshTimer);
    arenaView.countdownTimer = null;
    arenaView.refreshTimer = null;
    arenaView.detailMatchId = null;
}

function arenaSkeleton() {
    return `<div class="arena-v2-skeleton">${Array.from({ length: 3 }, () =>
        "<div><i></i><b></b><span></span></div>").join("")}</div>`;
}

function arenaState(title, message, retry = true) {
    return `<div class="arena-v2-state"><span>⚔️</span><h3>${arenaEscape(title)}</h3>
        <p>${arenaEscape(message)}</p>${retry ? '<button onclick="retryArenaView()">Qayta urinish</button>' : ""}</div>`;
}

function arenaMatchCard(match, mode = "open") {
    const join = mode === "open" && match.status === "WAITING_PLAYER"
        ? `<button class="arena-v2-join" type="button" onclick="showArenaJoinConfirm(${match.id})">Qo‘shilish</button>`
        : "";
    return `<article class="arena-v2-match-shell" data-match-card="${match.id}">
        <button class="arena-v2-match" type="button" aria-label="Room ${match.id}, ${arenaEscape(match.gameType.replaceAll("_", " "))} tafsilotlari" onclick="loadArenaMatchDetail(${match.id})">
        <div><small>${arenaEscape(match.gameType.replaceAll("_", " "))}</small>
        <em>ROOM #${match.id} · ${arenaEscape(arenaStatus(match.status))}</em></div>
        ${arenaLiveBadge(match.status)}
        <section><span><b>${arenaEscape(match.creatorName)}</b><small>PLAYER 1</small></span>
        <strong>VS</strong><span><b>${arenaEscape(match.opponentName)}</b><small>PLAYER 2</small></span></section>
        <footer><span>${arenaEscape(arenaDate(match.scheduledAt))}</span><b>${arenaEscape(match.stakeEfc)} EFC</b></footer></button>
        ${join}</article>`;
}

async function loadArenaPage() {
    Navbar.setActive("arena");
    showPage("arenaPage", "Arena");
    const page = document.getElementById("arenaPage");
    if (!page) return;
    page.innerHTML = `<div class="arena-v2 arena-v8">
        ${arenaEntranceOverlay()}
        ${arenaHeroHeader()}
        <button id="arenaQuickPlay" class="arena-v5-quick-play" type="button" onclick="startArenaQuickMatch(event)">
            <span>⚡</span><strong>Quick Play</strong><small>${arenaEscape(arenaView.selectedStake)} EFC</small>
        </button>
        ${arenaStakeNavigation()}
        <nav><button data-arena-tab="open">Ochiq</button><button data-arena-tab="history">Tarix</button>
            <button data-arena-tab="create">Yaratish</button><button data-arena-tab="rating">Reyting</button>
            <button data-arena-tab="profile">Profil</button></nav>
        <main id="arenaV2Content">${arenaSkeleton()}</main></div>`;
    page.querySelectorAll("[data-arena-tab]").forEach((button) => {
        button.addEventListener("click", () => loadArenaTab(button.dataset.arenaTab));
    });
    arenaInitializePremiumUi(page);
    try {
        loadArenaDashboard().finally(() => loadArenaStats());
        await loadArenaTab(arenaView.tab);
    } finally {
        arenaCleanupEntranceOverlay(page);
    }
}

async function loadArenaDashboard() {
    try {
        arenaView.dashboard = await arenaApiClient.dashboard();
        const hero = document.getElementById("arenaPremiumHero");
        if (hero) hero.outerHTML = arenaHeroHeader();
        const lobby = document.querySelector(".arena-v3-lobby");
        if (lobby) lobby.outerHTML = arenaStakeNavigation();
    } catch (_) {
        const lobby = document.querySelector(".arena-v3-lobby");
        if (lobby) lobby.classList.add("has-metric-error");
    }
}

async function loadArenaStats() {
    const target = document.getElementById("arenaV2Stats");
    if (!target) return;
    try {
        const stats = await arenaApiClient.profile();
        arenaView.playerProfile = stats;
        target.innerHTML = `<b>${arenaEscape(stats.totalMatches)}</b> match · <b>${arenaEscape(stats.wins)}</b> g‘alaba · <b>${arenaEscape(stats.winRate)}%</b> win rate`;
    } catch (_) {
        target.textContent = "Shaxsiy statistika vaqtincha mavjud emas";
    }
}

async function loadArenaTab(tab) {
    if (arenaView.loading) return;
    stopArenaLiveUpdates();
    arenaView.tab = tab;
    arenaView.loading = true;
    const content = document.getElementById("arenaV2Content");
    if (!content) {
        arenaView.loading = false;
        return;
    }
    document.querySelectorAll("[data-arena-tab]").forEach((button) =>
        button.classList.toggle("active", button.dataset.arenaTab === tab));
    content.innerHTML = arenaSkeleton();
    try {
        if (tab === "open") {
            const matches = await arenaApiClient.openMatches();
            const visibleMatches = arenaMatchesForStake(matches);
            content.innerHTML = visibleMatches.length
                ? `<div class="arena-v2-list">${visibleMatches.map((match) => arenaMatchCard(match, tab)).join("")}</div>`
                : arenaState("Xonalar topilmadi", `${arenaView.selectedStake} EFC uchun hozircha ochiq xona yo‘q. Tez o‘yin yangi xona yaratishi mumkin.`, false);
        } else if (tab === "history") {
            const matches = await arenaApiClient.myMatches({ limit: 100 });
            content.innerHTML = matches.length
                ? `<div class="arena-v7-history" aria-label="Arena match history timeline">${matches.map(arenaHistoryCard).join("")}</div>`
                : arenaPremiumEmpty("history");
        } else if (tab === "create") {
            renderArenaCreateForm();
        } else if (tab === "rating") {
            await loadArenaLeaderboard();
        } else if (tab === "profile") {
            const profile = await arenaApiClient.profile();
            content.innerHTML = arenaProfileView(profile);
            arenaAnimateCounters(content);
        } else {
            const guide = await arenaApiClient.guide();
            content.innerHTML = `<article class="arena-v2-guide"><h3>Arena qo‘llanmasi</h3><p>${arenaEscape(guide.description || guide.guide || "Arena qoidalariga rioya qiling.")}</p></article>`;
        }
    } catch (error) {
        content.innerHTML = arenaState("Arena yuklanmadi", error.message);
    } finally {
        arenaView.loading = false;
    }
}

function arenaIsCurrentPlayer(displayName) {
    const current = arenaTelegramProfile().displayName.trim().toLocaleLowerCase("uz-UZ");
    return Boolean(current && String(displayName || "").trim().toLocaleLowerCase("uz-UZ") === current);
}

function arenaAvatar(displayName, {
    current = false, size = "md", online = false, winner = false, mvp = false, level = null,
} = {}) {
    const name = String(displayName || "O‘yinchi");
    const initial = Array.from(name.trim())[0]?.toLocaleUpperCase("uz-UZ") || "L";
    const photoUrl = current ? arenaTelegramProfile().photoUrl : "";
    return `<span class="arena-v7-avatar is-${arenaEscape(size)} ${photoUrl ? "" : "is-fallback"} ${winner ? "is-winner" : ""}">
        <b>${arenaEscape(initial)}</b>
        ${photoUrl ? `<img src="${arenaEscape(photoUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer"
            onerror="this.remove();this.parentElement.classList.add('is-fallback')">` : ""}
        ${online ? '<i class="arena-v8-avatar-online" aria-label="Online"></i>' : ""}
        ${winner ? '<em class="arena-v8-avatar-crown" aria-label="Winner">♛</em>' : ""}
        ${mvp ? '<strong class="arena-v8-avatar-mvp">MVP</strong>' : ""}
        ${level !== null ? `<small class="arena-v8-avatar-level">LVL ${arenaEscape(level)}</small>` : ""}
    </span>`;
}

function arenaPremiumEmpty(kind) {
    const states = {
        leaderboard: ["♛", "Reyting hali ochilmadi", "Birinchi g‘alaba podium sari ilk qadam."],
        history: ["⚔", "Arena tarixingizni boshlang", "Birinchi matchni o‘ynang va natijangizni shu yerda kuzating."],
        achievements: ["✦", "Badge’lar sizni kutmoqda", "Arena’da o‘ynang, g‘alaba qozoning va premium badge’larni oching."],
    };
    const [icon, title, message] = states[kind] || states.history;
    return `<section class="arena-v7-empty is-${arenaEscape(kind)}"><span aria-hidden="true">${icon}</span>
        <h3>${arenaEscape(title)}</h3><p>${arenaEscape(message)}</p>
        ${kind === "history" ? '<button type="button" onclick="loadArenaTab(\'open\')">Arena boshlash</button>' : ""}
    </section>`;
}

function arenaHistoryCard(match, index = 0) {
    const result = String(match.result || "PENDING").toUpperCase();
    const current = arenaTelegramProfile();
    const opponent = match.opponentName === "Raqib kutilmoqda" ? match.creatorName : match.opponentName;
    const statusClass = ["WIN", "LOSE"].includes(result) ? result.toLowerCase() : "pending";
    return `<article class="arena-v7-history-card result-${statusClass}" style="--arena-order:${index}">
        <i class="arena-v7-history-dot" aria-hidden="true"></i>
        <header><small>ROOM #${match.id}</small><strong class="arena-v7-result-badge">${arenaEscape(result)}</strong></header>
        <section class="arena-v7-history-versus">
            <div>${arenaAvatar(current.displayName, { current: true })}<b>${arenaEscape(current.displayName)}</b></div>
            <span>VS</span>
            <div>${arenaAvatar(opponent)}<b>${arenaEscape(opponent)}</b></div>
        </section>
        <div class="arena-v7-history-meta">
            <span><small>GAME</small><b>${arenaEscape(match.gameType.replaceAll("_", " "))}</b></span>
            <span><small>STAKE</small><b>${arenaEscape(match.stakeEfc)} EFC</b></span>
            <span><small>REWARD</small><b>${arenaEscape(match.reward)} EFC</b></span>
        </div>
        <footer><span>${arenaEscape(arenaDate(match.completedAt || match.createdAt))}</span>
            <b>${arenaEscape(arenaStatus(match.status))}</b></footer>
    </article>`;
}

function arenaAchievementItems(profile) {
    return [
        { icon: "🏆", title: "First Win", note: "Birinchi g‘alaba", unlocked: profile.wins >= 1 },
        { icon: "🔥", title: "Win Streak", note: "3 ta ketma-ket g‘alaba", unlocked: profile.bestStreak >= 3 },
        { icon: "💎", title: "Arena Master", note: "50 ta g‘alaba", unlocked: profile.wins >= 50 },
        { icon: "⭐", title: "Top 100", note: "Leaderboard elitasi", unlocked: false },
    ];
}

function arenaProfileView(profile) {
    const items = [
        ["◎", "Total Matches", profile.totalMatches, ""],
        ["🏆", "Wins", profile.wins, ""],
        ["✕", "Losses", profile.losses, ""],
        ["↗", "Win Rate", profile.winRate, "%"],
        ["◆", "Total EFC Won", Number(profile.totalEfcWon) || 0, " EFC"],
        ["🔥", "Current Streak", profile.currentStreak, ""],
        ["♛", "Best Streak", profile.bestStreak, ""],
    ];
    const achievements = arenaAchievementItems(profile);
    const unlocked = achievements.filter((item) => item.unlocked).length;
    return `<section class="arena-v7-profile">
        <header><small>PLAYER PERFORMANCE</small><h3>Arena statistikasi</h3><p>Natijalaringiz real vaqt statistikasi asosida.</p></header>
        <div class="arena-v7-stat-grid">${items.map(([icon, label, value, suffix], index) =>
            `<article style="--arena-order:${index}"><span>${icon}</span><small>${arenaEscape(label)}</small>
                <b data-arena-counter="${arenaEscape(value)}" data-arena-suffix="${arenaEscape(suffix)}">0${arenaEscape(suffix)}</b></article>`).join("")}</div>
        <section class="arena-v7-achievements"><header><div><small>ACHIEVEMENTS</small><h3>Badge showcase</h3></div>
            <b>${unlocked} / ${achievements.length}</b></header>
            ${unlocked ? `<div>${achievements.map((item, index) => `<article class="${item.unlocked ? "is-unlocked" : "is-locked"}" style="--arena-order:${index}">
                <span>${item.icon}</span><b>${arenaEscape(item.title)}</b><small>${arenaEscape(item.note)}</small>
                <em>${item.unlocked ? "UNLOCKED" : "LOCKED"}</em></article>`).join("")}</div>`
                : arenaPremiumEmpty("achievements")}
        </section>
    </section>`;
}

function arenaAnimateCounters(root) {
    if (!root || typeof requestAnimationFrame !== "function") return;
    const reduceMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    root.querySelectorAll("[data-arena-counter]").forEach((element) => {
        const target = Math.max(0, Number(element.dataset.arenaCounter) || 0);
        const suffix = element.dataset.arenaSuffix || "";
        if (reduceMotion) {
            element.textContent = `${target.toLocaleString("uz-UZ")}${suffix}`;
            return;
        }
        const startedAt = performance.now();
        const tick = (now) => {
            const progress = Math.min(1, (now - startedAt) / 700);
            const value = Math.round(target * (1 - Math.pow(1 - progress, 3)));
            element.textContent = `${value.toLocaleString("uz-UZ")}${suffix}`;
            if (progress < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    });
}

async function loadArenaLeaderboard() {
    const content = document.getElementById("arenaV2Content");
    if (!content) return;
    const data = await arenaApiClient.v4Leaderboard({ period: arenaView.leaderboardPeriod, limit: 100 });
    const podium = data.users.slice(0, 3);
    const remaining = data.users.slice(3);
    content.innerHTML = `<section class="arena-v7-leaderboard">
        <header><small>HALL OF CHAMPIONS</small><h3>Arena Leaderboard</h3></header>
        <nav>${[["weekly", "Weekly"], ["monthly", "Monthly"], ["all", "All Time"]].map(([period, label]) =>
            `<button type="button" class="${period === arenaView.leaderboardPeriod ? "active" : ""}" onclick="selectArenaLeaderboardPeriod('${period}')">${label}</button>`).join("")}</nav>
        ${data.users.length ? `<section class="arena-v7-podium">${podium.map(arenaLeaderboardPodium).join("")}</section>
            <div class="arena-v7-ranking-list">${remaining.map(arenaLeaderboardRow).join("")}</div>`
            : arenaPremiumEmpty("leaderboard")}
    </section>`;
}

function arenaLeaderboardPodium(user, index) {
    const current = arenaIsCurrentPlayer(user.displayName);
    const medals = ["🥇", "🥈", "🥉"];
    const tiers = ["gold", "silver", "bronze"];
    return `<article class="is-${tiers[index]} ${current ? "is-current" : ""}" style="--arena-order:${index}">
        <em>${medals[index]}</em>${arenaAvatar(user.displayName, {
            current, size: "lg", online: current, winner: index === 0, mvp: index === 0,
            level: arenaPlayerLevel(user.totalMatches),
        })}
        <b>${arenaEscape(user.displayName)}</b><small>#${arenaEscape(user.rank)}</small>
        <dl><div><dt>WIN RATE</dt><dd>${arenaEscape(user.winRate)}%</dd></div>
            <div><dt>TOTAL WINS</dt><dd>${arenaEscape(user.wins)}</dd></div></dl>
        ${current ? "<strong>YOU</strong>" : ""}
    </article>`;
}

function arenaLeaderboardRow(user, index = 0) {
    const current = arenaIsCurrentPlayer(user.displayName);
    return `<article class="${current ? "is-current" : ""}" style="--arena-order:${index}">
        <strong>#${arenaEscape(user.rank)}</strong>${arenaAvatar(user.displayName, {
            current, online: current, level: arenaPlayerLevel(user.totalMatches),
        })}
        <div><b>${arenaEscape(user.displayName)}</b><span>${arenaEscape(user.wins)}W · ${arenaEscape(user.losses)}L · ${arenaEscape(user.totalMatches)} match · ${arenaEscape(user.winRate)}% Win Rate</span></div>
        <dl><div><dt>MATCHES</dt><dd>${arenaEscape(user.totalMatches)}</dd></div>
            <div><dt>EFC WON</dt><dd>${arenaEscape(user.totalEfcWon)} EFC</dd></div></dl>
        ${current ? "<em>YOU</em>" : ""}
    </article>`;
}

async function selectArenaLeaderboardPeriod(period) {
    if (!["weekly", "monthly", "all"].includes(period)) return;
    arenaView.leaderboardPeriod = period;
    const content = document.getElementById("arenaV2Content");
    if (content) content.innerHTML = arenaSkeleton();
    try {
        await loadArenaLeaderboard();
    } catch (error) {
        if (content) content.innerHTML = arenaState("Leaderboard yuklanmadi", error.message);
    }
}

async function selectArenaStake(stake) {
    arenaView.selectedStake = arenaStakeValue(stake);
    const quickStake = document.querySelector("#arenaQuickPlay small");
    if (quickStake) quickStake.textContent = `${arenaView.selectedStake} EFC`;
    const lobby = document.querySelector(".arena-v3-lobby");
    if (lobby) lobby.outerHTML = arenaStakeNavigation();
    await loadArenaTab("open");
}

async function startArenaQuickMatch(event) {
    if (arenaView.mutationPending) return;
    arenaQuickPlayRipple(event);
    const stake = arenaView.selectedStake;
    const content = document.getElementById("arenaV2Content");
    if (!content) return;
    content.innerHTML = arenaQuickMatchLoading(stake);
    try {
        const result = await runArenaMutation(async () => {
            const open = arenaMatchesForStake(await arenaApiClient.openMatches(), stake)
                .find((match) => match.status === "WAITING_PLAYER");
            if (open) {
                try {
                    return { match: await arenaApiClient.acceptMatch(open.id, { rulesAccepted: true }), role: "opponent" };
                } catch (error) {
                    if (error.status !== 409) throw error;
                }
            }
            const scheduledAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
            return {
                match: await arenaApiClient.createMatch({
                    gameType: "EFOOTBALL",
                    stakeEfc: stake,
                    scheduledAt,
                    rulesAccepted: true,
                }),
                role: "creator",
            };
        });
        if (!result) return;
        rememberArenaRole(result.match.id, result.role);
        arenaToast(result.role === "opponent" ? "Ochiq xonaga qo‘shildingiz." : "Yangi xona yaratildi.");
        content.innerHTML = `<div class="arena-v2-success"><span>⚡</span><h3>Tez o‘yin tayyor</h3>
            <p>Room #${result.match.id} · ${arenaEscape(stake)} EFC</p>
            <button onclick="loadArenaMatchDetail(${result.match.id})">Xonani ochish</button></div>`;
    } catch (error) {
        arenaToast(error.message, "error");
        renderArenaMutationError(error.message, "startArenaQuickMatch()");
    }
}

function arenaQuickPlayRipple(event) {
    const button = event?.currentTarget;
    if (!button || typeof document === "undefined") return;
    const ripple = document.createElement("i");
    ripple.className = "arena-v5-ripple";
    const bounds = button.getBoundingClientRect();
    ripple.style.setProperty("--ripple-x", `${(event.clientX || bounds.left + bounds.width / 2) - bounds.left}px`);
    ripple.style.setProperty("--ripple-y", `${(event.clientY || bounds.top + bounds.height / 2) - bounds.top}px`);
    button.appendChild(ripple);
    setTimeout(() => ripple.remove(), 650);
}

function arenaToast(message, type = "success") {
    if (typeof document === "undefined") return;
    document.querySelector(".arena-v5-toast")?.remove();
    const toast = document.createElement("div");
    toast.className = `arena-v5-toast ${type}`;
    toast.setAttribute("role", type === "error" ? "alert" : "status");
    toast.textContent = `${type === "error" ? "!" : "✓"} ${String(message || "")}`;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("show"));
    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 250);
    }, 2400);
}

function arenaQuickMatchLoading(stake) {
    return `<section class="arena-v4-matchmaking" role="status" aria-live="polite">
        <div><i></i><i></i><i></i><strong>⚡</strong></div>
        <h3>Raqib qidirilmoqda</h3><p>${arenaEscape(stake)} EFC · Eng mos ochiq xona tekshirilmoqda</p>
    </section>`;
}

function renderArenaCreateForm(draft = arenaView.createDraft || {}) {
    const content = document.getElementById("arenaV2Content");
    if (!content) return;
    const now = new Date(Date.now() + 10 * 60 * 1000);
    const defaultTime = now.toISOString().slice(0, 16);
    content.innerHTML = `<form class="arena-v2-create" onsubmit="prepareArenaCreate(event)">
        <small>YANGI MATCH</small><h3>Arena e’loni yaratish</h3>
        <label>O‘yin turi<select name="gameType" required>
            <option value="EFOOTBALL" ${draft.gameType === "EFOOTBALL" ? "selected" : ""}>eFootball</option>
            <option value="PUBG_MOBILE" ${draft.gameType === "PUBG_MOBILE" ? "selected" : ""}>PUBG Mobile</option>
            <option value="FC_MOBILE" ${draft.gameType === "FC_MOBILE" ? "selected" : ""}>FC Mobile</option>
        </select></label>
        <label>EFC stake<select name="stakeEfc" required>${ARENA_V3_STAKES.map((value) =>
            `<option value="${value}" ${arenaStakeValue(draft.stakeEfc || arenaView.selectedStake) === value ? "selected" : ""}>${value.toLocaleString("uz-UZ")} EFC</option>`).join("")}</select></label>
        <label>Match vaqti<input name="scheduledAt" type="datetime-local" value="${arenaEscape(draft.localTime || defaultTime)}" required></label>
        <label class="arena-v2-rules"><input name="rulesAccepted" type="checkbox" ${draft.rulesAccepted ? "checked" : ""} required><span>Screenshot va video evidence majburiyligini hamda Arena qoidalarini qabul qilaman.</span></label>
        <button class="arena-v2-submit" type="submit">Davom etish</button></form>`;
}

function prepareArenaCreate(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const draft = {
        gameType: form.gameType.value,
        stakeEfc: Number(form.stakeEfc.value),
        localTime: form.scheduledAt.value,
        scheduledAt: new Date(form.scheduledAt.value).toISOString(),
        rulesAccepted: form.rulesAccepted.checked,
    };
    if (!draft.rulesAccepted || !ARENA_V3_STAKES.includes(draft.stakeEfc)) {
        renderArenaMutationError("Stake va qoidalar tasdig‘ini tekshiring.", "renderArenaCreateForm()", draft);
        return;
    }
    arenaView.createDraft = draft;
    const content = document.getElementById("arenaV2Content");
    content.innerHTML = `<div class="arena-v2-confirm"><small>TASDIQLASH</small><h3>Match yaratilsinmi?</h3>
        <div><span>O‘yin</span><b>${arenaEscape(draft.gameType.replaceAll("_", " "))}</b></div>
        <div><span>Stake</span><b>${arenaEscape(draft.stakeEfc)} EFC</b></div>
        <div><span>Vaqt</span><b>${arenaEscape(arenaDate(draft.scheduledAt))}</b></div>
        <button class="arena-v2-submit" onclick="confirmArenaCreate()">Tasdiqlash</button>
        <button class="arena-v2-cancel" onclick="renderArenaCreateForm()">Orqaga</button></div>`;
}

async function confirmArenaCreate() {
    const draft = arenaView.createDraft;
    if (!draft) return renderArenaCreateForm();
    const content = document.getElementById("arenaV2Content");
    content.innerHTML = arenaSkeleton();
    try {
        const match = await runArenaMutation(() => arenaApiClient.createMatch(draft));
        if (!match) return;
        rememberArenaRole(match.id, "creator");
        arenaView.createDraft = null;
        content.innerHTML = `<div class="arena-v2-success"><span>✓</span><h3>Xona yaratildi</h3><p>Room #${match.id} raqib kutmoqda.</p><button onclick="loadArenaTab('my')">Mening matchlarim</button></div>`;
    } catch (error) {
        renderArenaMutationError(error.message, "confirmArenaCreate()", draft);
    }
}

function showArenaJoinConfirm(matchId) {
    const content = document.getElementById("arenaV2Content");
    content.innerHTML = `<div class="arena-v2-confirm"><small>MATCH #${Number(matchId)}</small><h3>Matchga qo‘shilasizmi?</h3>
        <label class="arena-v2-rules"><input id="arenaJoinRules" type="checkbox"><span>Evidence va Arena qoidalarini qabul qilaman.</span></label>
        <button class="arena-v2-submit" onclick="confirmArenaJoin(${Number(matchId)})">Qo‘shilishni tasdiqlash</button>
        <button class="arena-v2-cancel" onclick="loadArenaTab('open')">Bekor qilish</button></div>`;
}

async function confirmArenaJoin(matchId) {
    const accepted = document.getElementById("arenaJoinRules")?.checked === true;
    if (!accepted) {
        return renderArenaMutationError("Arena qoidalarini qabul qilish majburiy.", `showArenaJoinConfirm(${Number(matchId)})`);
    }
    const content = document.getElementById("arenaV2Content");
    content.innerHTML = arenaSkeleton();
    try {
        const match = await runArenaMutation(() => arenaApiClient.acceptMatch(matchId, { rulesAccepted: true }));
        if (!match) return;
        rememberArenaRole(match.id, "opponent");
        document.querySelector(`[data-match-card="${Number(matchId)}"]`)?.remove();
        content.innerHTML = `<div class="arena-v2-success"><span>✓</span><h3>Match qabul qilindi</h3><p>Match Mening bo‘limiga qo‘shildi.</p></div>`;
        await loadArenaTab("my");
    } catch (error) {
        renderArenaMutationError(error.message, `showArenaJoinConfirm(${Number(matchId)})`);
    }
}

function renderArenaMutationError(message, retryAction, draft = null) {
    if (draft) arenaView.createDraft = draft;
    const content = document.getElementById("arenaV2Content");
    if (!content) return;
    content.innerHTML = `<div class="arena-v2-state"><span>⚠️</span><h3>Amal bajarilmadi</h3><p>${arenaEscape(message)}</p>
        <button onclick="${arenaEscape(retryAction)}">Qayta urinish</button></div>`;
}

async function loadArenaMatchDetail(matchId) {
    const content = document.getElementById("arenaV2Content");
    if (!content || arenaView.loading) return;
    arenaView.loading = true;
    content.innerHTML = arenaSkeleton();
    try {
        const match = await arenaApiClient.match(matchId);
        if (!arenaView.playerProfile) {
            try {
                arenaView.playerProfile = await arenaApiClient.profile();
            } catch (_) {
                // Player statistics are presentational; match controls remain available.
            }
        }
        renderArenaMatchDetail(match);
        startArenaLiveUpdates(match.id);
    } catch (error) {
        content.innerHTML = `<div class="arena-v2-state"><span>⚔️</span><h3>Match ochilmadi</h3>
            <p>${arenaEscape(error.message)}</p><button onclick="loadArenaMatchDetail(${Number(matchId)})">Qayta urinish</button></div>`;
    } finally {
        arenaView.loading = false;
    }
}

function arenaMatchStage(match) {
    if (match.status === "COMPLETED" || match.status === "CANCELLED") return 5;
    if (match.status === "WAITING_ADMIN") return 4;
    if (match.status === "PLAYING" && (match.myScreenshotUploaded || match.myVideoUploaded)) return 3;
    if (match.status === "PLAYING" || match.status === "ROOM_READY" || match.status === "TECHNICAL_REVIEW") return 2;
    if (match.status === "WAITING_READY") return 1;
    return 0;
}

function arenaPlayerCard({
    name, photoUrl = "", isCurrent = false, profile = null, winner = false, mvp = false,
}) {
    const displayName = String(name || "O‘yinchi");
    const initial = Array.from(displayName.trim())[0]?.toUpperCase() || "L";
    const safePhoto = arenaSafeAvatarUrl(photoUrl);
    const level = profile ? arenaPlayerLevel(profile.totalMatches) : null;
    return `<section class="arena-v6-player ${isCurrent ? "is-current" : ""} ${winner ? "is-winner" : ""}">
        <span class="arena-v6-player-avatar ${safePhoto ? "" : "is-fallback"}">
            <b>${arenaEscape(initial)}</b>
            ${safePhoto ? `<img src="${arenaEscape(safePhoto)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}
            ${isCurrent ? '<i class="arena-v8-avatar-online" aria-label="Online"></i>' : ""}
            ${winner ? '<em class="arena-v8-avatar-crown" aria-label="Winner">♛</em>' : ""}
            ${mvp ? '<strong class="arena-v8-avatar-mvp">MVP</strong>' : ""}
            ${level ? `<small class="arena-v8-avatar-level">LVL ${level}</small>` : ""}
        </span>
        <div><strong>${arenaEscape(displayName)}</strong>
            <small><i></i>${isCurrent ? "ONLINE" : "RAQIB"}</small></div>
        <dl><div><dt>Win rate</dt><dd>${profile ? `${arenaEscape(profile.winRate)}%` : "—"}</dd></div>
            <div><dt>Matches</dt><dd>${profile ? arenaEscape(profile.totalMatches) : "—"}</dd></div></dl>
    </section>`;
}

function arenaMatchRoomHeader(match) {
    const role = getArenaRole(match.id);
    const telegram = arenaTelegramProfile();
    const creatorCurrent = role === "creator";
    const opponentCurrent = role === "opponent";
    const result = String(match.result || "").toUpperCase();
    const currentWon = match.status === "COMPLETED" && result === "WIN";
    const creatorWinner = currentWon ? creatorCurrent : result === "LOSE" && opponentCurrent;
    const opponentWinner = currentWon ? opponentCurrent : result === "LOSE" && creatorCurrent;
    const creator = arenaPlayerCard({
        name: match.creatorName,
        photoUrl: creatorCurrent ? telegram.photoUrl : "",
        isCurrent: creatorCurrent,
        profile: creatorCurrent ? arenaView.playerProfile : null,
        winner: creatorWinner,
        mvp: creatorWinner,
    });
    const opponent = arenaPlayerCard({
        name: match.opponentName,
        photoUrl: opponentCurrent ? telegram.photoUrl : "",
        isCurrent: opponentCurrent,
        profile: opponentCurrent ? arenaView.playerProfile : null,
        winner: opponentWinner,
        mvp: opponentWinner,
    });
    return `<header class="arena-v6-room-header">
        ${creator}<div class="arena-v6-versus" aria-label="versus"><span>VS</span><i></i></div>${opponent}
    </header>`;
}

function arenaMatchTimeline(match) {
    const activeStage = arenaMatchStage(match);
    const stages = [
        ["⌛", "WAITING"], ["✓", "READY"], ["⚔", "PLAYING"],
        ["⬆", "UPLOAD"], ["⌕", "ADMIN REVIEW"], ["★", "FINISHED"],
    ];
    return `<ol class="arena-v6-timeline" aria-label="Match status progress">${stages.map(([icon, label], index) =>
        `<li class="${index < activeStage ? "is-complete" : ""} ${index === activeStage ? "is-active" : ""}"
            ${index === activeStage ? 'aria-current="step"' : ""}>
            <span>${icon}</span><b>${label}</b>
        </li>`).join("")}</ol>`;
}

function arenaMatchResult(match) {
    if (match.status !== "COMPLETED") return "";
    const role = getArenaRole(match.id);
    const result = String(match.result || "").toUpperCase();
    let winner = "G‘olib aniqlandi";
    if (role && (result === "WIN" || result === "LOSE")) {
        const currentWon = result === "WIN";
        const creatorWon = role === "creator" ? currentWon : !currentWon;
        winner = creatorWon ? match.creatorName : match.opponentName;
    }
    return `<section class="arena-v6-result">
        <header><span>🏆</span><div><small>WINNER</small><h4>${arenaEscape(winner)}</h4></div></header>
        <div><article><span>Stake</span><b>${arenaEscape(match.stakeEfc)} EFC</b></article>
            <article><span>Reward</span><b>${arenaEscape(match.winnerReward)} EFC</b></article>
            <article><span>Platforma komissiyasi</span><b>5%</b></article></div>
    </section>`;
}

function arenaPremiumModal(match, { selfReady = false } = {}) {
    let type = "";
    let icon = "⌛";
    let title = "";
    let message = "";
    const result = String(match.result || "").toUpperCase();
    if (match.status === "COMPLETED" && result === "WIN") {
        [type, icon, title, message] = ["victory", "♛", "VICTORY", "Arena g‘alabasi sizniki."];
    } else if (match.status === "COMPLETED" && result === "LOSE") {
        [type, icon, title, message] = ["defeat", "◆", "DEFEAT", "Keyingi jang uchun kuchliroq qayting."];
    } else if (match.status === "WAITING_READY" && !selfReady) {
        [type, icon, title, message] = ["ready", "⚡", "READY?", "Matchga tayyor ekaningizni tasdiqlang."];
    } else if (match.status === "WAITING_PLAYER" || match.status === "WAITING_ADMIN") {
        [type, icon, title, message] = ["waiting", "⌛", "WAITING", match.status === "WAITING_ADMIN"
            ? "Admin natijani tekshirmoqda." : "Raqib ulanmoqda."];
    }
    if (!type) return "";
    return `<section class="arena-v8-modal is-${type}" role="dialog" aria-modal="false" aria-label="${title}">
        <button type="button" class="arena-v8-modal-close" aria-label="Yopish" onclick="closeArenaPremiumModal(this)">×</button>
        <span>${icon}</span><small>LEVEL_GROUP ARENA</small><h3>${title}</h3><p>${message}</p>
        ${type === "ready" ? `<button type="button" onclick="submitArenaReady(${match.id})">TAYYORMAN</button>` : ""}
    </section>`;
}

function closeArenaPremiumModal(button) {
    button?.closest(".arena-v8-modal")?.classList.add("is-closing");
    setTimeout(() => button?.closest(".arena-v8-modal")?.remove(), 240);
}

function renderArenaMatchDetail(match, { readyPending = false, notice = "" } = {}) {
    const content = document.getElementById("arenaV2Content");
    if (!content) return;
    const readyWindowOpen = match.status === "WAITING_READY";
    const selfReady = isArenaSelfReady(match.id);
    const bothReady = match.creatorReady && match.opponentReady;
    const readyTarget = match.readyDeadlineAt || match.scheduledAt;
    const roomPanel = renderArenaRoomPanel(match);
    const evidencePanel = renderArenaEvidencePanel(match);
    content.innerHTML = `<article class="arena-v2-detail arena-v2-live arena-v6-room status-${arenaEscape(String(match.status).toLowerCase())}"><button onclick="loadArenaTab('${arenaView.tab}')">← Orqaga</button>
        <div class="arena-v6-room-label"><span>ROOM #${match.id}</span><b class="arena-v2-status-live">${arenaEscape(arenaStatus(match.status))}</b>${arenaLiveBadge(match.status)}</div>
        ${arenaPremiumModal(match, { selfReady })}
        ${arenaMatchRoomHeader(match)}
        ${arenaMatchTimeline(match)}
        <section class="arena-v6-match-meta">
            <article><span>O‘yin</span><b>${arenaEscape(match.gameType.replaceAll("_", " "))}</b></article>
            <article><span>Stake</span><b>${arenaEscape(match.stakeEfc)} EFC</b></article>
            <article><span>Jami pot</span><b>${arenaEscape(match.totalPool)} EFC</b></article>
            <article><span>Boshlanishi</span><b>${arenaEscape(arenaDate(match.scheduledAt))}</b></article>
        </section>
        ${arenaMatchResult(match)}
        <section class="arena-v2-countdown ${readyWindowOpen ? "is-live" : ""}">
            <small>${readyWindowOpen ? "READY OYNASI" : "MATCH BOSHLANISHIGA"}</small>
            <strong id="arenaCountdown" data-target="${arenaEscape(readyTarget || "")}">${arenaCountdown(readyTarget)}</strong>
        </section>
        ${readyWindowOpen ? `<section class="arena-v2-ready-panel">
            <div><span>Player 1</span><b class="${match.creatorReady ? "is-ready" : ""}">${match.creatorReady ? "Tayyor" : "Kutilmoqda"}</b></div>
            <div><span>Player 2</span><b class="${match.opponentReady ? "is-ready" : ""}">${match.opponentReady ? "Tayyor" : "Kutilmoqda"}</b></div>
            ${selfReady || bothReady
                ? '<p class="arena-v2-ready-success">✓ Siz tayyorsiz. Ikkinchi o‘yinchi holati avtomatik yangilanadi.</p>'
                : `<button class="arena-v2-ready-button" ${readyPending ? "disabled" : ""} onclick="submitArenaReady(${match.id})">${readyPending ? "Saqlanmoqda..." : "✓ TAYYORMAN"}</button>`}
        </section>` : ""}
        ${roomPanel}
        ${evidencePanel}
        ${match.status === "WAITING_ADMIN" ? `<section class="arena-v2-admin-wait">
            <span>✓</span><div><b>Evidence qabul qilindi</b><p>Admin natijani tekshirmoqda.</p></div>
        </section>` : ""}
        ${notice ? `<p class="arena-v2-live-notice">${arenaEscape(notice)}</p>` : ""}
    </article>`;
    updateArenaCountdown();
}

function renderArenaEvidencePanel(match) {
    if (match.status !== "PLAYING") return "";
    const completed = Number(match.myScreenshotUploaded) + Number(match.myVideoUploaded);
    const done = completed === 2;
    return `<section class="arena-v2-evidence-panel ${done ? "is-complete" : ""}">
        <header><div><small>EVIDENCE PROGRESS</small><h4>${done ? "Evidence to‘liq topshirildi" : "Dalillarni Botga yuboring"}</h4></div>
            <strong>${completed} / 2</strong></header>
        <div class="arena-v2-progress"><i style="width:${completed * 50}%"></i></div>
        <article><span>📷</span><div><b>Screenshot</b><small>${match.myScreenshotUploaded ? "Yuborildi" : "Kutilyapti"}</small></div>
            ${match.myScreenshotUploaded ? '<em class="is-done">✓</em>' : `<button onclick="openArenaEvidenceBot(${match.id}, 'screenshot')">Botga yuborish</button>`}</article>
        <article><span>🎥</span><div><b>Video</b><small>${match.myVideoUploaded ? "Yuborildi" : "Kutilyapti"}</small></div>
            ${match.myVideoUploaded ? '<em class="is-done">✓</em>' : `<button onclick="openArenaEvidenceBot(${match.id}, 'video')">Botga yuborish</button>`}</article>
        <p>${done ? "Sizning dalillaringiz to‘liq. Har ikki o‘yinchi topshirgach status WAITING_ADMIN bo‘ladi va Admin tekshiradi." : completed === 1 ? "Yana bitta evidence qoldi." : "Screenshot va video majburiy — har bir o‘yinchi ikkalasini ham topshiradi."}</p>
    </section>`;
}

function openArenaEvidenceBot(matchId, evidenceType) {
    const webApp = globalThis.Telegram?.WebApp;
    try {
        webApp?.HapticFeedback?.impactOccurred?.("light");
        if (typeof webApp?.close === "function") {
            webApp.close();
            return true;
        }
    } catch (_) {
        // Fall through to the safe browser-preview message.
    }
    const content = typeof document !== "undefined" ? document.getElementById("arenaV2Content") : null;
    const typeLabel = evidenceType === "video" ? "videoni" : "screenshotni";
    if (content) {
        const notice = document.createElement("p");
        notice.className = "arena-v2-live-notice";
        notice.textContent = `Telegram Bot chatiga qaytib, Match #${Number(matchId)} uchun ${typeLabel} yuboring.`;
        content.querySelector(".arena-v2-live-notice")?.remove();
        content.appendChild(notice);
    }
    return false;
}

function renderArenaRoomPanel(match, { pending = false } = {}) {
    if (match.status !== "ROOM_READY") return "";
    const role = getArenaRole(match.id);
    if (match.roomCode) {
        return `<section class="arena-v2-room-panel has-code">
            <small>ROOM CODE</small><strong>${arenaEscape(match.roomCode)}</strong>
            <p>${role === "creator" ? "Room code saqlandi." : "Creator yuborgan room code."}</p>
            <button onclick="copyArenaRoomCode(this)">Nusxalash</button>
        </section>`;
    }
    if (role === "creator") {
        return `<section class="arena-v2-room-panel creator">
            <small>CREATOR PANEL</small><h4>Room code kiriting</h4>
            <p>Room code faqat bir marta yuboriladi va keyin o‘zgartirilmaydi.</p>
            <input id="arenaRoomCodeInput" type="text" maxlength="64" autocomplete="off" placeholder="Room code" ${pending ? "disabled" : ""}>
            <button class="arena-v2-room-submit" ${pending ? "disabled" : ""} onclick="submitArenaRoomCode(${match.id})">${pending ? "Saqlanmoqda..." : "Room codeni yuborish"}</button>
        </section>`;
    }
    return `<section class="arena-v2-room-panel opponent">
        <small>${role === "opponent" ? "OPPONENT PANEL" : "ROOM PANEL"}</small><h4>Room code kutilmoqda</h4>
        <p>Room codeni faqat Creator kiritadi. Kod paydo bo‘lganda bu panel avtomatik yangilanadi.</p>
        <span class="arena-v2-room-wait">••••••</span>
    </section>`;
}

async function submitArenaRoomCode(matchId) {
    if (arenaView.mutationPending || getArenaRole(matchId) !== "creator") return;
    const input = document.getElementById("arenaRoomCodeInput");
    const roomCode = String(input?.value || "").trim();
    if (!roomCode) {
        input?.focus();
        return;
    }
    let current;
    try {
        current = await arenaApiClient.match(matchId);
        if (current.status !== "ROOM_READY" || current.roomCode) {
            throw new ArenaApiError("Room code holati o‘zgargan.", { status: 409 });
        }
        const content = document.getElementById("arenaV2Content");
        if (content) content.querySelector(".arena-v2-room-panel")?.replaceWith(arenaHtmlElement(renderArenaRoomPanel(current, { pending: true })));
        const match = await runArenaMutation(() => arenaApiClient.setRoomCode(matchId, roomCode));
        if (!match) return;
        renderArenaMatchDetail(match, { notice: "Room code muvaffaqiyatli saqlandi." });
    } catch (error) {
        if (current) renderArenaMatchDetail(current, { notice: error.message });
        else {
            const content = document.getElementById("arenaV2Content");
            if (content) content.innerHTML = `<div class="arena-v2-state"><span>⚠️</span><h3>Room code saqlanmadi</h3>
                <p>${arenaEscape(error.message)}</p><button onclick="loadArenaMatchDetail(${Number(matchId)})">Qayta urinish</button></div>`;
        }
    }
}

function arenaHtmlElement(html) {
    const template = document.createElement("template");
    template.innerHTML = html.trim();
    return template.content.firstElementChild;
}

async function copyArenaRoomCode(button) {
    try {
        const roomCode = button?.closest(".arena-v2-room-panel")?.querySelector("strong")?.textContent;
        if (!roomCode || !globalThis.navigator?.clipboard?.writeText) return false;
        await globalThis.navigator.clipboard.writeText(roomCode);
        if (button) button.textContent = "Nusxalandi ✓";
        return true;
    } catch (_) {
        if (button) button.textContent = "Nusxalab bo‘lmadi";
        return false;
    }
}

function updateArenaCountdown(now = Date.now()) {
    const target = document.getElementById("arenaCountdown");
    if (!target) return null;
    const value = arenaCountdown(target.dataset.target, now);
    target.textContent = value;
    target.classList.toggle("is-expired", value === "00:00");
    return value;
}

function startArenaLiveUpdates(matchId) {
    stopArenaLiveUpdates();
    arenaView.detailMatchId = Number(matchId);
    arenaView.countdownTimer = setInterval(() => updateArenaCountdown(), 1000);
    arenaView.refreshTimer = setInterval(() => refreshArenaMatchStatus(matchId), 10000);
}

async function refreshArenaMatchStatus(matchId) {
    if (arenaView.detailMatchId !== Number(matchId) || arenaView.mutationPending) return;
    try {
        const match = await arenaApiClient.match(matchId);
        if (arenaView.detailMatchId === Number(matchId)) renderArenaMatchDetail(match);
    } catch (_) {
        // Keep the last safe state; the next interval retries the read.
    }
}

async function submitArenaReady(matchId) {
    if (arenaView.mutationPending) return;
    let current;
    try {
        current = await arenaApiClient.match(matchId);
        if (current.status !== "WAITING_READY") {
            throw new ArenaApiError("Ready oynasi hozir ochiq emas.", { status: 409 });
        }
        renderArenaMatchDetail(current, { readyPending: true });
        const match = await runArenaMutation(() => arenaApiClient.readyMatch(matchId));
        if (!match) return;
        rememberArenaSelfReady(matchId);
        renderArenaMatchDetail(match, { notice: "Ready holatingiz saqlandi." });
    } catch (error) {
        if (current) {
            renderArenaMatchDetail(current, { notice: error.message });
        } else {
            const content = document.getElementById("arenaV2Content");
            if (content) content.innerHTML = `<div class="arena-v2-state"><span>⚠️</span><h3>Ready saqlanmadi</h3>
                <p>${arenaEscape(error.message)}</p><button onclick="loadArenaMatchDetail(${Number(matchId)})">Qayta urinish</button></div>`;
        }
    }
}

function retryArenaView() {
    loadArenaTab(arenaView.tab);
}

Object.assign(globalThis, {
    loadArenaPage, loadArenaTab, loadArenaMatchDetail, retryArenaView,
    arenaCleanupEntranceOverlay,
    selectArenaStake, startArenaQuickMatch,
    selectArenaLeaderboardPeriod,
    arenaToast,
    prepareArenaCreate, confirmArenaCreate, renderArenaCreateForm,
    showArenaJoinConfirm, confirmArenaJoin,
    submitArenaReady, updateArenaCountdown,
    submitArenaRoomCode, copyArenaRoomCode,
    openArenaEvidenceBot,
    closeArenaPremiumModal,
});

if (typeof module !== "undefined") {
    module.exports = {
        ArenaApiClient,
        ArenaApiError,
        normalizeMatch,
        normalizeMatchList,
        ARENA_V3_STAKES,
        arenaStakeValue,
        arenaMatchesForStake,
        arenaStakeNavigation,
        arenaWaitTime,
        arenaSafeAvatarUrl,
        arenaTelegramProfile,
        arenaHeroHeader,
        normalizeArenaStakeMetrics,
        normalizeArenaProfile,
        normalizeArenaLeaderboardUser,
        arenaHistoryCard,
        arenaProfileView,
        arenaLeaderboardRow,
        arenaLeaderboardPodium,
        arenaPremiumEmpty,
        arenaAchievementItems,
        arenaAnimateCounters,
        ARENA_UI_HOOKS,
        arenaEmitUiHook,
        arenaEntranceOverlay,
        arenaCleanupEntranceOverlay,
        arenaScheduleEntranceOverlayCleanup,
        arenaLiveBadge,
        arenaPlayerLevel,
        arenaPremiumModal,
        arenaQuickMatchLoading,
        arenaQuickPlayRipple,
        arenaToast,
        arenaSkeleton,
        arenaState,
        runArenaMutation,
        arenaCountdown,
        renderArenaMatchDetail,
        updateArenaCountdown,
        renderArenaRoomPanel,
        copyArenaRoomCode,
        renderArenaEvidencePanel,
        openArenaEvidenceBot,
    };
}
