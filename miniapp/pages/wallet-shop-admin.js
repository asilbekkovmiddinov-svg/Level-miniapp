const walletShopAdminApi = new WalletShopApi({
    baseUrl: typeof API_URL !== "undefined" ? API_URL : "",
    initDataProvider: () => typeof telegramInitData === "function" ? telegramInitData() : "",
});
const walletShopAdminState = { settings: null, busy: false };

function walletShopAdminMenu() {
    return `<nav class="cpa-admin-menu" aria-label="Admin bo‘limlari">
        <button onclick="openPage('promotions-admin')">Promotions</button>
        <button onclick="openPage('arena-promocodes-admin')">Arena Promokod</button>
        <button class="active">EFC & Ticket</button>
        <button onclick="openPage('coin-promotions-admin')">Coin Promotions</button>
        <button onclick="openPage('wheel-orders-admin')">Wheel Coin Orders</button>
        <button onclick="openPage('division-admin')">Division</button>
    </nav>`;
}

function walletShopAdminValue(value) {
    return value == null ? "" : String(Number(value));
}

function renderWalletShopAdminPage() {
    const page = document.getElementById("walletShopAdminPage");
    const data = walletShopAdminState.settings;
    if (!page || !data) return;
    page.innerHTML = `<div class="wshop-admin-shell">${walletShopAdminMenu()}
        <header class="wshop-admin-hero"><div><small>LEVEL_GROUP ADMIN</small><h2>EFC & Ticket narxlari</h2>
            <p>MiniApp va bot uchun yagona Magazin narxlarini boshqaring.</p></div><span>🛠</span></header>
        <form class="wshop-admin-form" onsubmit="saveWalletShopSettings(event)">
            <label><span>1 EFC narxi</span><small>UZS balansdan EFC olish narxi</small>
                <div><input name="efc_price_uzs" type="number" inputmode="decimal" min="0.01" step="0.01"
                    value="${walletShopAdminValue(data.efc_price_uzs)}" placeholder="1000" required><b>UZS</b></div></label>
            <label><span>1 Arena Ticket narxi</span><small>EFC balansdan Ticket olish narxi</small>
                <div><input name="ticket_price_efc" type="number" inputmode="decimal" min="0.01" step="0.01"
                    value="${walletShopAdminValue(data.ticket_price_efc)}" placeholder="10" required><b>EFC</b></div></label>
            <button type="submit" ${walletShopAdminState.busy ? "disabled" : ""}>Narxlarni saqlash</button>
        </form>
        <div class="wshop-admin-status ${data.configured ? "is-ready" : ""}">
            <span>${data.configured ? "✓" : "!"}</span><div><b>${data.configured ? "Magazin ishlashga tayyor" : "Narxlar belgilanmagan"}</b>
            <small>Saqlangan narx bot va MiniAppda bir xil ishlatiladi.</small></div></div>
    </div>`;
}

function renderWalletShopAdminError(error) {
    const page = document.getElementById("walletShopAdminPage");
    if (!page) return;
    page.innerHTML = `<div class="wshop-admin-shell">${walletShopAdminMenu()}
        <div class="wshop-error"><span>⚠</span><h2>Admin sahifa ochilmadi</h2>
        <p>${walletShopEscape(error?.message || "Qayta urinib ko‘ring.")}</p>
        <button type="button" onclick="loadWalletShopAdminPage()">Qayta urinish</button></div></div>`;
}

async function loadWalletShopAdminPage() {
    showPage("walletShopAdminPage", "EFC & Ticket Admin");
    const page = document.getElementById("walletShopAdminPage");
    if (!page) return;
    page.innerHTML = `<div class="wshop-admin-shell">${walletShopAdminMenu()}<div class="wshop-skeleton hero"></div></div>`;
    try {
        walletShopAdminState.settings = await walletShopAdminApi.adminSettings();
        renderWalletShopAdminPage();
    } catch (error) {
        renderWalletShopAdminError(error);
    }
}

async function saveWalletShopSettings(event) {
    event.preventDefault();
    if (walletShopAdminState.busy) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const efcPrice = walletShopNumber(values.efc_price_uzs, Number.MAX_SAFE_INTEGER);
    const ticketPrice = walletShopNumber(values.ticket_price_efc, Number.MAX_SAFE_INTEGER);
    if (!efcPrice || !ticketPrice) {
        globalThis.Modal?.error?.("Ikkala narxni ham 0 dan katta qilib kiriting.");
        return;
    }
    walletShopAdminState.busy = true;
    renderWalletShopAdminPage();
    try {
        walletShopAdminState.settings = await walletShopAdminApi.updateAdminSettings(efcPrice, ticketPrice);
        globalThis.Modal?.success?.("Magazin narxlari saqlandi.");
    } catch (error) {
        globalThis.Modal?.error?.(error.message || "Narxlar saqlanmadi.");
    } finally {
        walletShopAdminState.busy = false;
        renderWalletShopAdminPage();
    }
}

globalThis.loadWalletShopAdminPage = loadWalletShopAdminPage;
