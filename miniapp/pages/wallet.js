let walletData = null;
const WALLET_MIN_AMOUNT = 15000;
let walletActionPending = false;

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
        document.getElementById("walletActionOverlay")?.remove();
        Modal.success(`Deposit #${result.deposit_id} yaratildi. Status: ${result.status}.`);
        await refreshWallet();
    } catch (error) {
        setWalletSubmitting(false);
        walletFormError(error.message || "Deposit so‘rovi yaratilmadi.");
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
        validateDepositAmount,
        validateWithdrawForm,
        walletCardDigits,
    };
}
