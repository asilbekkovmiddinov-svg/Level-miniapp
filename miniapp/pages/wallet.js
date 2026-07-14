let walletData = null;
const WALLET_MIN_AMOUNT = 15000;
let walletActionPending = false;
let walletHistoryOffset = 0;
const WALLET_HISTORY_LIMIT = 10;

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

function walletStatusBadge(status) {
    const value = String(status || "PENDING").toUpperCase();
    const labels = { PENDING: "Kutilmoqda", CLAIMED: "Tekshiruvda", APPROVED: "Tasdiqlandi", REJECTED: "Rad etildi", COMPLETED: "Bajarildi" };
    return `<span class="wallet-status wallet-status-${value.toLowerCase()}">${labels[value] || walletEscape(value)}</span>`;
}

function walletHistorySkeleton() {
    return `<div class="wallet-history-skeleton">${Array.from({ length: 4 }, () => "<i></i>").join("")}</div>`;
}

function walletTransactionRow(item) {
    const credit = item.direction === "CREDIT";
    const type = String(item.transaction_type || "");
    const kind = type.includes("DEPOSIT") ? "Deposit" : type.includes("WITHDRAW") ? "Withdraw" : "Tranzaksiya";
    return `<article class="wallet-history-row"><div><b>${walletEscape(kind)}</b><small>${walletEscape(item.description || type)}</small></div><div><strong class="${credit ? "credit" : "debit"}">${credit ? "+" : "−"}${Number(item.amount).toLocaleString("uz-UZ")} ${walletEscape(item.currency)}</strong>${walletStatusBadge(item.status)}</div></article>`;
}

async function loadDedicatedWalletPage(offset = 0) {
    Navbar.setActive("wallet"); showPage("walletPage", "Hamyon"); walletHistoryOffset = offset;
    const page = document.getElementById("walletPage");
    page.innerHTML = `<section class="wallet-v2-page">${walletHistorySkeleton()}</section>`;
    try {
        const [walletResult, history] = await Promise.all([getWallet(), getWalletTransactions({ limit: WALLET_HISTORY_LIMIT, offset })]);
        walletData = normalizeWalletData(walletResult);
        const items = Array.isArray(history?.items) ? history.items : [];
        page.innerHTML = `<section class="wallet-v2-page">
            <header><small>SECURE WALLET</small><h2>Hamyon</h2></header>
            <div class="wallet-v2-balances">
                <article><small>EFC balans</small><strong>${Number(walletData.efc_balance).toLocaleString("uz-UZ")}</strong><span>🔒 ${Number(walletData.locked_efc).toLocaleString("uz-UZ")} locked</span></article>
                <article><small>UZS balans</small><strong>${Number(walletData.uzs_balance).toLocaleString("uz-UZ")}</strong><span>🔒 ${Number(walletData.locked_uzs).toLocaleString("uz-UZ")} locked</span></article>
            </div><div class="wallet-v2-actions"><button onclick="openDeposit()">＋ Deposit</button><button onclick="openWithdraw()">↗ Withdraw</button></div>
            <div class="wallet-v2-title"><h3>Transaction History</h3><button onclick="loadDedicatedWalletPage(${offset})">↻</button></div>
            <div class="wallet-history">${items.length ? items.map(walletTransactionRow).join("") : `<div class="wallet-empty"><b>Tranzaksiyalar yo‘q</b><span>Deposit va withdraw tarixi shu yerda chiqadi.</span></div>`}</div>
            <nav class="wallet-pagination"><button ${offset <= 0 ? "disabled" : ""} onclick="loadDedicatedWalletPage(${Math.max(0, offset - WALLET_HISTORY_LIMIT)})">← Oldingi</button><span>${Math.floor(offset / WALLET_HISTORY_LIMIT) + 1}</span><button ${history?.has_more ? "" : "disabled"} onclick="loadDedicatedWalletPage(${offset + WALLET_HISTORY_LIMIT})">Keyingi →</button></nav>
        </section>`;
    } catch (error) {
        page.innerHTML = `<div class="wallet-empty"><b>Hamyon yuklanmadi</b><span>${walletEscape(error.message)}</span><button onclick="loadDedicatedWalletPage(${offset})">Qayta urinish</button></div>`;
    }
}

function walletAmount(value) {
    const normalized = String(value ?? "").replace(/[\s,]/g, "");
    const amount = Number(normalized);
    return Number.isFinite(amount) ? amount : 0;
}

function validateDepositAmount(value) {
    const amount = walletAmount(value);
    if (amount < WALLET_MIN_AMOUNT) {
        return { valid: false, message: "Minimal summa 15 000 UZS." };
    }
    return { valid: true, amount };
}

function walletCardDigits(value) {
    return String(value ?? "").replace(/\D/g, "").slice(0, 16);
}

function formatWalletCardInput(input) {
    const digits = walletCardDigits(input.value);
    input.value = digits.replace(/(\d{4})(?=\d)/g, "$1 ");
}

function validateWithdrawForm({ amount, cardNumber, cardHolder, bankName, balance }) {
    const parsedAmount = walletAmount(amount);
    if (parsedAmount < WALLET_MIN_AMOUNT) {
        return { valid: false, message: "Minimal summa 15 000 UZS." };
    }
    if (parsedAmount > Number(balance || 0)) {
        return { valid: false, message: "UZS balans yetarli emas." };
    }
    const cardDigits = walletCardDigits(cardNumber);
    if (cardDigits.length !== 16) {
        return { valid: false, message: "Karta raqami 16 ta raqam bo‘lishi kerak." };
    }
    if (String(cardHolder || "").trim().length < 3) {
        return { valid: false, message: "Karta egasining ism-familiyasini kiriting." };
    }
    if (!String(bankName || "").trim()) {
        return { valid: false, message: "Bank nomini kiriting." };
    }
    return {
        valid: true,
        amount: parsedAmount,
        cardNumber: cardDigits,
        cardHolder: String(cardHolder).trim(),
        bankName: String(bankName).trim(),
    };
}

function closeWalletAction() {
    if (walletActionPending) return;
    document.getElementById("walletActionOverlay")?.remove();
}

function showWalletAction(html) {
    document.getElementById("walletActionOverlay")?.remove();
    const overlay = document.createElement("div");
    overlay.id = "walletActionOverlay";
    overlay.className = "wallet-action-overlay";
    overlay.innerHTML = `<section class="wallet-action-sheet">${html}</section>`;
    document.body.appendChild(overlay);
}

function walletFormError(message = "") {
    const target = document.getElementById("walletFormError");
    if (target) target.textContent = message;
}

function setWalletSubmitting(submitting) {
    walletActionPending = submitting;
    document.querySelectorAll("#walletActionOverlay button, #walletActionOverlay input")
        .forEach((element) => { element.disabled = submitting; });
}

function openDeposit() {
    showWalletAction(`
        <header><small>SECURE WALLET</small><h3>UZS to‘ldirish</h3>
            <button type="button" onclick="closeWalletAction()">×</button></header>
        <form onsubmit="submitWalletDeposit(event)">
            <label>Summa (UZS)<input name="amount" type="number" inputmode="numeric"
                min="15000" step="1" placeholder="15 000" required></label>
            <p>Minimal to‘ldirish summasi 15 000 UZS.</p>
            <div id="walletFormError" class="wallet-form-error"></div>
            <button class="wallet-form-submit" type="submit">So‘rov yaratish</button>
        </form>`);
}

function submitWalletDeposit(event) {
    event.preventDefault();
    if (walletActionPending) return;
    const validation = validateDepositAmount(new FormData(event.currentTarget).get("amount"));
    if (!validation.valid) {
        walletFormError(validation.message);
        return;
    }
    Modal.confirm(`${validation.amount.toLocaleString("uz-UZ")} UZS to‘ldirish so‘rovi yaratilsinmi?`,
        () => createWalletDeposit(validation.amount));
}

async function createWalletDeposit(amount) {
    if (walletActionPending) return;
    setWalletSubmitting(true);
    walletFormError("");
    try {
        const result = await createDeposit(amount);
        walletActionPending = false;
        openDepositPaymentDetails(result);
        await refreshWallet();
    } catch (error) {
        setWalletSubmitting(false);
        walletFormError(error.message || "Deposit so‘rovi yaratilmadi.");
    }
}

function walletEscape(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function normalizeDepositPaymentDetails(result) {
    const details = result?.payment_details
        || result?.payment_requisites
        || result?.requisites
        || result;
    const normalized = {
        depositId: Number(result?.deposit_id ?? result?.id),
        amount: walletAmount(result?.amount),
        cardNumber: String(
            details?.card_number
            || details?.payment_card_number
            || details?.card
            || "",
        ).trim(),
        cardHolder: String(
            details?.card_holder
            || details?.payment_card_holder
            || details?.holder_name
            || "",
        ).trim(),
        bankName: String(
            details?.bank_name
            || details?.payment_bank_name
            || details?.bank
            || "",
        ).trim(),
    };

    if (!Number.isInteger(normalized.depositId) || normalized.depositId <= 0) {
        throw new Error("Backend deposit ID qaytarmadi.");
    }
    if (!normalized.cardNumber || !normalized.cardHolder || !normalized.bankName) {
        throw new Error("Backend to‘lov rekvizitlarini to‘liq qaytarmadi.");
    }
    return normalized;
}

const DEPOSIT_PRIMARY_BANKS = [
    { key: "click", name: "Click", icon: "🟢", scheme: "clickuz://" },
    { key: "payme", name: "Payme", icon: "🔵", scheme: "payme://" },
    { key: "uzum", name: "Uzum Bank", icon: "🟣", scheme: "uzumbank://" },
    { key: "anorbank", name: "Anorbank", icon: "🟠", scheme: "anorbank://" },
    { key: "kapitalbank", name: "Kapitalbank", icon: "🔴", scheme: "kapitalbank://" },
    { key: "hamkorbank", name: "Hamkorbank", icon: "🟡", scheme: "hamkorbank://" },
];

const DEPOSIT_OTHER_BANKS = [
    ["aloqabank", "Aloqabank", "aloqabank://"],
    ["agrobank", "Agrobank", "agrobank://"],
    ["asakabank", "Asakabank", "asakabank://"],
    ["ipakyuli", "Ipak Yo‘li Bank", "ipakyulibank://"],
    ["nbu", "Milliy Bank (NBU)", "nbuuz://"],
    ["xalq", "Xalq Banki", "xalqbank://"],
    ["turonbank", "Turonbank", "turonbank://"],
    ["ofb", "Orient Finans Bank", "ofbuz://"],
    ["tbc", "TBC Bank Uzbekistan", "tbcbankuz://"],
    ["davrbank", "Davr Bank", "davrbank://"],
    ["ziraat", "Ziraat Bank Uzbekistan", "ziraatbankuz://"],
    ["infinbank", "InfinBank", "infinbank://"],
    ["trastbank", "Trastbank", "trastbank://"],
    ["universalbank", "Universalbank", "universalbank://"],
    ["octobank", "Octobank", "octobank://"],
].map(([key, name, scheme]) => ({ key, name, icon: "🏦", scheme }));

function depositBankByKey(bankKey) {
    return [...DEPOSIT_PRIMARY_BANKS, ...DEPOSIT_OTHER_BANKS]
        .find((bank) => bank.key === bankKey) || null;
}

function depositCopyRow(label, value, copyValue = value) {
    return `<article class="deposit-detail-row">
        <div><small>${walletEscape(label)}</small><strong>${walletEscape(value)}</strong></div>
        <button class="deposit-copy-btn" type="button"
            data-copy-value="${walletEscape(copyValue)}" onclick="copyDepositValue(this)">
            <span>📋</span><b>Nusxalash</b>
        </button>
    </article>`;
}

function depositBankButton(bank) {
    return `<button class="deposit-bank-btn" type="button"
        onclick="openDepositBank('${bank.key}')">
        <span>${bank.icon}</span><b>${walletEscape(bank.name)}</b><i>↗</i>
    </button>`;
}

function openDepositPaymentDetails(result) {
    const details = normalizeDepositPaymentDetails(result);
    const formattedAmount = details.amount.toLocaleString("uz-UZ");
    showWalletAction(`
        <div class="deposit-premium">
            <header class="deposit-premium-header">
                <div><small>DEPOSIT #${details.depositId}</small>
                    <h3>💳 To‘lov rekvizitlari</h3></div>
                <span>SECURE</span>
            </header>
            <section class="deposit-details-card">
                ${depositCopyRow("Karta raqami", details.cardNumber)}
                ${depositCopyRow("Karta egasi", details.cardHolder)}
                ${depositCopyRow("Bank nomi", details.bankName)}
                ${depositCopyRow("To‘lov summasi", `${formattedAmount} UZS`, String(details.amount))}
            </section>
            <section class="deposit-banks-section">
                <div class="deposit-section-title"><span>📱</span>
                    <div><h4>Bank ilovasini ochish</h4><p>Asosiy banklar</p></div>
                </div>
                <div class="deposit-bank-grid">
                    ${DEPOSIT_PRIMARY_BANKS.map(depositBankButton).join("")}
                </div>
                <button class="deposit-other-banks-btn" type="button"
                    onclick="openDepositOtherBanks()">➕ Boshqa banklar</button>
            </section>
            <div id="walletFormError" class="wallet-form-error"></div>
            <button class="deposit-paid-btn" type="button"
                onclick="openDepositEvidence(${details.depositId})">
                <span>✅</span><b>Men to‘lov qildim</b><i>Davom etish</i>
            </button>
        </div>`);
}

async function copyDepositValue(button) {
    const value = String(button?.dataset?.copyValue || "").trim();
    if (!value) return false;
    try {
        await navigator.clipboard.writeText(value);
    } catch (_error) {
        const fallback = document.createElement("textarea");
        fallback.value = value;
        fallback.setAttribute("readonly", "");
        fallback.style.position = "fixed";
        fallback.style.opacity = "0";
        document.body.appendChild(fallback);
        fallback.select();
        const copied = document.execCommand?.("copy");
        fallback.remove();
        if (!copied) {
            walletFormError("Ma’lumotni nusxalab bo‘lmadi.");
            return false;
        }
    }
    tg?.HapticFeedback?.notificationOccurred?.("success");
    button.classList.add("is-copied");
    const label = button.querySelector("b");
    if (label) label.textContent = "Nusxalandi";
    setTimeout(() => {
        button.classList.remove("is-copied");
        if (label) label.textContent = "Nusxalash";
    }, 1500);
    return true;
}

function openDepositOtherBanks() {
    closeDepositOtherBanks();
    const modal = document.createElement("div");
    modal.id = "depositBanksModal";
    modal.className = "deposit-banks-modal";
    modal.innerHTML = `<section>
        <header><div><small>BARCHA BANKLAR</small><h3>Bankni tanlang</h3></div>
            <button type="button" onclick="closeDepositOtherBanks()">×</button></header>
        <div class="deposit-other-bank-list">
            ${DEPOSIT_OTHER_BANKS.map(depositBankButton).join("")}
        </div>
    </section>`;
    document.getElementById("walletActionOverlay")?.appendChild(modal);
}

function closeDepositOtherBanks() {
    document.getElementById("depositBanksModal")?.remove();
}

function openDepositBank(bankKey) {
    const bank = depositBankByKey(bankKey);
    if (!bank) return false;
    let appOpened = false;
    const detectOpen = () => {
        if (document.visibilityState === "hidden") appOpened = true;
    };
    document.addEventListener("visibilitychange", detectOpen);
    tg?.HapticFeedback?.impactOccurred?.("light");
    try {
        window.location.href = bank.scheme;
    } catch (_error) {
        appOpened = false;
    }
    setTimeout(() => {
        document.removeEventListener("visibilitychange", detectOpen);
        if (!appOpened && document.visibilityState !== "hidden") {
            Modal.alert(
                "Bank ilovasi ochilmadi",
                `${bank.name} ilovasi o‘rnatilmagan yoki bu qurilmada ochib bo‘lmadi.`,
            );
        }
    }, 1400);
    return true;
}

function openDepositEvidence(depositId) {
    const id = Number(depositId);
    showWalletAction(`
        <header><small>DEPOSIT #${id}</small><h3>To‘lov chekini yuboring</h3></header>
        <form onsubmit="submitDepositEvidence(event, ${id})">
            <label>Chek rasmi
                <input name="evidence" type="file" accept="image/*" required>
            </label>
            <p>Kamera yoki galereyadan to‘lov screenshotini tanlang.</p>
            <div id="walletFormError" class="wallet-form-error"></div>
            <button class="wallet-form-submit" type="submit">Chekni yuborish</button>
        </form>`);
}

function validateDepositEvidence(file) {
    if (!file || !String(file.type || "").startsWith("image/")) {
        return { valid: false, message: "Galereya yoki kameradan rasm tanlang." };
    }
    return { valid: true, file };
}

async function submitDepositEvidence(event, depositId) {
    event.preventDefault();
    if (walletActionPending) return;

    const file = event.currentTarget.elements.evidence?.files?.[0];
    const validation = validateDepositEvidence(file);
    if (!validation.valid) {
        walletFormError(validation.message);
        return;
    }

    setWalletSubmitting(true);
    walletFormError("");
    try {
        await uploadDepositEvidence(depositId, validation.file);
        walletActionPending = false;
        document.getElementById("walletActionOverlay")?.remove();
        Modal.success("Chek yuborildi. Admin tasdiqlashini kuting.");
    } catch (error) {
        setWalletSubmitting(false);
        walletFormError(error.message || "Chekni yuborib bo‘lmadi.");
    }
}

function openWithdraw() {
    showWalletAction(`
        <header><small>SECURE WALLET</small><h3>UZS yechish</h3>
            <button type="button" onclick="closeWalletAction()">×</button></header>
        <form onsubmit="submitWalletWithdraw(event)">
            <label>Karta raqami<input name="cardNumber" inputmode="numeric" maxlength="19"
                placeholder="8600 1234 1234 1234" oninput="formatWalletCardInput(this)" required></label>
            <label>Karta egasi<input name="cardHolder" autocomplete="name"
                placeholder="Ali Valiyev" required></label>
            <label>Bank nomi<input name="bankName" placeholder="Bank nomi" required></label>
            <label>Summa (UZS)<input name="amount" type="number" inputmode="numeric"
                min="15000" step="1" placeholder="15 000" required></label>
            <p>To‘lov 24 soat ichida yuboriladi.</p>
            <div id="walletFormError" class="wallet-form-error"></div>
            <button class="wallet-form-submit" type="submit">Yechish so‘rovini yuborish</button>
        </form>`);
}

function submitWalletWithdraw(event) {
    event.preventDefault();
    if (walletActionPending) return;
    const form = new FormData(event.currentTarget);
    const validation = validateWithdrawForm({
        amount: form.get("amount"),
        cardNumber: form.get("cardNumber"),
        cardHolder: form.get("cardHolder"),
        bankName: form.get("bankName"),
        balance: walletData?.uzs_balance,
    });
    if (!validation.valid) {
        walletFormError(validation.message);
        return;
    }
    Modal.confirm(`${validation.amount.toLocaleString("uz-UZ")} UZS yechish so‘rovi yuborilsinmi?`,
        () => createWalletWithdraw(validation));
}

async function createWalletWithdraw(data) {
    if (walletActionPending) return;
    setWalletSubmitting(true);
    walletFormError("");
    try {
        const result = await createWithdraw(
            data.amount, data.cardNumber, data.cardHolder, data.bankName,
        );
        walletActionPending = false;
        document.getElementById("walletActionOverlay")?.remove();
        Modal.success(`Withdraw #${result.withdraw_id} yaratildi. To‘lov 24 soat ichida yuboriladi.`);
        await refreshWallet();
    } catch (error) {
        setWalletSubmitting(false);
        walletFormError(error.message || "Withdraw so‘rovi yaratilmadi.");
    }
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        normalizeWalletData,
        normalizeDepositPaymentDetails,
        depositBankByKey,
        depositCopyRow,
        validateDepositAmount,
        validateWithdrawForm,
        validateDepositEvidence,
        walletCardDigits,
    };
}
