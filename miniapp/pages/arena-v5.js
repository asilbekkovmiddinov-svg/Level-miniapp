class ArenaV5Error extends Error {
    constructor(message, status = 0) {
        super(message);
        this.name = "ArenaV5Error";
        this.status = status;
    }
}

class ArenaV5Client {
    constructor({
        baseUrl = typeof API_URL !== "undefined" ? API_URL : "",
        fetchImpl = (...args) => globalThis.fetch(...args),
        initDataProvider = () => globalThis.Telegram?.WebApp?.initData || "",
    } = {}) {
        this.baseUrl = String(baseUrl).replace(/\/$/, "");
        this.fetchImpl = fetchImpl;
        this.initDataProvider = initDataProvider;
    }

    async request(path, { method = "GET", body = null, idempotencyKey = null } = {}) {
        const initData = this.initDataProvider();
        if (!initData) throw new ArenaV5Error("Telegram tasdiqlashi topilmadi.", 401);
        let response;
        try {
            response = await this.fetchImpl(`${this.baseUrl}${path}`, {
                method,
                headers: {
                    "X-Telegram-Init-Data": initData,
                    ...(body ? { "Content-Type": "application/json" } : {}),
                    ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
                },
                ...(body ? { body: JSON.stringify(body) } : {}),
            });
        } catch (_) {
            throw new ArenaV5Error("Arena serveri bilan aloqa o‘rnatilmadi.");
        }
        let payload = null;
        try { payload = await response.json(); } catch (_) { /* handled below */ }
        if (!response.ok) {
            const detail = typeof payload?.detail === "string" ? payload.detail : null;
            const fallback = {
                401: "Telegram tasdiqlashi eskirgan.",
                403: "Bu amal uchun ruxsat yo‘q.",
                404: "Arena ma’lumoti topilmadi.",
                409: "Arena holati o‘zgargan. Yangilab qayta urining.",
                422: "Kiritilgan ma’lumot noto‘g‘ri.",
                503: "Arena vaqtincha mavjud emas.",
            }[response.status] || "Arena so‘rovi bajarilmadi.";
            throw new ArenaV5Error(detail || fallback, response.status);
        }
        return payload;
    }

    config() { return this.request("/arena/v5/config"); }
    state() { return this.request("/arena/v5/state"); }
    profile() { return this.request("/arena/v5/profile"); }
    ranking() { return this.request("/arena/v5/ranking?limit=100&offset=0"); }
    history(offset = 0) { return this.request(`/arena/v5/history?limit=20&offset=${offset}`); }
    joinQueue() {
        return this.request("/arena/v5/queue", {
            method: "POST",
            idempotencyKey: arenaV5Key("queue"),
        });
    }
    cancelQueue() { return this.request("/arena/v5/queue", { method: "DELETE" }); }
    updateProfile(efootballUsername) {
        return this.request("/arena/v5/profile", {
            method: "PUT",
            body: { efootball_username: efootballUsername },
        });
    }
}

function arenaV5Key(scope) {
    if (globalThis.crypto?.randomUUID) return `arena-v5:${scope}:${crypto.randomUUID()}`;
    return `arena-v5:${scope}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

function arenaV5Escape(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[character]));
}

function arenaV5Date(value) {
    if (!value) return "—";
    return new Intl.DateTimeFormat("uz-UZ", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
    }).format(new Date(value));
}

function arenaV5SeasonRemaining(value) {
    const milliseconds = Math.max(0, new Date(value).getTime() - Date.now());
    const hours = Math.floor(milliseconds / 3600000);
    const days = Math.floor(hours / 24);
    return `${days} kun ${hours % 24} soat`;
}

const arenaV5Client = new ArenaV5Client();
const arenaV5State = {
    tab: "find",
    config: null,
    matchmaking: null,
    profile: null,
    ranking: null,
    history: null,
    loading: false,
    action: false,
    error: null,
    searchTimer: null,
};

function arenaV5Nav() {
    const items = [
        ["find", "🔍", "Raqib topish"],
        ["profile", "👤", "Profil"],
        ["ranking", "🏆", "Reyting"],
        ["history", "📜", "Tarix"],
    ];
    return `<nav class="arena-v5-nav" aria-label="Arena bo‘limlari">${items.map(([id, icon, label]) => `
        <button type="button" data-arena-v5-tab="${id}" class="${arenaV5State.tab === id ? "active" : ""}">
            <span>${icon}</span><small>${label}</small>
        </button>`).join("")}</nav>`;
}

function arenaV5Header() {
    const config = arenaV5State.config;
    return `<section class="arena-v5-hero">
        <div><span class="arena-v5-kicker">LEVEL_GROUP ARENA</span><h2>eFootball 1v1</h2></div>
        <div class="arena-v5-ticket"><span>🎟</span><b>${config?.ticket_balance ?? "—"}</b><small>Ticket</small></div>
        <div class="arena-v5-season">
            <span><small>Joriy mavsum</small><b>${arenaV5Escape(config?.season_name || "Arena")}</b></span>
            <span><small>Tugashiga</small><b>${config ? arenaV5SeasonRemaining(config.season_end_at) : "—"}</b></span>
        </div>
        <p class="arena-v5-prize">🏆 ${arenaV5Escape(config?.prize_text || "Mavsum sovrinlari tez orada e’lon qilinadi")}</p>
        <p class="arena-v5-rule">1 match = 1 Ticket • G‘alaba +3 • Durang +1 • Mag‘lubiyat +0</p>
    </section>`;
}

function arenaV5MatchCard(match) {
    const playerB = match.player_b || { efootball_username: "Raqib kutilmoqda" };
    const relayButton = match.bot_deep_link
        ? `<button type="button" class="arena-v5-primary" data-arena-v5-bot="${arenaV5Escape(match.bot_deep_link)}">💬 MATCHGA O‘TISH</button>`
        : `<p class="arena-v5-warning">Bu eski Arena matchi. Uni mavjud eski oqim orqali yakunlang.</p>`;
    const waitingAdmin = match.status === "WAITING_ADMIN"
        ? `<div class="arena-v5-review">📸 Natija adminga yuborilgan. Tasdiqlanishi kutilmoqda.</div>` : "";
    return `<section class="arena-v5-match-card">
        <span class="arena-v5-match-number">⚔️ №${match.id} MATCH</span>
        <div class="arena-v5-versus">
            <div><small>PLAYER A</small><b>🎮 ${arenaV5Escape(match.player_a.efootball_username)}</b></div>
            <strong>VS</strong>
            <div><small>PLAYER B</small><b>🎮 ${arenaV5Escape(playerB.efootball_username)}</b></div>
        </div>
        ${waitingAdmin}${relayButton}
    </section>`;
}

function arenaV5FindView() {
    const state = arenaV5State.matchmaking;
    if (state?.state === "MATCHED" && state.match) return arenaV5MatchCard(state.match);
    if (state?.state === "SEARCHING") {
        return `<section class="arena-v5-searching">
            <div class="arena-v5-radar"><span></span></div>
            <h3>Raqib qidirilmoqda…</h3>
            <p>Raqib topilmaguncha Ticket sarflanmaydi.</p>
            <p class="arena-v5-muted">Qidiruv boshlandi: ${arenaV5Date(state.queued_at)}</p>
            <button type="button" class="arena-v5-danger" data-arena-v5-cancel ${arenaV5State.action ? "disabled" : ""}>❌ Bekor qilish</button>
        </section>`;
    }
    return `<section class="arena-v5-find">
        <div class="arena-v5-ball">⚽</div>
        <h3>eFootball raqibingizni toping</h3>
        <p>Bot raqibingiz bilan xavfsiz yozishish va natijani yuborish uchun match chatini ochadi.</p>
        <button type="button" class="arena-v5-primary" data-arena-v5-find ${arenaV5State.action ? "disabled" : ""}>🔍 RAQIB TOPISH</button>
        <small>Kamida 1 Ticket va eFootball username kerak.</small>
    </section>`;
}

function arenaV5ProfileView() {
    const profile = arenaV5State.profile;
    if (!profile) return `<div class="arena-v5-loading">Profil yuklanmoqda…</div>`;
    const stats = [
        ["O‘yin", profile.games_played], ["Yutuq", profile.wins],
        ["Durang", profile.draws], ["Mag‘lubiyat", profile.losses],
        ["Urilgan gol", profile.goals_for], ["O‘tkazilgan", profile.goals_against],
        ["Gollar farqi", profile.goal_difference], ["Ochko", profile.points],
    ];
    return `<section class="arena-v5-profile">
        <div class="arena-v5-profile-name"><span>Telegram</span><b>${profile.telegram_username ? `@${arenaV5Escape(profile.telegram_username)}` : "username yo‘q"}</b></div>
        <label>eFootball username
            <div class="arena-v5-name-form">
                <input id="arenaV5Username" maxlength="64" value="${arenaV5Escape(profile.efootball_username || "")}" placeholder="Masalan: KING PES">
                <button type="button" data-arena-v5-save ${arenaV5State.action ? "disabled" : ""}>Saqlash</button>
            </div>
        </label>
        <div class="arena-v5-stats">${stats.map(([label, value]) => `<div><small>${label}</small><b>${value}</b></div>`).join("")}</div>
    </section>`;
}

function arenaV5RankingView() {
    const ranking = arenaV5State.ranking;
    if (!ranking) return `<div class="arena-v5-loading">Reyting yuklanmoqda…</div>`;
    if (!ranking.players.length) return `<div class="arena-v5-empty">Hozircha yakunlangan match yo‘q.</div>`;
    return `<section class="arena-v5-table-wrap">
        <div class="arena-v5-table-head"><b>${arenaV5Escape(ranking.season_name)}</b><small>${arenaV5Date(ranking.season_end_at)} gacha</small></div>
        <div class="arena-v5-ranking-list">${ranking.players.map((player) => `<article>
            <span class="arena-v5-rank">${player.rank === 1 ? "🥇" : player.rank === 2 ? "🥈" : player.rank === 3 ? "🥉" : `#${player.rank}`}</span>
            <div><b>${arenaV5Escape(player.efootball_username)}</b><small>${player.games_played} o‘yin • ${player.wins}Y ${player.draws}D ${player.losses}M • ${player.goals_for}:${player.goals_against}</small></div>
            <strong>${player.points}</strong>
        </article>`).join("")}</div>
    </section>`;
}

function arenaV5HistoryView() {
    const history = arenaV5State.history;
    if (!history) return `<div class="arena-v5-loading">Tarix yuklanmoqda…</div>`;
    if (!history.length) return `<div class="arena-v5-empty">Sizda yakunlangan Arena matchi yo‘q.</div>`;
    return `<section class="arena-v5-history">${history.map((match) => {
        const meta = match.result === "WIN" ? ["🏆 Yutuq", "win"] : match.result === "DRAW" ? ["🤝 Durang", "draw"] : ["❌ Mag‘lubiyat", "loss"];
        return `<article class="${meta[1]}">
            <div><small>№${match.match_id} • ${arenaV5Date(match.finished_at)}</small><b>vs ${arenaV5Escape(match.opponent_efootball_username)}</b><span>${meta[0]}</span></div>
            <strong>${match.own_score}:${match.opponent_score}<small>+${match.points} ochko</small></strong>
        </article>`;
    }).join("")}</section>`;
}

function arenaV5Render() {
    const page = document.getElementById("arenaPage");
    if (!page) return;
    let body = arenaV5FindView();
    if (arenaV5State.tab === "profile") body = arenaV5ProfileView();
    if (arenaV5State.tab === "ranking") body = arenaV5RankingView();
    if (arenaV5State.tab === "history") body = arenaV5HistoryView();
    page.innerHTML = `<main class="arena-v5">${arenaV5Header()}
        ${arenaV5State.error ? `<div class="arena-v5-error">${arenaV5Escape(arenaV5State.error)}</div>` : ""}
        <div class="arena-v5-body">${body}</div>${arenaV5Nav()}</main>`;
    arenaV5Bind(page);
}

function arenaV5Toast(message, type = "success") {
    if (globalThis.Modal?.[type]) Modal[type](message);
}

async function arenaV5Action(callback) {
    if (arenaV5State.action) return;
    arenaV5State.action = true;
    arenaV5State.error = null;
    arenaV5Render();
    try { await callback(); }
    catch (error) { arenaV5State.error = error.message || "Arena amali bajarilmadi."; }
    finally { arenaV5State.action = false; arenaV5Render(); }
}

async function arenaV5LoadTab(tab) {
    arenaV5State.tab = tab;
    arenaV5State.error = null;
    arenaV5Render();
    try {
        if (tab === "profile") arenaV5State.profile = await arenaV5Client.profile();
        if (tab === "ranking") arenaV5State.ranking = await arenaV5Client.ranking();
        if (tab === "history") arenaV5State.history = await arenaV5Client.history();
    } catch (error) { arenaV5State.error = error.message; }
    arenaV5Render();
}

function arenaV5OpenBot(url) {
    if (!url) return;
    if (globalThis.Telegram?.WebApp?.openTelegramLink) Telegram.WebApp.openTelegramLink(url);
    else globalThis.location.href = url;
}

function arenaV5Bind(page) {
    page.querySelectorAll("[data-arena-v5-tab]").forEach((button) => button.addEventListener("click", () => arenaV5LoadTab(button.dataset.arenaV5Tab)));
    page.querySelector("[data-arena-v5-find]")?.addEventListener("click", () => arenaV5Action(async () => {
        arenaV5State.matchmaking = await arenaV5Client.joinQueue();
        arenaV5State.config = await arenaV5Client.config();
        arenaV5ScheduleSearch();
    }));
    page.querySelector("[data-arena-v5-cancel]")?.addEventListener("click", () => arenaV5Action(async () => {
        arenaV5State.matchmaking = await arenaV5Client.cancelQueue();
        clearTimeout(arenaV5State.searchTimer);
    }));
    page.querySelector("[data-arena-v5-save]")?.addEventListener("click", () => arenaV5Action(async () => {
        const username = page.querySelector("#arenaV5Username")?.value?.trim();
        if (!username) throw new ArenaV5Error("eFootball username kiriting.");
        arenaV5State.profile = await arenaV5Client.updateProfile(username);
        arenaV5Toast("eFootball username saqlandi.");
    }));
    page.querySelector("[data-arena-v5-bot]")?.addEventListener("click", (event) => arenaV5OpenBot(event.currentTarget.dataset.arenaV5Bot));
}

function arenaV5ScheduleSearch() {
    clearTimeout(arenaV5State.searchTimer);
    if (arenaV5State.matchmaking?.state !== "SEARCHING") return;
    arenaV5State.searchTimer = setTimeout(async () => {
        const page = document.getElementById("arenaPage");
        if (!page?.classList.contains("active-page")) return;
        try {
            arenaV5State.matchmaking = await arenaV5Client.state();
            arenaV5State.config = await arenaV5Client.config();
            arenaV5Render();
        } catch (_) { /* next user refresh can retry */ }
        arenaV5ScheduleSearch();
    }, 5000);
}

async function loadArenaV3Page() {
    Navbar.setActive("arena");
    showPage("arenaPage", "Arena");
    arenaV5State.tab = "find";
    arenaV5State.loading = true;
    arenaV5State.error = null;
    arenaV5Render();
    try {
        [arenaV5State.config, arenaV5State.matchmaking] = await Promise.all([
            arenaV5Client.config(), arenaV5Client.state(),
        ]);
    } catch (error) {
        arenaV5State.error = error.message || "Arena yuklanmadi.";
    } finally {
        arenaV5State.loading = false;
        arenaV5Render();
        arenaV5ScheduleSearch();
    }
}

globalThis.ArenaV5Client = ArenaV5Client;
globalThis.arenaV5State = arenaV5State;
globalThis.loadArenaV3Page = loadArenaV3Page;

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        ArenaV5Client,
        ArenaV5Error,
        arenaV5Escape,
        arenaV5Key,
        arenaV5MatchCard,
        arenaV5SeasonRemaining,
    };
}
