let walletData = null;
let walletLastError = null;
const MIN_DEPOSIT_AMOUNT = 15000;
let depositState = { mode: "idle", raw: "", amount: null, error: "", result: null, submitting: false };

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
            <button class="wallet-action-primary" type="button" onclick="openDeposit()">＋ To‘ldirish<small>UZS deposit</small></button>
            <button class="wallet-action-disabled" type="button" disabled>↗ Yechish<small>Keyingi bosqichda</small></button>
        </div>
        <section id="walletDepositPanel"></section>
    </div>`;
    renderDepositPanel();
}

function getDepositPanel() {
    return document.getElementById("walletDepositPanel");
}

function getDepositAmount(raw) {
    const normalized = String(raw || "").replace(/[\s\u00a0]/g, "");
    if (!/^\d+$/.test(normalized)) return { error: "Summani faqat butun son ko‘rinishida kiriting." };

    const amount = Number(normalized);
    if (!Number.isSafeInteger(amount) || amount <= 0) return { error: "Summa 0 dan katta bo‘lishi kerak." };
    if (amount < MIN_DEPOSIT_AMOUNT) return { error: "Minimal deposit summasi 15 000 UZS." };
    return { amount };
}

function renderDepositPanel() {
    const panel = getDepositPanel();
    if (!panel || depositState.mode === "idle") return;

    const amountText = depositState.amount ? `${formatWalletBalance(depositState.amount)} UZS` : "";
    if (depositState.mode === "success") {
        const deposit = depositState.result || {};
        const createdAt = deposit.created_at || deposit.createdAt || new Date().toLocaleString("uz-UZ");
        panel.innerHTML = `<article class="deposit-panel deposit-success"><span>DEPOSIT YARATILDI</span><strong>${amountText}</strong><p>ID: ${escapeWalletText(deposit.id || deposit.deposit_id || "—")}</p><p>Status: <b>${escapeWalletText(deposit.status || "PENDING")}</b></p><p>Yaratilgan: ${escapeWalletText(createdAt)}</p><small>${escapeWalletText(deposit.message || "Deposit so‘rovi qabul qilindi.")}</small><em>Receipt upload keyingi sprintda qo‘shiladi.</em></article>`;
        return;
    }

    if (depositState.mode === "confirm") {
        panel.innerHTML = `<article class="deposit-panel"><span>DEPOSITNI TASDIQLASH</span><strong>${amountText}</strong><p>So‘rov PENDING holatida yaratiladi.</p><div class="deposit-buttons"><button type="button" class="deposit-secondary" onclick="editDeposit()">Ortga</button><button type="button" class="deposit-submit" onclick="submitDeposit()">Tasdiqlash</button></div></article>`;
        return;
    }

    const isSubmitting = depositState.mode === "submitting";
    const error = depositState.error ? `<p class="deposit-error">${escapeWalletText(depositState.error)}</p>` : "";
    const submitLabel = isSubmitting ? "Yuborilmoqda..." : depositState.error ? "Qayta urinish" : "Davom etish";
    panel.innerHTML = `<article class="deposit-panel"><span>UZS DEPOSIT</span><label for="depositAmount">Summa (minimum 15 000 UZS)</label><input id="depositAmount" inputmode="numeric" autocomplete="off" placeholder="15 000" value="${escapeWalletText(depositState.raw)}" oninput="handleDepositInput(this.value)" onblur="formatDepositInput()" ${isSubmitting ? "disabled" : ""}>${error}<div class="deposit-buttons"><button type="button" class="deposit-secondary" onclick="closeDeposit()" ${isSubmitting ? "disabled" : ""}>Bekor qilish</button><button type="button" class="deposit-submit" onclick="confirmDeposit()" ${isSubmitting ? "disabled" : ""}>${submitLabel}</button></div></article>`;
}

function openDeposit() {
    depositState = { mode: "form", raw: "", amount: null, error: "", result: null, submitting: false };
    renderDepositPanel();
}

function closeDeposit() {
    depositState = { mode: "idle", raw: "", amount: null, error: "", result: null, submitting: false };
    renderDepositPanel();
    const panel = getDepositPanel();
    if (panel) panel.innerHTML = "";
}

function handleDepositInput(value) {
    depositState.raw = value;
    depositState.error = "";
}

function formatDepositInput() {
    const value = getDepositAmount(depositState.raw);
    if (value.amount) {
        depositState.raw = formatWalletBalance(value.amount);
        renderDepositPanel();
    }
}

function confirmDeposit() {
    const value = getDepositAmount(depositState.raw);
    if (!value.amount) {
        depositState.error = value.error;
        depositState.mode = "form";
        renderDepositPanel();
        return;
    }
    depositState.amount = value.amount;
    depositState.raw = formatWalletBalance(value.amount);
    depositState.mode = "confirm";
    depositState.error = "";
    renderDepositPanel();
}

async function submitDeposit() {
    if (depositState.submitting || !depositState.amount) return;

    depositState.submitting = true;
    depositState.mode = "submitting";
    renderDepositPanel();
    const result = await createDeposit(depositState.amount);
    depositState.submitting = false;
    if (!result || result.success === false) {
        depositState.error = result?.message || "Deposit yaratib bo‘lmadi.";
        if (/receipt/i.test(depositState.error)) depositState.error += " Receipt upload keyingi sprintda qo‘shiladi.";
        depositState.mode = "form";
        renderDepositPanel();
        return;
    }

    depositState.result = result.data || result;
    depositState.result.status = depositState.result.status || "PENDING";
    depositState.mode = "success";
    renderDepositPanel();
    const wallet = await requestWalletData();
    if (wallet) renderWalletPage(wallet);
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

async function openWithdraw() {
    tg.showPopup({ title: "UZS yechish", message: "Yechish MiniApp’da keyingi bosqichda ochiladi.", buttons: [{ type: "ok", text: "Tushunarli" }] });
}
