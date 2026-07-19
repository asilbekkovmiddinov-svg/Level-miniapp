const coinPromotionAdminApi = new CoinPromotionAdminApi({ baseUrl: API_URL, initDataProvider: () => telegramInitData() });
const coinPromotionAdminState = { items: [], packages: [], filter: "ALL", editing: null, loading: false };
const cpaEscape = CoinPromotionAdminCore.escapeHtml;

function cpaMoney(value) { return Number(value || 0).toLocaleString("uz-UZ"); }
function cpaDate(value, input = false) {
    const date = new Date(value); if (Number.isNaN(date.getTime())) return input ? "" : "—";
    if (input) { const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000); return local.toISOString().slice(0, 16); }
    return new Intl.DateTimeFormat("uz-UZ", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

async function loadCoinPromotionAdminPage() {
    document.body.classList.add("coin-promotion-admin-open");
    showPage("coinPromotionAdminPage", "Coin Promotions");
    const page = document.getElementById("coinPromotionAdminPage");
    page.innerHTML = `<div class="cpa-shell"><div class="cpa-skeleton hero"></div><div class="cpa-skeleton card"></div><div class="cpa-skeleton card"></div></div>`;
    coinPromotionAdminState.loading = true;
    try {
        const [promotions, packages] = await Promise.all([coinPromotionAdminApi.list(), coinPromotionAdminApi.packages()]);
        coinPromotionAdminState.items = CoinPromotionAdminCore.normalizeList(promotions);
        coinPromotionAdminState.packages = CoinPromotionAdminCore.normalizePackages(packages);
        renderCoinPromotionAdminPage();
    } catch (error) {
        renderCoinPromotionAdminError(error);
    } finally { coinPromotionAdminState.loading = false; }
}

function renderCoinPromotionAdminError(error) {
    const message = error?.status === 401 ? "Admin login required."
        : error?.status === 403 ? "Admin permission required." : error?.message || "Ma’lumotlarni yuklab bo‘lmadi.";
    document.getElementById("coinPromotionAdminPage").innerHTML = `<div class="cpa-empty"><span>⚠</span><h2>${cpaEscape(message)}</h2><button onclick="loadCoinPromotionAdminPage()">Qayta urinish</button></div>`;
}

function renderCoinPromotionAdminPage() {
    const state = coinPromotionAdminState;
    const items = state.filter === "ALL" ? state.items : state.items.filter((item) => item.status === state.filter);
    document.getElementById("coinPromotionAdminPage").innerHTML = `<div class="cpa-shell">
        <nav class="cpa-admin-menu" aria-label="Admin bo‘limlari"><button onclick="openPage('promotions-admin')">Promotions</button><button class="active">Coin Promotions</button></nav>
        <header class="cpa-hero"><div><small>LEVEL_GROUP ADMIN</small><h2>Coin Promotions</h2><p>Cheklangan Coin aksiyalarini boshqaring</p></div><button onclick="openCoinPromotionForm()">＋ Create</button></header>
        <div class="cpa-stats"><span><b>${state.items.length}</b>Total</span><span><b>${state.items.filter((x) => x.status === "ACTIVE").length}</b>Active</span><span><b>${state.items.reduce((sum, x) => sum + x.sold_quantity, 0)}</b>Sold</span><span><b>${state.items.reduce((sum, x) => sum + x.remaining_quantity, 0)}</b>Remaining</span></div>
        <nav class="cpa-filters">${CoinPromotionAdminCore.STATUSES.map((status) => `<button class="${state.filter === status ? "active" : ""}" onclick="setCoinPromotionFilter('${status}')">${status}</button>`).join("")}</nav>
        <section class="cpa-list">${items.length ? items.map(coinPromotionAdminCard).join("") : `<div class="cpa-empty"><span>🔥</span><h2>Promotion topilmadi</h2><p>Yangi Coin Promotion yarating.</p></div>`}</section>
        <div id="coinPromotionAdminModal"></div>
    </div>`;
}

function coinPromotionAdminCard(item) {
    const pack = item.coin_package || {};
    const actions = item.status === "DELETED"
        ? `<button data-kind="restore" onclick="runCoinPromotionAction(${item.id},'restore')">♻ Restore</button>`
        : `<button onclick="openCoinPromotionForm(${item.id})">✏ Edit</button><button onclick="runCoinPromotionAction(${item.id},'activate')">▶ Activate</button><button onclick="runCoinPromotionAction(${item.id},'pause')">⏸ Pause</button><button onclick="runCoinPromotionAction(${item.id},'deactivate')">◼ Deactivate</button><button data-kind="delete" onclick="runCoinPromotionAction(${item.id},'remove')">🗑 Delete</button>`;
    return `<article class="cpa-card status-${item.status.toLowerCase()}">
        <div class="cpa-card-head"><span class="cpa-fire">🔥</span><div><small>${cpaEscape(pack.category || "COIN PACKAGE")}</small><h3>${cpaEscape(item.title)}</h3><p>${cpaEscape(pack.title || `${pack.coin_amount || "—"} Coins`)}</p></div><b class="cpa-status">${item.status}</b></div>
        <div class="cpa-prices"><span><small>Original</small><del>${cpaMoney(item.original_price)} UZS</del></span><span><small>Promotion</small><strong>${cpaMoney(item.promotion_price)} UZS</strong></span></div>
        <div class="cpa-inventory"><span><small>Qoldi</small><b>${item.remaining_quantity}</b></span><span><small>Reserved</small><b>${item.reserved_quantity}</b></span><span><small>Sotilgan</small><b>${item.sold_quantity}</b></span><span><small>Jami</small><b>${item.total_quantity}</b></span></div>
        <div class="cpa-time"><span><small>START</small>${cpaDate(item.start_at)}</span><i>→</i><span><small>END</small>${cpaDate(item.end_at)}</span></div>
        <div class="cpa-actions">${actions}</div>
    </article>`;
}

function setCoinPromotionFilter(status) { coinPromotionAdminState.filter = status; renderCoinPromotionAdminPage(); }

function openCoinPromotionForm(id = null) {
    const item = coinPromotionAdminState.items.find((entry) => entry.id === Number(id));
    coinPromotionAdminState.editing = item || null;
    const value = (key, fallback = "") => cpaEscape(item?.[key] ?? fallback);
    const packages = coinPromotionAdminState.packages;
    document.getElementById("coinPromotionAdminModal").innerHTML = `<div class="cpa-modal"><form id="coinPromotionForm" onsubmit="saveCoinPromotion(event)">
        <header><div><small>${item ? "UPDATE" : "CREATE"}</small><h2>${item ? "Promotionni tahrirlash" : "Yangi Coin Promotion"}</h2></div><button type="button" onclick="closeCoinPromotionForm()">×</button></header>
        <label>Coin package<select name="coin_package_id" required>${packages.map((pack) => `<option value="${pack.id}" ${pack.id === item?.coin_package_id ? "selected" : ""}>${cpaEscape(pack.title || `${pack.coin_amount} Coins`)} — ${cpaMoney(pack.price)} UZS</option>`).join("")}</select></label>
        <label>Title<input name="title" maxlength="160" required value="${value("title")}" placeholder="Flash Sale"></label>
        <div class="cpa-form-grid"><label>Promotion price<input name="promotion_price" type="number" min="1" required value="${value("promotion_price")}"></label><label>Total quantity<input name="total_quantity" type="number" min="1" required value="${value("total_quantity", 1)}"></label></div>
        <label>Per user limit<input name="per_user_limit" type="number" min="1" required value="${value("per_user_limit", 1)}"></label>
        <div class="cpa-form-grid"><label>Start time<input name="start_at" type="datetime-local" required value="${item ? cpaDate(item.start_at, true) : ""}"></label><label>End time<input name="end_at" type="datetime-local" required value="${item ? cpaDate(item.end_at, true) : ""}"></label></div>
        <footer><button type="button" onclick="closeCoinPromotionForm()">Cancel</button><button class="primary" type="submit">${item ? "Save changes" : "Create promotion"}</button></footer>
    </form></div>`;
}

function closeCoinPromotionForm() { const modal = document.getElementById("coinPromotionAdminModal"); if (modal) modal.innerHTML = ""; }

async function saveCoinPromotion(event) {
    event.preventDefault();
    const form = event.currentTarget; const submit = form.querySelector("button[type=submit]"); submit.disabled = true;
    try {
        const data = CoinPromotionAdminCore.payload(Object.fromEntries(new FormData(form)), coinPromotionAdminState.packages);
        if (coinPromotionAdminState.editing) await coinPromotionAdminApi.update(coinPromotionAdminState.editing.id, data);
        else await coinPromotionAdminApi.create(data);
        Modal.success(coinPromotionAdminState.editing ? "Promotion yangilandi." : "Promotion yaratildi.");
        closeCoinPromotionForm(); await loadCoinPromotionAdminPage();
    } catch (error) { Modal.error(error?.message || "Promotion saqlanmadi."); submit.disabled = false; }
}

async function runCoinPromotionAction(id, action) {
    const labels = { activate: "activate", pause: "pause", deactivate: "deactivate", remove: "delete", restore: "restore" };
    if (!confirm(`Promotionni ${labels[action]} qilasizmi?`)) return;
    try { await coinPromotionAdminApi[action](id); Modal.success("Promotion yangilandi."); await loadCoinPromotionAdminPage(); }
    catch (error) { Modal.error(error?.message || "Amal bajarilmadi."); }
}
