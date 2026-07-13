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
const arenaView = {
    tab: "open",
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
        ? `<button class="arena-v2-join" onclick="event.stopPropagation();showArenaJoinConfirm(${match.id})">Qo‘shilish</button>`
        : "";
    return `<article class="arena-v2-match" data-match-card="${match.id}" onclick="loadArenaMatchDetail(${match.id})">
        <div><small>${arenaEscape(match.gameType.replaceAll("_", " "))}</small>
        <em>${arenaEscape(arenaStatus(match.status))}</em></div>
        <section><span><b>${arenaEscape(match.creatorName)}</b><small>PLAYER 1</small></span>
        <strong>VS</strong><span><b>${arenaEscape(match.opponentName)}</b><small>PLAYER 2</small></span></section>
        <footer><span>${arenaEscape(arenaDate(match.scheduledAt))}</span><b>${arenaEscape(match.stakeEfc)} EFC</b></footer>
        ${join}</article>`;
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
            <button data-arena-tab="create">Yaratish</button><button data-arena-tab="rating">Reyting</button>
            <button data-arena-tab="guide">Qo‘llanma</button></nav>
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
        if (tab === "open" || tab === "my") {
            const matches = tab === "open"
                ? await arenaApiClient.openMatches()
                : await arenaApiClient.myMatches();
            content.innerHTML = matches.length
                ? `<div class="arena-v2-list">${matches.map((match) => arenaMatchCard(match, tab)).join("")}</div>`
                : arenaState("Matchlar topilmadi", tab === "open" ? "Hozircha ochiq match yo‘q." : "Sizda hali Arena matchlari yo‘q.", false);
        } else if (tab === "create") {
            renderArenaCreateForm();
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
        <label>EFC stake<input name="stakeEfc" type="number" inputmode="decimal" min="1" step="1" value="${arenaEscape(draft.stakeEfc || "100")}" required></label>
        <div class="arena-v2-stakes">${[50, 100, 250, 500].map((value) => `<button type="button" onclick="this.form.stakeEfc.value=${value}">${value} EFC</button>`).join("")}</div>
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
    if (!draft.rulesAccepted || !Number.isFinite(draft.stakeEfc) || draft.stakeEfc <= 0) {
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
        content.innerHTML = `<div class="arena-v2-success"><span>✓</span><h3>Match yaratildi</h3><p>Match #${match.id} raqib kutmoqda.</p><button onclick="loadArenaTab('my')">Mening matchlarim</button></div>`;
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
        renderArenaMatchDetail(match);
        startArenaLiveUpdates(match.id);
    } catch (error) {
        content.innerHTML = `<div class="arena-v2-state"><span>⚔️</span><h3>Match ochilmadi</h3>
            <p>${arenaEscape(error.message)}</p><button onclick="loadArenaMatchDetail(${Number(matchId)})">Qayta urinish</button></div>`;
    } finally {
        arenaView.loading = false;
    }
}

function renderArenaMatchDetail(match, { readyPending = false, notice = "" } = {}) {
    const content = document.getElementById("arenaV2Content");
    if (!content) return;
    const readyWindowOpen = match.status === "WAITING_READY";
    const selfReady = isArenaSelfReady(match.id);
    const bothReady = match.creatorReady && match.opponentReady;
    const readyTarget = match.readyDeadlineAt || match.scheduledAt;
    const roomPanel = renderArenaRoomPanel(match);
    content.innerHTML = `<article class="arena-v2-detail arena-v2-live"><button onclick="loadArenaTab('${arenaView.tab}')">← Orqaga</button>
        <small>MATCH #${match.id}</small><h3>${arenaEscape(match.creatorName)} <i>VS</i> ${arenaEscape(match.opponentName)}</h3>
        <div><span>Status</span><b class="arena-v2-status-live">${arenaEscape(arenaStatus(match.status))}</b></div>
        <div><span>O‘yin</span><b>${arenaEscape(match.gameType.replaceAll("_", " "))}</b></div>
        <div><span>Stake</span><b>${arenaEscape(match.stakeEfc)} EFC</b></div>
        <div><span>Mukofot</span><b>${arenaEscape(match.winnerReward)} EFC</b></div>
        <div><span>Match boshlanishi</span><b>${arenaEscape(arenaDate(match.scheduledAt))}</b></div>
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
        ${notice ? `<p class="arena-v2-live-notice">${arenaEscape(notice)}</p>` : ""}
    </article>`;
    updateArenaCountdown();
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
    prepareArenaCreate, confirmArenaCreate, renderArenaCreateForm,
    showArenaJoinConfirm, confirmArenaJoin,
    submitArenaReady, updateArenaCountdown,
    submitArenaRoomCode, copyArenaRoomCode,
});

if (typeof module !== "undefined") {
    module.exports = {
        ArenaApiClient,
        ArenaApiError,
        normalizeMatch,
        normalizeMatchList,
        arenaSkeleton,
        arenaState,
        runArenaMutation,
        arenaCountdown,
        renderArenaMatchDetail,
        updateArenaCountdown,
        renderArenaRoomPanel,
        copyArenaRoomCode,
    };
}
