let walletData = null;

async function requestWalletData() {
    const result = await getWallet();

    if (!result || result.success === false) {
        const message = result?.message || "Hamyonni yuklab bo‘lmadi.";
        Modal.error(message);
        return null;
    }

    walletData = result;
    return walletData;
}

function formatWalletBalance(value) {
    return Number(value || 0).toLocaleString("uz-UZ");
}

function renderHomeBalances(data) {
    const efcBalance = document.getElementById("efcBalance");
    const uzsBalance = document.getElementById("uzsBalance");

    if (efcBalance) {
        efcBalance.textContent = formatWalletBalance(data.efc_balance);
    }

    if (uzsBalance) {
        uzsBalance.textContent = formatWalletBalance(data.uzs_balance);
    }
}

async function loadHomeBalances() {
    const data = await requestWalletData();
    if (data) {
        renderHomeBalances(data);
    }
    return data;
}

async function loadWalletPage() {
    const data = await requestWalletData();
    if (!data) return null;

    renderWalletPage(data);
    return data;
}

function renderWalletPage(data) {
    const page = document.getElementById("walletPage");
    if (!page) return;

    page.dataset.telegramId = data.telegram_id || "";
    page.dataset.efcBalance = data.efc_balance || 0;
    page.dataset.uzsBalance = data.uzs_balance || 0;
    page.dataset.lockedEfc = data.locked_efc || 0;
    page.dataset.lockedUzs = data.locked_uzs || 0;
}

async function refreshWallet() {
    return await loadWalletPage();
}

async function openDeposit() {
    tg.showPopup({
        title: "UZS to‘ldirish",
        message: "To‘ldirish summasini bot orqali yuboring. WebApp deposit formasi V1.1 da qo‘shiladi.",
        buttons: [{ type: "ok", text: "Tushunarli" }],
    });
}

async function openWithdraw() {
    tg.showPopup({
        title: "UZS yechish",
        message: "Yechish so‘rovini bot orqali yuboring. WebApp withdraw formasi V1.1 da qo‘shiladi.",
        buttons: [{ type: "ok", text: "Tushunarli" }],
    });
}
