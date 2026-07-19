const wheelOrderAdminApi = new WheelOrderAdminApi({ baseUrl: API_URL, initDataProvider: () => telegramInitData() });
const wheelOrderAdminState = { items: [], loading: false };
const WHEEL_ORDER_ACTIVE_STATUSES = new Set(["WAITING_DETAILS", "WAITING_OPERATOR", "WAITING_OTP", "OTP_SUBMITTED", "PENDING", "CLAIMED"]);

function wheelOrderEscape(value) { return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;" })[character]); }
function wheelOrderDate(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("uz-UZ", { dateStyle: "medium", timeStyle: "short" }).format(date); }
function wheelOrderUser(item) {
    const name = item.first_name || (item.username ? `@${item.username}` : "Telegram User");
    const username = item.username && item.first_name ? ` · @${item.username}` : "";
    return `<strong>${wheelOrderEscape(name)}</strong><small>ID ${Number(item.telegram_id)}${wheelOrderEscape(username)}</small>`;
}
function wheelOrderAdminMenu() { return `<nav class="cpa-admin-menu" aria-label="Admin bo‘limlari"><button onclick="openPage('promotions-admin')">Promotions</button><button onclick="openPage('coin-promotions-admin')">Coin Promotions</button><button class="active">Wheel Coin Orders</button></nav>`; }
function wheelOrderCard(item) {
    const active = WHEEL_ORDER_ACTIVE_STATUSES.has(item.status);
    return `<article class="woa-card status-${wheelOrderEscape(String(item.status).toLowerCase())}" data-order-id="${Number(item.id)}">
        <header><div><span>#${Number(item.id)}</span><h3>${wheelOrderUser(item)}</h3></div><b>${wheelOrderEscape(item.status)}</b></header>
        <section class="woa-coin"><span>🎰</span><div><small>COIN AMOUNT</small><strong>${Number(item.coin_amount).toLocaleString("uz-UZ")} Coin</strong></div></section>
        <dl><div><dt>Created At</dt><dd>${wheelOrderDate(item.created_at)}</dd></div><div><dt>Updated At</dt><dd>${wheelOrderDate(item.updated_at)}</dd></div></dl>
        ${active ? `<button class="woa-cancel" type="button" onclick="cancelWheelOrder(${Number(item.id)})">Cancel</button>` : ""}
    </article>`;
}
function renderWheelOrderAdminPage() {
    document.getElementById("wheelOrderAdminPage").innerHTML = `<div class="woa-shell">${wheelOrderAdminMenu()}
        <header class="woa-hero"><div><small>LEVEL_GROUP ADMIN</small><h2>Wheel Coin Orders</h2><p>Wheel orqali yaratilgan Coin buyurtmalarini boshqaring</p></div><span>🎰</span></header>
        <section class="woa-summary"><div><small>TOTAL</small><b>${wheelOrderAdminState.items.length}</b></div><div><small>ACTIVE</small><b>${wheelOrderAdminState.items.filter((item) => WHEEL_ORDER_ACTIVE_STATUSES.has(item.status)).length}</b></div><div><small>CANCELLED</small><b>${wheelOrderAdminState.items.filter((item) => item.status === "CANCELLED").length}</b></div></section>
        <div class="woa-list-head"><h3>Orders</h3><button type="button" onclick="loadWheelOrderAdminPage(true)">↻ Refresh</button></div>
        <section class="woa-list">${wheelOrderAdminState.items.length ? wheelOrderAdminState.items.map(wheelOrderCard).join("") : `<div class="woa-empty"><span>🎰</span><h2>Wheel Coin Order yo‘q</h2><p>Yangi orderlar shu yerda ko‘rinadi.</p></div>`}</section></div>`;
}
function wheelOrderAdminSkeleton() { return `<div class="woa-shell"><div class="woa-skeleton menu"></div><div class="woa-skeleton hero"></div><div class="woa-skeleton card"></div><div class="woa-skeleton card"></div></div>`; }
function wheelOrderAdminError(error) {
    const message = error?.status === 401 ? "Admin login required." : error?.status === 403 ? "Admin permission required." : error?.message || "Wheel Coin Orderlarni yuklab bo‘lmadi.";
    return `<div class="woa-shell"><div class="woa-empty"><span>⚠</span><h2>${wheelOrderEscape(message)}</h2><button type="button" onclick="loadWheelOrderAdminPage(true)">Qayta urinish</button></div></div>`;
}
async function loadWheelOrderAdminPage(force = false) {
    document.body.classList.add("wheel-order-admin-open"); showPage("wheelOrderAdminPage", "Wheel Coin Orders");
    const page = document.getElementById("wheelOrderAdminPage");
    if (!force && wheelOrderAdminState.items.length) { renderWheelOrderAdminPage(); return; }
    page.innerHTML = wheelOrderAdminSkeleton(); wheelOrderAdminState.loading = true;
    try { const response = await wheelOrderAdminApi.list(); wheelOrderAdminState.items = Array.isArray(response?.data) ? response.data : []; renderWheelOrderAdminPage(); }
    catch (error) { page.innerHTML = wheelOrderAdminError(error); }
    finally { wheelOrderAdminState.loading = false; }
}
function wheelOrderConfirm() { return new Promise((resolve) => tg.showConfirm("Ushbu Wheel Coin Order bekor qilinsinmi?", (confirmed) => resolve(Boolean(confirmed)))); }
async function cancelWheelOrder(orderId) {
    if (!await wheelOrderConfirm()) return;
    const button = document.querySelector(`[data-order-id="${Number(orderId)}"] .woa-cancel`); if (button) button.disabled = true;
    try {
        const response = await wheelOrderAdminApi.cancel(orderId); const updated = response?.data;
        wheelOrderAdminState.items = wheelOrderAdminState.items.map((item) => item.id === Number(orderId) ? { ...item, ...updated, status: "CANCELLED" } : item);
        renderWheelOrderAdminPage(); promotionsAdminToast("Wheel Coin Order bekor qilindi.");
        const refreshed = await wheelOrderAdminApi.list(); wheelOrderAdminState.items = Array.isArray(refreshed?.data) ? refreshed.data : wheelOrderAdminState.items; renderWheelOrderAdminPage();
    } catch (error) { if (button) button.disabled = false; promotionsAdminToast(error?.message || "Orderni bekor qilib bo‘lmadi.", "error"); }
}
