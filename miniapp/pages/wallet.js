let walletData = null;

function normalizeWalletData(result) {
    const data = result?.data || result;
    const requiredFields = [
        "telegram_id",
        "efc_balance",
        "uzs_balance",
        "locked_efc",
        "locked_uzs",
    ];

    if (!data || requiredFields.some((field) => !(field in data))) {
        throw new Error("Wallet javobi noto‘g‘ri formatda.");
    }

    return data;
}

function renderWalletUnavailable() {
    const efcTarget = document.getElementById("efcBalance");
    const uzsTarget = document.getElementById("uzsBalance");
    if (efcTarget) efcTarget.textContent = "—";
    if (uzsTarget) uzsTarget.textContent = "—";
}

async function loadWalletPage() {
    try {
        const result = await getWallet();

        if (!result || result.success === false) {
            Modal.error("Hamyonni yuklab bo‘lmadi.");
            return;
        }

        walletData = normalizeWalletData(result);

        renderWalletPage();
    } catch (error) {
        console.error(error);
        walletData = null;
        renderWalletUnavailable();
        Modal.error("Hamyonni yuklashda xatolik.");
    }
}

function renderWalletPage() {
    const page = document.getElementById("homePage");

    const efc = Number(walletData.efc_balance).toLocaleString("uz-UZ");
    const uzs = Number(walletData.uzs_balance).toLocaleString("uz-UZ");

    document.getElementById("efcBalance").textContent = efc;
    document.getElementById("uzsBalance").textContent = uzs;

    if (!page) return;
}

async function refreshWallet() {
    await loadWalletPage();
}

async function openDeposit() {
    tg.showPopup({
        title: "UZS to‘ldirish",
        message: "To‘ldirish summasini bot orqali yuboring. WebApp deposit formasi V1.1 da qo‘shiladi.",
        buttons: [
            { type: "ok", text: "Tushunarli" }
        ]
    });
}

async function openWithdraw() {
    tg.showPopup({
        title: "UZS yechish",
        message: "Yechish so‘rovini bot orqali yuboring. WebApp withdraw formasi V1.1 da qo‘shiladi.",
        buttons: [
            { type: "ok", text: "Tushunarli" }
        ]
    });
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { normalizeWalletData };
}
