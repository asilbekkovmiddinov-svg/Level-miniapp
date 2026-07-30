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
    } = {}) {
        this.baseUrl = String(baseUrl).replace(/\/$/, "");
        this.fetchImpl = fetchImpl;
        this.initDataProvider = initDataProvider;
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
        return payload?.match ? normalizeArenaV3Match(payload.match) : null;
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
        matchType: value.match_type || "STANDARD",
        matchTime: Number(value.match_time_minutes) || 10,
        status: value.status,
        createdAt: value.created_at || null,
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
    ["OPEN", "Open"],
    ["READY", "Ready"],
    ["WAITING_ROOM_CODE", "Room Code"],
    ["PLAYING", "Playing"],
    ["WAITING_SCREENSHOT", "Screenshot"],
    ["AI_REVIEW", "AI Review"],
    ["FINISHED", "Finished"],
]);

const arenaV3State = {
    view: "home",
    openMatches: [],
    activeMatch: null,
    loading: false,
    refreshTimer: null,
    touchStart: 0,
};

const arenaV3Client = new ArenaV3Client();

function arenaV3TelegramUser() {
    return globalThis.Telegram?.WebApp?.initDataUnsafe?.user || {};
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
        ["history", "↺", "History", "Keyingi sprint", false],
        ["ranking", "♛", "Ranking", "Keyingi sprint", false],
        ["profile", "◇", "Profile", "Keyingi sprint", false],
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
        <div class="arena-v3x-brand"><span>LEVEL</span><b>ARENA</b><i>V3</i></div>
        <section><small>WELCOME TO THE NEXT LEVEL</small><h2>Battle. Prove. Win.</h2>
            <p>eFootball 1v1 — avtomatik AI natija va xavfsiz EFC settlement.</p></section>
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
        <button type="button" data-arena-v3-join="${match.id}">Join Match <i>→</i></button>
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
    try {
        return globalThis.localStorage?.getItem("arena-v3-efootball-username") || "";
    } catch (_) {
        return "";
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
    return ARENA_V3_TIMELINE.findIndex(([key]) => key === status);
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
        <div class="arena-v3x-info"><span>Match ID</span><b>${arenaV3Escape(match.publicId)}</b>
            <span>Format</span><b>${arenaV3Escape(match.matchType)} · ${match.matchTime} MIN</b></div>
    </section>`;
}

function arenaV3Render() {
    const page = document.getElementById("arenaPage");
    if (!page) return;
    let body = arenaV3HomeCards();
    if (arenaV3State.view === "open") body = arenaV3OpenView();
    if (arenaV3State.view === "create") body = arenaV3CreateView();
    if (arenaV3State.view === "active") body = arenaV3ActiveView();
    page.innerHTML = arenaV3Shell(body);
    arenaV3Bind(page);
}

function arenaV3Error(error, retry) {
    const page = document.getElementById("arenaPage");
    if (!page) return;
    page.innerHTML = arenaV3Shell(`<div class="arena-v3x-error"><span>!</span>
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
        arenaV3Render();
        if (silent) arenaV3Toast("Arena yangilandi");
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
    await arenaV3Load();
    arenaV3State.refreshTimer = setInterval(() => {
        const page = document.getElementById("arenaPage");
        if (page?.classList.contains("active")) arenaV3Load({ silent: true });
    }, 10000);
}

function arenaV3Select(view) {
    if (!["home", "open", "create", "active"].includes(view)) return;
    arenaV3State.view = view;
    arenaV3Render();
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
            globalThis.localStorage?.setItem("arena-v3-efootball-username", username);
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
        try {
            const active = await arenaV3Client.join(match.id, username);
            try {
                globalThis.localStorage?.setItem("arena-v3-efootball-username", username);
            } catch (_) {}
            close();
            arenaV3State.activeMatch = active;
            arenaV3State.view = "active";
            arenaV3Render();
            arenaV3Toast("Matchga qo‘shildingiz.");
        } catch (error) {
            event.currentTarget.disabled = false;
            arenaV3Toast(error.message, "error");
        }
    });
}

function arenaV3Bind(page) {
    page.querySelectorAll("[data-arena-v3-view]").forEach((button) =>
        button.addEventListener("click", () => arenaV3Select(button.dataset.arenaV3View)));
    page.querySelectorAll("[data-arena-v3-back]").forEach((button) =>
        button.addEventListener("click", () => arenaV3Select("home")));
    page.querySelectorAll("[data-arena-v3-refresh]").forEach((button) =>
        button.addEventListener("click", () => arenaV3Load({ silent: true })));
    page.querySelectorAll("[data-arena-v3-join]").forEach((button) =>
        button.addEventListener("click", () => arenaV3JoinModal(button.dataset.arenaV3Join)));
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
    };
}
