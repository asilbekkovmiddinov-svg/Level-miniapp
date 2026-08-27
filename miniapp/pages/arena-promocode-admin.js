class ArenaPromocodeAdminError extends Error {
    constructor(message, status = 0) {
        super(message);
        this.name = "ArenaPromocodeAdminError";
        this.status = status;
    }
}

class ArenaPromocodeAdminApi {
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
        if (!initData) throw new ArenaPromocodeAdminError("Admin login required.", 401);
        let response;
        try {
            response = await this.fetchImpl(`${this.baseUrl}${path}`, {
                method,
                headers: {
                    "X-Telegram-Init-Data": initData,
                    ...(body ? { "Content-Type": "application/json" } : {}),
                },
                ...(body ? { body: JSON.stringify(body) } : {}),
            });
        } catch (_) {
            throw new ArenaPromocodeAdminError("Server bilan aloqa o‘rnatilmadi.");
        }
        let payload = null;
        try { payload = await response.json(); } catch (_) { /* handled below */ }
        if (!response.ok) {
            const fallback = response.status === 401 ? "Admin login required."
                : response.status === 403 ? "Admin permission required."
                    : "Promokod amali bajarilmadi.";
            throw new ArenaPromocodeAdminError(payload?.detail || fallback, response.status);
        }
        if (payload === null) {
            throw new ArenaPromocodeAdminError("Serverdan noto‘g‘ri javob olindi.", response.status);
        }
        return payload;
    }

    list() { return this.request("/admin/arena-promocodes"); }
    create(payload) { return this.request("/admin/arena-promocodes", { method: "POST", body: payload }); }
    activate(id) { return this.request(`/admin/arena-promocodes/${encodeURIComponent(id)}/activate`, { method: "POST" }); }
    deactivate(id) { return this.request(`/admin/arena-promocodes/${encodeURIComponent(id)}/deactivate`, { method: "POST" }); }
}

function arenaPromocodeAdminEscape(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[character]));
}

function arenaPromocodeAdminDate(value) {
    if (!value) return "Cheklanmagan";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("uz-UZ", {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(date);
}

function arenaPromocodeCreatePayload(form) {
    const values = Object.fromEntries(new FormData(form));
    return {
        code: String(values.code || "").trim(),
        ticket_amount: Number(values.ticket_amount),
        usage_limit: values.usage_limit ? Number(values.usage_limit) : null,
        expires_at: values.expires_at ? new Date(values.expires_at).toISOString() : null,
    };
}

const arenaPromocodeAdminApi = new ArenaPromocodeAdminApi({
    baseUrl: typeof API_URL !== "undefined" ? API_URL : "",
    initDataProvider: () => typeof telegramInitData === "function" ? telegramInitData() : "",
});
const arenaPromocodeAdminState = { items: [], loading: false, busy: false };

function arenaPromocodeAdminMenu() {
    return `<nav class="cpa-admin-menu" aria-label="Admin bo‘limlari">
        <button onclick="openPage('promotions-admin')">Promotions</button>
        <button class="active">Arena Promokod</button>
        <button onclick="openPage('coin-promotions-admin')">Coin Promotions</button>
        <button onclick="openPage('wheel-orders-admin')">Wheel Coin Orders</button>
        <button onclick="openPage('division-admin')">Division</button>
    </nav>`;
}

function arenaPromocodeAdminCard(item) {
    const limit = item.usage_limit ?? "∞";
    const remaining = item.usage_limit == null
        ? "∞" : Math.max(0, Number(item.usage_limit) - Number(item.usage_count));
    return `<article class="cpa-card ${item.is_active ? "status-active" : "status-paused"}">
        <div class="cpa-card-head">
            <span class="cpa-fire">🎁</span>
            <div><small>PROMOKOD</small><h3>${arenaPromocodeAdminEscape(item.code)}</h3>
                <p>${Number(item.ticket_amount).toLocaleString("uz-UZ")} Arena Ticket</p></div>
            <b class="cpa-status">${item.is_active ? "ACTIVE" : "INACTIVE"}</b>
        </div>
        <div class="cpa-inventory">
            <span><small>Ishlatildi</small><b>${Number(item.usage_count)}</b></span>
            <span><small>Qoldi</small><b>${remaining}</b></span>
            <span><small>Limit</small><b>${limit}</b></span>
            <span><small>Tugaydi</small><b>${arenaPromocodeAdminEscape(arenaPromocodeAdminDate(item.expires_at))}</b></span>
        </div>
        <div class="cpa-actions">
            <button type="button" data-copy-promocode="${arenaPromocodeAdminEscape(item.code)}">📋 Nusxa olish</button>
            <button type="button" data-promocode-action="${item.is_active ? "deactivate" : "activate"}"
                data-promocode-id="${arenaPromocodeAdminEscape(item.id)}">
                ${item.is_active ? "⏸ O‘chirish" : "▶ Yoqish"}
            </button>
        </div>
    </article>`;
}

function renderArenaPromocodeAdminPage() {
    const page = document.getElementById("arenaPromocodeAdminPage");
    if (!page) return;
    const active = arenaPromocodeAdminState.items.filter((item) => item.is_active).length;
    const claims = arenaPromocodeAdminState.items.reduce(
        (sum, item) => sum + Number(item.usage_count || 0), 0
    );
    page.innerHTML = `<div class="cpa-shell">${arenaPromocodeAdminMenu()}
        <header class="cpa-hero"><div><small>LEVEL_GROUP ADMIN</small><h2>🎟 Arena Promokodlar</h2>
            <p>Real test va aksiyalar uchun Arena Ticket tarqating.</p></div>
            <button type="button" data-create-promocode>＋ Yaratish</button></header>
        <div class="cpa-stats"><span><b>${arenaPromocodeAdminState.items.length}</b>Jami</span>
            <span><b>${active}</b>Faol</span><span><b>${claims}</b>Ishlatilgan</span></div>
        <section class="cpa-list">${arenaPromocodeAdminState.items.length
            ? arenaPromocodeAdminState.items.map(arenaPromocodeAdminCard).join("")
            : `<div class="cpa-empty"><span>🎁</span><h2>Promokod yo‘q</h2>
                <p>Masalan, ARENA10 orqali 10 Ticket bering.</p></div>`}</section>
        <div id="arenaPromocodeAdminModal"></div>
    </div>`;
    bindArenaPromocodeAdminPage(page);
}

function openArenaPromocodeForm() {
    const mount = document.getElementById("arenaPromocodeAdminModal");
    if (!mount) return;
    mount.innerHTML = `<div class="cpa-modal"><form id="arenaPromocodeCreateForm">
        <header><div><small>CREATE</small><h2>Yangi Arena promokod</h2></div>
            <button type="button" data-close-promocode>×</button></header>
        <label>Kod<input name="code" maxlength="32" required autocomplete="off"
            autocapitalize="characters" placeholder="ARENA10"></label>
        <div class="cpa-form-grid">
            <label>Ticket miqdori<input name="ticket_amount" type="number" min="1" max="10000" value="10" required></label>
            <label>Umumiy limit<input name="usage_limit" type="number" min="1" placeholder="Masalan: 100"></label>
        </div>
        <label>Tugash vaqti<input name="expires_at" type="datetime-local"></label>
        <footer><button type="button" data-close-promocode>Bekor qilish</button>
            <button class="primary" type="submit">Yaratish</button></footer>
    </form></div>`;
    mount.querySelectorAll("[data-close-promocode]").forEach((button) => {
        button.addEventListener("click", () => { mount.innerHTML = ""; });
    });
    mount.querySelector("#arenaPromocodeCreateForm")?.addEventListener("submit", saveArenaPromocode);
}

async function saveArenaPromocode(event) {
    event.preventDefault();
    if (arenaPromocodeAdminState.busy) return;
    const form = event.currentTarget;
    const submit = form.querySelector("button[type='submit']");
    arenaPromocodeAdminState.busy = true;
    if (submit) submit.disabled = true;
    try {
        await arenaPromocodeAdminApi.create(arenaPromocodeCreatePayload(form));
        globalThis.Modal?.success?.("Promokod yaratildi.");
        await loadArenaPromocodeAdminPage();
    } catch (error) {
        globalThis.Modal?.error?.(error.message || "Promokodni yaratib bo‘lmadi.");
        if (submit) submit.disabled = false;
    } finally {
        arenaPromocodeAdminState.busy = false;
    }
}

async function runArenaPromocodeAction(id, action) {
    if (arenaPromocodeAdminState.busy || !["activate", "deactivate"].includes(action)) return;
    arenaPromocodeAdminState.busy = true;
    try {
        await arenaPromocodeAdminApi[action](id);
        await loadArenaPromocodeAdminPage();
    } catch (error) {
        globalThis.Modal?.error?.(error.message || "Promokod holatini o‘zgartirib bo‘lmadi.");
    } finally {
        arenaPromocodeAdminState.busy = false;
    }
}

async function copyArenaPromocode(code) {
    try {
        if (typeof globalThis.navigator?.clipboard?.writeText !== "function") {
            throw new Error("Clipboard is unavailable");
        }
        await globalThis.navigator.clipboard.writeText(code);
        globalThis.Modal?.success?.(`${code} nusxalandi.`);
    } catch (_) {
        globalThis.Modal?.error?.("Promokodni nusxalab bo‘lmadi.");
    }
}

function bindArenaPromocodeAdminPage(page) {
    page.querySelector("[data-create-promocode]")?.addEventListener("click", openArenaPromocodeForm);
    page.querySelectorAll("[data-promocode-action]").forEach((button) => {
        button.addEventListener("click", () => runArenaPromocodeAction(
            button.dataset.promocodeId, button.dataset.promocodeAction
        ));
    });
    page.querySelectorAll("[data-copy-promocode]").forEach((button) => {
        button.addEventListener("click", () => copyArenaPromocode(button.dataset.copyPromocode));
    });
}

async function loadArenaPromocodeAdminPage() {
    showPage("arenaPromocodeAdminPage", "Arena Promokodlar");
    const page = document.getElementById("arenaPromocodeAdminPage");
    if (!page) return;
    page.innerHTML = `<div class="cpa-shell">${arenaPromocodeAdminMenu()}
        <div class="cpa-empty">Promokodlar yuklanmoqda…</div></div>`;
    arenaPromocodeAdminState.loading = true;
    try {
        const payload = await arenaPromocodeAdminApi.list();
        arenaPromocodeAdminState.items = Array.isArray(payload) ? payload : [];
        renderArenaPromocodeAdminPage();
    } catch (error) {
        page.innerHTML = `<div class="cpa-shell">${arenaPromocodeAdminMenu()}
            <div class="cpa-empty"><span>⚠</span><h2>${arenaPromocodeAdminEscape(error.message)}</h2>
            <button type="button" onclick="loadArenaPromocodeAdminPage()">Qayta urinish</button></div></div>`;
    } finally {
        arenaPromocodeAdminState.loading = false;
    }
}

globalThis.ArenaPromocodeAdminApi = ArenaPromocodeAdminApi;
globalThis.loadArenaPromocodeAdminPage = loadArenaPromocodeAdminPage;

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        ArenaPromocodeAdminApi,
        ArenaPromocodeAdminError,
        arenaPromocodeAdminEscape,
        arenaPromocodeAdminDate,
    };
}
