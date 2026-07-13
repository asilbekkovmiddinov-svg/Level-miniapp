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
        fetchImpl = globalThis.fetch,
        initDataProvider = () => globalThis.Telegram?.WebApp?.initData || "",
    } = {}) {
        this.baseUrl = String(baseUrl).replace(/\/$/, "");
        this.timeoutMs = Math.max(50, Number(timeoutMs) || 10000);
        this.retries = Math.max(0, Number(retries) || 0);
        this.fetchImpl = fetchImpl;
        this.initDataProvider = initDataProvider;
    }

    async request(path, { query = null } = {}) {
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
        for (let attempt = 0; attempt <= this.retries; attempt += 1) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), this.timeoutMs);
            try {
                const response = await this.fetchImpl(`${this.baseUrl}${path}${suffix}`, {
                    method: "GET",
                    headers: { "X-Telegram-Init-Data": initData },
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
                    if (retryable && attempt < this.retries) continue;
                    throw new ArenaApiError(arenaHttpMessage(response.status), {
                        status: response.status,
                        retryable,
                    });
                }
                return payload;
            } catch (error) {
                if (error instanceof ArenaApiError) throw error;
                const timeout = error?.name === "AbortError";
                if (attempt < this.retries) continue;
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
        creatorReady: Boolean(value.creator_ready),
        opponentReady: Boolean(value.opponent_ready),
        roomCode: value.room_code || null,
        resultType: value.result_type || null,
    };
}

function normalizeMatchList(value) {
    if (!value || !Array.isArray(value.matches)) {
        throw new ArenaApiError("Arena matchlar ro‘yxati noto‘g‘ri formatda.");
    }
    return value.matches.map(normalizeMatch);
}

const arenaApiClient = new ArenaApiClient();
const arenaView = { tab: "open", loading: false };

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

function arenaSkeleton() {
    return `<div class="arena-v2-skeleton">${Array.from({ length: 3 }, () =>
        "<div><i></i><b></b><span></span></div>").join("")}</div>`;
}

function arenaState(title, message, retry = true) {
    return `<div class="arena-v2-state"><span>⚔️</span><h3>${arenaEscape(title)}</h3>
        <p>${arenaEscape(message)}</p>${retry ? '<button onclick="retryArenaView()">Qayta urinish</button>' : ""}</div>`;
}

function arenaMatchCard(match) {
    return `<button class="arena-v2-match" onclick="loadArenaMatchDetail(${match.id})">
        <div><small>${arenaEscape(match.gameType.replaceAll("_", " "))}</small>
        <em>${arenaEscape(arenaStatus(match.status))}</em></div>
        <section><span><b>${arenaEscape(match.creatorName)}</b><small>PLAYER 1</small></span>
        <strong>VS</strong><span><b>${arenaEscape(match.opponentName)}</b><small>PLAYER 2</small></span></section>
        <footer><span>${arenaEscape(arenaDate(match.scheduledAt))}</span><b>${arenaEscape(match.stakeEfc)} EFC</b></footer>
    </button>`;
}

async function loadArenaPage() {
    Navbar.setActive("arena");
    showPage("arenaPage", "Arena");
    const page = document.getElementById("arenaPage");
    if (!page) return;
    page.innerHTML = `<div class="arena-v2">
        <header><small>LEVEL_GROUP</small><h2>Battle Arena</h2><p>Raqobat. Mahorat. G‘alaba.</p>
            <div id="arenaV2Stats">Statistika yuklanmoqda...</div></header>
        <nav><button data-arena-tab="open">Ochiq</button><button data-arena-tab="my">Mening</button>
            <button data-arena-tab="rating">Reyting</button><button data-arena-tab="guide">Qo‘llanma</button></nav>
        <main id="arenaV2Content">${arenaSkeleton()}</main></div>`;
    page.querySelectorAll("[data-arena-tab]").forEach((button) => {
        button.addEventListener("click", () => loadArenaTab(button.dataset.arenaTab));
    });
    loadArenaStats();
    await loadArenaTab(arenaView.tab);
}

async function loadArenaStats() {
    const target = document.getElementById("arenaV2Stats");
    if (!target) return;
    try {
        const stats = await arenaApiClient.stats();
        target.innerHTML = `<b>${arenaEscape(stats.total_matches ?? 0)}</b> match · <b>${arenaEscape(stats.wins ?? 0)}</b> g‘alaba · <b>${arenaEscape(stats.rating ?? 0)}</b> reyting`;
    } catch (_) {
        target.textContent = "Shaxsiy statistika vaqtincha mavjud emas";
    }
}

async function loadArenaTab(tab) {
    if (arenaView.loading) return;
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
        if (tab === "open" || tab === "my") {
            const matches = tab === "open"
                ? await arenaApiClient.openMatches()
                : await arenaApiClient.myMatches();
            content.innerHTML = matches.length
                ? `<div class="arena-v2-list">${matches.map(arenaMatchCard).join("")}</div>`
                : arenaState("Matchlar topilmadi", tab === "open" ? "Hozircha ochiq match yo‘q." : "Sizda hali Arena matchlari yo‘q.", false);
        } else if (tab === "rating") {
            const data = await arenaApiClient.leaderboard();
            content.innerHTML = data.users.length
                ? `<div class="arena-v2-ranking">${data.users.map((user, index) => `<div><b>#${index + 1}</b><span>${arenaEscape(user.display_name || "O‘yinchi")}</span><strong>${arenaEscape(user.rating ?? 0)}</strong></div>`).join("")}</div>`
                : arenaState("Reyting bo‘sh", "Hali reyting ma’lumotlari yo‘q.", false);
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

async function loadArenaMatchDetail(matchId) {
    const content = document.getElementById("arenaV2Content");
    if (!content || arenaView.loading) return;
    arenaView.loading = true;
    content.innerHTML = arenaSkeleton();
    try {
        const match = await arenaApiClient.match(matchId);
        content.innerHTML = `<article class="arena-v2-detail"><button onclick="loadArenaTab('${arenaView.tab}')">← Orqaga</button>
            <small>MATCH #${match.id}</small><h3>${arenaEscape(match.creatorName)} <i>VS</i> ${arenaEscape(match.opponentName)}</h3>
            <div><span>Status</span><b>${arenaEscape(arenaStatus(match.status))}</b></div>
            <div><span>O‘yin</span><b>${arenaEscape(match.gameType.replaceAll("_", " "))}</b></div>
            <div><span>Stake</span><b>${arenaEscape(match.stakeEfc)} EFC</b></div>
            <div><span>Mukofot</span><b>${arenaEscape(match.winnerReward)} EFC</b></div>
            <div><span>Vaqt</span><b>${arenaEscape(arenaDate(match.scheduledAt))}</b></div></article>`;
    } catch (error) {
        content.innerHTML = arenaState("Match ochilmadi", error.message);
    } finally {
        arenaView.loading = false;
    }
}

function retryArenaView() {
    loadArenaTab(arenaView.tab);
}

Object.assign(globalThis, { loadArenaPage, loadArenaTab, loadArenaMatchDetail, retryArenaView });

if (typeof module !== "undefined") {
    module.exports = {
        ArenaApiClient,
        ArenaApiError,
        normalizeMatch,
        normalizeMatchList,
        arenaSkeleton,
        arenaState,
    };
}
