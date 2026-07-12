let walletData = null;
let walletLastError = null;
const MIN_DEPOSIT_AMOUNT = 15000;
let depositState = { mode: "idle", raw: "", amount: null, error: "", result: null, submitting: false };
let withdrawState = { mode: "idle", cardNumber: "", cardHolder: "", bankName: "", raw: "", amount: null, error: "", result: null, submitting: false };
let transactionState = { items: [], offset: 0, hasMore: false, loading: false, filters: {} };
let walletPageLoadVersion = 0;

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

    walletData = data;
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
            <button class="wallet-action-primary wallet-withdraw-action" type="button" onclick="openWithdraw()">↗ Yechish<small>UZS withdraw</small></button>
        </div>
        <section id="walletDepositPanel"></section>
        <section id="walletWithdrawPanel"></section>
        <section id="walletHistoryPanel" class="history-panel"></section>
    </div>`;
    renderDepositPanel();
    renderWithdrawPanel();
    renderTransactionHistory();
}

function getHistoryPanel() { return document.getElementById("walletHistoryPanel"); }
function historyLabel(type) { return ({ DEPOSIT: "Deposit", WITHDRAW_REQUEST: "Pul yechish", WITHDRAW_REJECTED: "Withdraw qaytarildi", WHEEL_REWARD: "Wheel mukofoti", MATCH_REWARD: "Arena mukofoti", MATCH_SPEND: "Arena ishtiroki", ORDER_PAYMENT: "Buyurtma to‘lovi", ORDER_REFUND: "Buyurtma qaytarildi", ADMIN_ADD_EFC: "EFC qo‘shildi" }[type] || type || "Transaction"); }
function transactionAmount(item) { return `${item.direction === "CREDIT" ? "+" : "-"}${formatWalletBalance(item.amount)} ${item.currency}`; }
function transactionDate(value) { return value ? new Date(value).toLocaleString("uz-UZ") : "—"; }

function renderTransactionHistory() {
    const panel = getHistoryPanel(); if (!panel) return;
    const state = transactionState;
    const controls = `<div class="history-filters"><button onclick="setHistoryFilter('currency','')">Barchasi</button><button onclick="setHistoryFilter('currency','EFC')">EFC</button><button onclick="setHistoryFilter('currency','UZS')">UZS</button><button onclick="setHistoryFilter('direction','CREDIT')">Kirim</button><button onclick="setHistoryFilter('direction','DEBIT')">Chiqim</button><select onchange="setHistoryFilter('status',this.value)"><option value="">Status</option><option>SUCCESS</option><option>PENDING</option></select><select onchange="setHistoryFilter('transaction_type',this.value)"><option value="">Turi</option><option value="DEPOSIT">Deposit</option><option value="WITHDRAW_REQUEST">Withdraw</option><option value="WHEEL_REWARD">Wheel</option></select></div>`;
    if (state.loading && !state.items.length) { panel.innerHTML = `<h3>Transaction tarixi</h3>${controls}<div class="history-skeleton">Yuklanmoqda...</div>`; return; }
    if (state.error) { panel.innerHTML = `<h3>Transaction tarixi</h3>${controls}<div class="history-empty">${escapeWalletText(state.error)}<button onclick="loadTransactions(true)">Qayta urinish</button></div>`; return; }
    const rows = state.items.map((item, index) => `<button class="history-item ${item.direction === "CREDIT" ? "credit" : "debit"}" onclick="openTransactionDetail(${index})"><span><b>${historyLabel(item.transaction_type)}</b><small>${transactionDate(item.created_at)}</small></span><strong>${transactionAmount(item)}</strong><i>${escapeWalletText(item.status || "SUCCESS")}</i></button>`).join("");
    const body = rows || '<div class="history-empty">Hozircha transactionlar yo‘q.</div>';
    const more = state.hasMore ? `<button class="history-more" onclick="loadTransactions(false)" ${state.loading ? "disabled" : ""}>${state.loading ? "Yuklanmoqda..." : "Yana yuklash"}</button>` : state.items.length ? '<p class="history-end">Barcha transactionlar yuklandi.</p>' : "";
    panel.innerHTML = `<h3>Transaction tarixi</h3>${controls}<div class="history-list">${body}</div>${more}<div id="transactionDetail"></div>`;
}

function setHistoryFilter(name, value) { transactionState.filters[name] = value; loadTransactions(true); }
async function loadTransactions(reset) {
    if (transactionState.loading) return;
    if (reset) { transactionState.items = []; transactionState.offset = 0; transactionState.hasMore = false; transactionState.error = ""; }
    transactionState.loading = true; renderTransactionHistory();
    const result = await getTransactions({ ...transactionState.filters, offset: String(transactionState.offset), limit: "20" });
    transactionState.loading = false;
    if (!result || result.success === false || !Array.isArray(result.items)) { transactionState.error = result?.message || "Transaction tarixini yuklab bo‘lmadi."; renderTransactionHistory(); return; }
    transactionState.items.push(...result.items); transactionState.offset += result.items.length; transactionState.hasMore = Boolean(result.has_more); renderTransactionHistory();
}
function openTransactionDetail(index) { const item = transactionState.items[index], panel = document.getElementById("transactionDetail"); if (!item || !panel) return; panel.innerHTML = `<article class="transaction-detail"><b>${historyLabel(item.transaction_type)}</b><p>ID: ${item.id}</p><p>${transactionAmount(item)} · ${escapeWalletText(item.status)}</p><p>${escapeWalletText(item.description || "Izoh yo‘q")}</p><p>${transactionDate(item.created_at)}</p><button onclick="this.parentElement.remove()">Yopish</button></article>`; }

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
        const uploaded = deposit.receipt_uploaded;
        const receiptError = depositState.error ? `<p class="deposit-error">${escapeWalletText(depositState.error)}</p>` : "";
        const notification = uploaded && deposit.notification_status
            ? `<p>Admin xabarnomasi: <b>${escapeWalletText(deposit.notification_status)}</b></p>`
            : "";
        const preview = depositState.previewUrl
            ? `<div id="receiptPreview"><img src="${escapeWalletText(depositState.previewUrl)}" alt="Receipt preview"><button type="button" onclick="removeDepositReceipt()" ${depositState.uploading ? "disabled" : ""}>Olib tashlash</button></div>`
            : '<div id="receiptPreview"></div>';
        const uploadUi = uploaded ? "" : `<input id="receiptFile" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onchange="selectDepositReceipt(this)" ${depositState.uploading ? "disabled" : ""}>${preview}<div class="deposit-buttons"><button type="button" class="deposit-secondary" onclick="removeDepositReceipt()" ${(!depositState.file || depositState.uploading) ? "disabled" : ""}>Bekor qilish</button><button class="deposit-submit" onclick="uploadSelectedReceipt()" ${(!depositState.file || depositState.uploading) ? "disabled" : ""}>${depositState.uploading ? `Yuklanmoqda ${depositState.uploadProgress || 0}%` : "Receipt yuborish"}</button></div>`;
        panel.innerHTML = `<article class="deposit-panel deposit-success"><span>${uploaded ? "RECEIPT YUBORILDI" : "RECEIPT KERAK"}</span><strong>${amountText}</strong><p>ID: ${escapeWalletText(deposit.id || deposit.deposit_id || "—")}</p><p>Status: <b>${escapeWalletText(deposit.status || "PENDING")}</b></p><p>${uploaded ? "Receipt muvaffaqiyatli yuborildi." : "Deposit yakunlanishi uchun receipt yuklang."}</p>${notification}${receiptError}${uploadUi}<small>${escapeWalletText(deposit.message || "")}</small></article>`;
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

function selectDepositReceipt(input) {
    const file = input.files?.[0];
    if (!file) return;
    const extension = file.name.split(".").pop()?.toLowerCase();
    const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
    if (!new Set(["jpg", "jpeg", "png", "webp"]).has(extension) || !allowedTypes.has(file.type) || file.size > 5 * 1024 * 1024) {
        depositState.error = "Faqat JPG, JPEG, PNG yoki WEBP va 5 MB gacha ruxsat.";
        renderDepositPanel();
        return;
    }
    if (depositState.previewUrl) URL.revokeObjectURL(depositState.previewUrl);
    depositState.file = file;
    depositState.previewUrl = URL.createObjectURL(file);
    depositState.error = "";
    renderDepositPanel();
}

function removeDepositReceipt() {
    if (depositState.previewUrl) URL.revokeObjectURL(depositState.previewUrl);
    depositState.file = null;
    depositState.previewUrl = "";
    depositState.error = "";
    renderDepositPanel();
}

async function uploadSelectedReceipt() {
    if (depositState.uploading || !depositState.file) return;
    const deposit = depositState.result || {};
    const depositId = deposit.id || deposit.deposit_id;
    if (!depositId) {
        depositState.error = "Deposit ID topilmadi. Qayta deposit yaratmang, sahifani yangilang.";
        renderDepositPanel();
        return;
    }
    depositState.uploading = true;
    depositState.uploadProgress = 0;
    depositState.error = "";
    renderDepositPanel();
    const result = await uploadDepositReceipt(depositId, depositState.file, (progress) => {
        depositState.uploadProgress = progress;
        renderDepositPanel();
    });
    depositState.uploading = false;
    if (!result || result.success === false) {
        depositState.error = result?.message || "Receipt yuklanmadi. Qayta urinib ko‘ring.";
        renderDepositPanel();
        return;
    }
    if (depositState.previewUrl) URL.revokeObjectURL(depositState.previewUrl);
    depositState.previewUrl = "";
    depositState.file = null;
    depositState.result = { ...deposit, ...result, receipt_uploaded: true };
    renderDepositPanel();
}

function getWithdrawPanel() {
    return document.getElementById("walletWithdrawPanel");
}

function formatCardNumber(value) {
    return String(value || "").replace(/\D/g, "").slice(0, 16).match(/.{1,4}/g)?.join(" ") || "";
}

function validateWithdraw() {
    const cardNumber = withdrawState.cardNumber.replace(/\D/g, "");
    if (cardNumber.length !== 16) return "Karta raqami 16 ta raqamdan iborat bo‘lishi kerak.";
    if (withdrawState.cardHolder.trim().length < 3) return "Karta egasining ism-familiyasi juda qisqa.";
    if (!withdrawState.bankName.trim()) return "Bank nomini kiriting.";

    const amount = getDepositAmount(withdrawState.raw);
    if (!amount.amount) return amount.error;
    if (amount.amount > Number(walletData?.uzs_balance)) return "UZS balansingiz bu summa uchun yetarli emas.";
    return { amount: amount.amount, cardNumber };
}

function renderWithdrawPanel() {
    const panel = getWithdrawPanel();
    if (!panel || withdrawState.mode === "idle") return;

    if (withdrawState.mode === "success") {
        const withdraw = withdrawState.result || {};
        const createdAt = withdraw.created_at || withdraw.createdAt || new Date().toLocaleString("uz-UZ");
        panel.innerHTML = `<article class="withdraw-panel withdraw-success"><span>WITHDRAW YARATILDI</span><strong>${formatWalletBalance(withdrawState.amount)} UZS</strong><p>ID: ${escapeWalletText(withdraw.withdraw_id || withdraw.id || "—")}</p><p>Status: <b>${escapeWalletText(withdraw.status || "PENDING")}</b></p><p>Karta: **** ${escapeWalletText(withdrawState.cardNumber.slice(-4))}</p><p>Yaratilgan: ${escapeWalletText(createdAt)}</p><small>${escapeWalletText(withdraw.message || "To‘lov 24 soat ichida yuboriladi.")}</small></article>`;
        return;
    }

    if (withdrawState.mode === "confirm") {
        panel.innerHTML = `<article class="withdraw-panel"><span>WITHDRAWNI TASDIQLASH</span><strong>${formatWalletBalance(withdrawState.amount)} UZS</strong><p>Karta: <b>${formatCardNumber(withdrawState.cardNumber)}</b></p><p>Egasi: <b>${escapeWalletText(withdrawState.cardHolder)}</b></p><p>Bank: <b>${escapeWalletText(withdrawState.bankName)}</b></p><em>To‘lov 24 soat ichida yuboriladi.</em><div class="deposit-buttons"><button type="button" class="deposit-secondary" onclick="editWithdraw()">Ortga</button><button type="button" class="withdraw-submit" onclick="submitWithdraw()">Tasdiqlash</button></div></article>`;
        return;
    }

    const isSubmitting = withdrawState.mode === "submitting";
    const error = withdrawState.error ? `<p class="deposit-error">${escapeWalletText(withdrawState.error)}</p>` : "";
    const submitLabel = isSubmitting ? "Yuborilmoqda..." : withdrawState.error ? "Qayta urinish" : "Davom etish";
    panel.innerHTML = `<article class="withdraw-panel"><span>UZS WITHDRAW</span><label for="withdrawCard">Karta raqami</label><input id="withdrawCard" inputmode="numeric" autocomplete="cc-number" placeholder="0000 0000 0000 0000" value="${formatCardNumber(withdrawState.cardNumber)}" oninput="handleWithdrawCard(this)" ${isSubmitting ? "disabled" : ""}><label for="withdrawHolder">Karta egasi</label><input id="withdrawHolder" autocomplete="cc-name" placeholder="Ism Familiya" value="${escapeWalletText(withdrawState.cardHolder)}" oninput="handleWithdrawField('cardHolder', this.value)" ${isSubmitting ? "disabled" : ""}><label for="withdrawBank">Bank nomi</label><input id="withdrawBank" autocomplete="organization" placeholder="Bank nomi" value="${escapeWalletText(withdrawState.bankName)}" oninput="handleWithdrawField('bankName', this.value)" ${isSubmitting ? "disabled" : ""}><label for="withdrawAmount">Summa (minimum 15 000 UZS)</label><input id="withdrawAmount" inputmode="numeric" autocomplete="off" placeholder="15 000" value="${escapeWalletText(withdrawState.raw)}" oninput="handleWithdrawField('raw', this.value)" onblur="formatWithdrawAmount()" ${isSubmitting ? "disabled" : ""}>${error}<div class="deposit-buttons"><button type="button" class="deposit-secondary" onclick="closeWithdraw()" ${isSubmitting ? "disabled" : ""}>Bekor qilish</button><button type="button" class="withdraw-submit" onclick="confirmWithdraw()" ${isSubmitting ? "disabled" : ""}>${submitLabel}</button></div></article>`;
}

function closeWithdraw() {
    withdrawState.mode = "idle";
    const panel = getWithdrawPanel();
    if (panel) panel.innerHTML = "";
}

function handleWithdrawCard(input) {
    withdrawState.cardNumber = input.value.replace(/\D/g, "");
    input.value = formatCardNumber(withdrawState.cardNumber);
    withdrawState.error = withdrawState.cardNumber.length > 16 ? "Karta raqami 16 ta raqamdan iborat bo‘lishi kerak." : "";
}

function handleWithdrawField(field, value) {
    withdrawState[field] = value;
    withdrawState.error = "";
}

function formatWithdrawAmount() {
    const amount = getDepositAmount(withdrawState.raw);
    if (amount.amount) {
        withdrawState.raw = formatWalletBalance(amount.amount);
        renderWithdrawPanel();
    }
}

function editWithdraw() {
    withdrawState.mode = "form";
    renderWithdrawPanel();
}

function confirmWithdraw() {
    const value = validateWithdraw();
    if (typeof value === "string") {
        withdrawState.mode = "form";
        withdrawState.error = value;
        renderWithdrawPanel();
        return;
    }
    withdrawState.amount = value.amount;
    withdrawState.cardNumber = value.cardNumber;
    withdrawState.raw = formatWalletBalance(value.amount);
    withdrawState.error = "";
    withdrawState.mode = "confirm";
    renderWithdrawPanel();
}

async function submitWithdraw() {
    if (withdrawState.submitting || !withdrawState.amount) return;

    withdrawState.submitting = true;
    withdrawState.mode = "submitting";
    renderWithdrawPanel();
    const result = await createWithdraw(withdrawState.amount, withdrawState.cardNumber, withdrawState.cardHolder.trim(), withdrawState.bankName.trim());
    withdrawState.submitting = false;
    if (!result || result.success === false) {
        withdrawState.mode = "form";
        withdrawState.error = result?.message || "Withdraw yaratib bo‘lmadi.";
        renderWithdrawPanel();
        return;
    }

    withdrawState.result = result.data || result;
    withdrawState.result.status = withdrawState.result.status || "PENDING";
    withdrawState.mode = "success";
    renderWithdrawPanel();
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
    const requestVersion = ++walletPageLoadVersion;
    Navbar.setActive("wallet");
    showPage("walletPage", "Hamyon");
    renderWalletLoading();

    try {
        const data = await requestWalletData();
        if (requestVersion !== walletPageLoadVersion) return null;
        if (!data) {
            renderWalletError(walletLastError);
            return null;
        }
        renderWalletPage(data);
        await loadTransactions(true);
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
    withdrawState = { mode: "form", cardNumber: "", cardHolder: "", bankName: "", raw: "", amount: null, error: "", result: null, submitting: false };
    renderWithdrawPanel();
}
