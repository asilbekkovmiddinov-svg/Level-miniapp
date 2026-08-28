const walletShopApi = new WalletShopApi({
    baseUrl: typeof API_URL !== "undefined" ? API_URL : "",
    initDataProvider: () => typeof telegramInitData === "function" ? telegramInitData() : "",
});
const walletShopState = {
    catalog: null,
    loading: false,
    busy: false,
    attempt: null,
};

function walletShopEscape(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[character]));
}

function walletShopNumber(value, maximum, { integer = false } = {}) {
    const normalized = String(value ?? "").trim().replace(",", ".");
    if (!normalized || !/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
    const number = Number(normalized);
    if (!Number.isFinite(number) || number <= 0 || number > Number(maximum)) return null;
    if (integer && !Number.isInteger(number)) return null;
    return number;
}

function walletShopMoney(value, digits = 2) {
    return Number(value || 0).toLocaleString("uz-UZ", {
        minimumFractionDigits: 0,
        maximumFractionDigits: digits,
    });
}

function walletShopIdempotencyKey(scope) {
    const random = globalThis.crypto?.randomUUID?.()
        || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `miniapp-shop:${scope}:${random}`;
}

function walletShopAttempt(kind, amount) {
    const fingerprint = `${kind}:${amount}`;
    if (walletShopState.attempt?.fingerprint !== fingerprint) {
        walletShopState.attempt = {
            fingerprint,
            key: walletShopIdempotencyKey(kind),
        };
    }
    return walletShopState.attempt;
}

function walletShopSkeleton() {
    return `<section class="wshop-shell"><div class="wshop-skeleton hero"></div>
        <div class="wshop-balance-grid"><i></i><i></i><i></i></div>
        <div class="wshop-skeleton card"></div><div class="wshop-skeleton card"></div></section>`;
}

function walletShopPurchaseCard(kind) {
    const catalog = walletShopState.catalog;
    const isEfc = kind === "efc";
    const price = isEfc ? catalog.efc_price_uzs : catalog.ticket_price_efc;
    const maximum = isEfc ? catalog.max_efc_per_purchase : catalog.max_tickets_per_purchase;
    return `<article class="wshop-purchase-card ${isEfc ? "is-efc" : "is-ticket"}">
        <header><span>${isEfc ? "🪙" : "🎟"}</span><div><small>${isEfc ? "UZS → EFC" : "EFC → TICKET"}</small>
            <h3>${isEfc ? "EFC sotib olish" : "Arena Ticket olish"}</h3></div></header>
        <p>${isEfc ? `1 EFC = ${walletShopMoney(price)} UZS` : `1 Ticket = ${walletShopMoney(price)} EFC`}</p>
        <label>${isEfc ? "EFC miqdori" : "Ticket soni"}
            <input id="walletShop${isEfc ? "Efc" : "Ticket"}Input" type="number" inputmode="${isEfc ? "decimal" : "numeric"}"
                min="1" max="${maximum}" step="${isEfc ? "0.01" : "1"}" placeholder="${isEfc ? "10" : "1"}"
                oninput="updateWalletShopQuote('${kind}')" ${walletShopState.busy ? "disabled" : ""}>
        </label>
        <div class="wshop-quote"><small>Jami</small><strong id="walletShop${isEfc ? "Efc" : "Ticket"}Quote">—</strong></div>
        <button type="button" onclick="startWalletShopPurchase('${kind}')" ${walletShopState.busy ? "disabled" : ""}>
            ${isEfc ? "EFC olish" : "Ticket olish"}
        </button>
    </article>`;
}

function renderWalletShopPage() {
    const page = document.getElementById("walletShopPage");
    const data = walletShopState.catalog;
    if (!page || !data) return;
    page.innerHTML = `<section class="wshop-shell">
        <header class="wshop-hero"><div><small>LEVEL WALLET</small><h2>EFC & Ticket Magazin</h2>
            <p>UZS balansdan EFC, EFC balansdan Arena Ticket oling.</p></div><span>🛍</span></header>
        <div class="wshop-balance-grid">
            <article><small>UZS</small><strong>${walletShopMoney(data.uzs_balance)}</strong></article>
            <article><small>EFC</small><strong>${walletShopMoney(data.efc_balance)}</strong></article>
            <article><small>Ticket</small><strong>${Number(data.ticket_balance).toLocaleString("uz-UZ")}</strong></article>
        </div>
        <section class="wshop-purchases">${walletShopPurchaseCard("efc")}${walletShopPurchaseCard("ticket")}</section>
        <p class="wshop-note">Har bir xarid bir marta bajariladi. Xarid tugagach balans avtomatik yangilanadi.</p>
    </section>`;
}

function renderWalletShopError(error) {
    const page = document.getElementById("walletShopPage");
    if (!page) return;
    page.innerHTML = `<section class="wshop-shell"><div class="wshop-error"><span>⚠</span>
        <h2>Magazin ochilmadi</h2><p>${walletShopEscape(error?.message || "Qayta urinib ko‘ring.")}</p>
        <button type="button" onclick="loadWalletShopPage()">Qayta urinish</button></div></section>`;
}

async function loadWalletShopPage() {
    Navbar.setActive("wallet-shop");
    showPage("walletShopPage", "EFC & Ticket");
    const page = document.getElementById("walletShopPage");
    if (!page) return;
    page.innerHTML = walletShopSkeleton();
    walletShopState.loading = true;
    try {
        walletShopState.catalog = await walletShopApi.catalog();
        renderWalletShopPage();
    } catch (error) {
        renderWalletShopError(error);
    } finally {
        walletShopState.loading = false;
    }
}

function updateWalletShopQuote(kind) {
    const data = walletShopState.catalog;
    if (!data) return;
    const isEfc = kind === "efc";
    const input = document.getElementById(`walletShop${isEfc ? "Efc" : "Ticket"}Input`);
    const target = document.getElementById(`walletShop${isEfc ? "Efc" : "Ticket"}Quote`);
    const amount = walletShopNumber(
        input?.value,
        isEfc ? data.max_efc_per_purchase : data.max_tickets_per_purchase,
        { integer: !isEfc },
    );
    if (target) target.textContent = amount
        ? `${walletShopMoney(amount * (isEfc ? data.efc_price_uzs : data.ticket_price_efc))} ${isEfc ? "UZS" : "EFC"}`
        : "—";
}

function startWalletShopPurchase(kind) {
    if (walletShopState.busy || !walletShopState.catalog) return;
    const isEfc = kind === "efc";
    const input = document.getElementById(`walletShop${isEfc ? "Efc" : "Ticket"}Input`);
    const amount = walletShopNumber(
        input?.value,
        isEfc ? walletShopState.catalog.max_efc_per_purchase : walletShopState.catalog.max_tickets_per_purchase,
        { integer: !isEfc },
    );
    if (!amount) {
        globalThis.Modal?.error?.(isEfc ? "Yaroqli EFC miqdorini kiriting." : "Yaroqli Ticket sonini kiriting.");
        return;
    }
    const total = amount * (isEfc ? walletShopState.catalog.efc_price_uzs : walletShopState.catalog.ticket_price_efc);
    globalThis.Modal?.confirm?.(
        `${walletShopMoney(amount)} ${isEfc ? "EFC" : "Ticket"} uchun ${walletShopMoney(total)} ${isEfc ? "UZS" : "EFC"} sarflansinmi?`,
        () => runWalletShopPurchase(kind, amount),
    );
}

async function runWalletShopPurchase(kind, amount) {
    if (walletShopState.busy) return;
    walletShopState.busy = true;
    renderWalletShopPage();
    const attempt = walletShopAttempt(kind, amount);
    try {
        const result = kind === "efc"
            ? await walletShopApi.buyEfc(amount, attempt.key)
            : await walletShopApi.buyTickets(amount, attempt.key);
        walletShopState.catalog = {
            ...walletShopState.catalog,
            uzs_balance: result.uzs_balance,
            efc_balance: result.efc_balance,
            ticket_balance: result.ticket_balance,
        };
        walletShopState.attempt = null;
        globalThis.Modal?.success?.(kind === "efc"
            ? `${walletShopMoney(result.efc_amount)} EFC olindi.`
            : `${Number(result.ticket_quantity)} Arena Ticket olindi.`);
    } catch (error) {
        globalThis.Modal?.error?.(error.message || "Xarid bajarilmadi.");
    } finally {
        walletShopState.busy = false;
        renderWalletShopPage();
    }
}

globalThis.loadWalletShopPage = loadWalletShopPage;

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        walletShopNumber,
        walletShopIdempotencyKey,
        walletShopAttempt,
    };
}
