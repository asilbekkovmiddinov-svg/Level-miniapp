let walletData = null;
let walletLastError = null;

function formatWalletBalance(value) {
    return Number(value).toLocaleString("uz-UZ");
}

function escapeWalletText(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
    }[character]));
}

function getWalletPage() {
    return document.getElementById("walletPage");
}

function renderWalletLoading() {
    const page = getWalletPage();
    if (page) {
        page.innerHTML = '<div class="wallet-state"><div><i class="wallet-spinner"></i><strong>Hamyon yuklanmoqda</strong><p>Balans ma’lumotlari xavfsiz tarzda olinmoqda.</p></div></div>';
    }
}

function renderWalletError(result) {
    const page = getWalletPage();
    if (!page) return;

    const isEmpty = result?.status_code === 404;
    const title = isEmpty ? "Hamyon topilmadi" : "Hamyonni yuklab bo‘lmadi";
    const message = result?.message || "Internet aloqasini tekshirib, qayta urinib ko‘ring.";
    page.innerHTML = `<div class="wallet-state"><div><strong>${title}</strong><p>${escapeWalletText(message)}</p><button class="wallet-retry" type="button" onclick="loadWalletPage()">Qayta urinish</button></div></div>`;
}

function renderWalletPage(data) {
    const page = getWalletPage();
    if (!page) return;

    const updatedAt = new Date().toLocaleString("uz-UZ");
    page.innerHTML = `<div class="wallet-screen">
        <article class="wallet-header">
            <span class="wallet-kicker">SECURE WALLET</span>
            <h2>Mening hamyonim</h2>
            <span class="wallet-id">Telegram ID: ${escapeWalletText(data.telegram_id)}</span>
        </article>
        <div class="wallet-balance-grid">
            <article class="wallet-balance-card"><span>EFC balans</span><strong>${formatWalletBalance(data.efc_balance)}</strong><small>EFC</small></article>
            <article class="wallet-balance-card"><span>UZS balans</span><strong>${formatWalletBalance(data.uzs_balance)}</strong><small>SO‘M</small></article>
        </div>
        <p class="wallet-locked-title">BAND QILINGAN BALANSLAR</p>
        <div class="wallet-locked-grid">
            <article class="wallet-locked-card"><span>Locked EFC</span><strong>${formatWalletBalance(data.locked_efc)}</strong><small>EFC</small></article>
            <article class="wallet-locked-card"><span>Locked UZS</span><strong>${formatWalletBalance(data.locked_uzs)}</strong><small>SO‘M</small></article>
        </div>
        <div class="wallet-meta">Oxirgi yangilanish: <b>${updatedAt}</b></div>
        <div class="wallet-actions-disabled">
            <button class="wallet-action-disabled" type="button" disabled>＋ To‘ldirish<small>Keyingi bosqichda</small></button>
            <button class="wallet-action-disabled" type="button" disabled>↗ Yechish<small>Keyingi bosqichda</small></button>
        </div>
    </div>`;
}

async function requestWalletData() {
    const result = await getWallet();
    if (!result || result.success === false) {
        walletLastError = result;
        return null;
    }

    walletLastError = null;
    walletData = result;
    return walletData;
}

function renderHomeBalances(data) {
    const efcBalance = document.getElementById("efcBalance");
    const uzsBalance = document.getElementById("uzsBalance");

    if (efcBalance) efcBalance.textContent = formatWalletBalance(data.efc_balance);
    if (uzsBalance) uzsBalance.textContent = formatWalletBalance(data.uzs_balance);
}

async function loadHomeBalances() {
    const result = await getWallet();
    if (!result || result.success === false) return null;

    renderHomeBalances(result);
    return result;
}

async function loadWalletPage() {
    Navbar.setActive("wallet");
    showPage("walletPage", "Hamyon");
    renderWalletLoading();

    try {
        const data = await requestWalletData();
        if (!data) {
            renderWalletError(walletLastError);
            return null;
        }
        renderWalletPage(data);
        return data;
    } catch (error) {
        console.error(error);
        renderWalletError();
        return null;
    }
}

async function refreshWallet() {
    return await loadWalletPage();
}

async function openDeposit() {
    tg.showPopup({ title: "UZS to‘ldirish", message: "To‘ldirish MiniApp’da keyingi bosqichda ochiladi.", buttons: [{ type: "ok", text: "Tushunarli" }] });
}

async function openWithdraw() {
    tg.showPopup({ title: "UZS yechish", message: "Yechish MiniApp’da keyingi bosqichda ochiladi.", buttons: [{ type: "ok", text: "Tushunarli" }] });
}
