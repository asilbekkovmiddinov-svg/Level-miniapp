async function registerUser() {
    return await secureTelegramRequest(
        "/user/register", "POST", null, WALLET_API_MESSAGES,
        "Profilni ro‘yxatdan o‘tkazib bo‘lmadi."
    );
}

async function updateUserSeen() {
    return await secureTelegramRequest(
        "/user/seen", "POST", null, WALLET_API_MESSAGES,
        "Faollikni yangilab bo‘lmadi."
    );
}
const WALLET_REQUEST_TIMEOUT_MS = 15000;

const WALLET_API_MESSAGES = {
    401: "Telegram sessiyasi topilmadi yoki muddati tugagan. MiniApp’ni qayta oching.", 403: "Wallet ma’lumotini olish uchun ruxsat yo‘q.", 404: "Wallet yoki foydalanuvchi topilmadi.", 409: "Wallet ma’lumoti yangilanmoqda. Qayta urinib ko‘ring.", 413: "Yuborilgan fayl juda katta.", 415: "Fayl formati qo‘llab-quvvatlanmaydi.", 422: "Yuborilgan ma’lumotlar noto‘g‘ri.", 500: "Serverda vaqtinchalik xatolik yuz berdi.", 503: "Server xizmati vaqtincha ishlamayapti.",
};
const DEPOSIT_API_MESSAGES = {
    400: "Deposit summasi qabul qilinmadi.",
    401: "Telegram sessiyasi topilmadi yoki muddati tugagan. MiniApp’ni qayta oching.",
    403: "Deposit yaratish uchun ruxsat yo‘q.",
    404: "Foydalanuvchi yoki hamyon topilmadi.",
    409: "Deposit so‘rovi allaqachon yaratilgan yoki qayta urinilmoqda.",
    413: "Yuborilgan fayl juda katta.", 415: "Fayl formati qo‘llab-quvvatlanmaydi.", 422: "Yuborilgan ma’lumotlar noto‘g‘ri.", 500: "Serverda vaqtinchalik xatolik yuz berdi.", 503: "Server xizmati vaqtincha ishlamayapti.",
};
const WITHDRAW_API_MESSAGES = {
    400: "Withdraw ma’lumotlari qabul qilinmadi.",
    401: "Telegram sessiyasi topilmadi yoki muddati tugagan. MiniApp’ni qayta oching.",
    403: "Withdraw yaratish uchun ruxsat yo‘q.",
    404: "Foydalanuvchi yoki hamyon topilmadi.",
    409: "Withdraw so‘rovi allaqachon yaratilgan yoki qayta urinilmoqda.",
    413: "Yuborilgan fayl juda katta.", 415: "Fayl formati qo‘llab-quvvatlanmaydi.", 422: "Yuborilgan ma’lumotlar noto‘g‘ri.", 500: "Serverda vaqtinchalik xatolik yuz berdi.", 503: "Server xizmati vaqtincha ishlamayapti.",
};
const TRANSACTION_API_MESSAGES = {
    400: "Transaction filterlari noto‘g‘ri.", 401: "Telegram sessiyasi topilmadi yoki muddati tugagan.", 403: "Transaction tarixini ko‘rish uchun ruxsat yo‘q.", 404: "Transactionlar topilmadi.", 409: "Transactionlar yangilanmoqda.", 422: "Yuborilgan ma’lumotlar noto‘g‘ri.", 500: "Serverda vaqtinchalik xatolik yuz berdi.", 503: "Server xizmati vaqtincha ishlamayapti.",
};
const RECEIPT_API_MESSAGES = {
    400: "Receipt fayli qabul qilinmadi.", 401: "Telegram sessiyasi topilmadi yoki muddati tugagan. MiniApp’ni qayta oching.", 403: "Bu deposit uchun receipt yuborishga ruxsat yo‘q.", 404: "Deposit topilmadi.", 409: "Receipt holati o‘zgargan. Qayta urinib ko‘ring.", 413: "Receipt hajmi 5 MB dan oshmasligi kerak.", 415: "Faqat JPG, JPEG, PNG yoki WEBP rasm yuboring.", 422: "Receipt ma’lumotlari noto‘g‘ri.", 500: "Receipt saqlashda vaqtinchalik xatolik yuz berdi.", 503: "Server xizmati vaqtincha ishlamayapti.",
};
function getWalletInitData() {
    return window.Telegram?.WebApp?.initData || tg.initData || "";
}
async function secureTelegramRequest(path, method, body, messages, fallbackMessage) {
    const initData = getWalletInitData();
    if (!initData) {
        return {
            success: false,
            status_code: 401,
            message: messages[401],
        };
    }
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), WALLET_REQUEST_TIMEOUT_MS);
    let response;
    try {
        response = await fetch(`${API_URL}${path}`, {
            method,
            headers: {
                "Content-Type": "application/json",
                "X-Telegram-Init-Data": initData,
            },
            body: body ? JSON.stringify(body) : undefined,
            signal: controller.signal,
        });
    } catch (error) {
        const isTimeout = error?.name === "AbortError";
        return {
            success: false,
            status_code: isTimeout ? 504 : 503,
            message: isTimeout
                ? "Server javobi kutilgan vaqtdan oshdi."
                : "Internet yoki server bilan aloqa uzildi.",
        };
    } finally {
        window.clearTimeout(timeoutId);
    }
    let payload;
    try {
        payload = await response.json();
    } catch {
        return {
            success: false,
            status_code: response.status,
            message: "Server noto‘g‘ri javob qaytardi. Qayta urinib ko‘ring.",
        };
    }
    if (!response.ok) {
        return {
            success: false,
            status_code: response.status,
            message: messages[response.status] || fallbackMessage,
        };
    }

    return { ...payload, success: true };
}

async function getWallet() {
    return await secureTelegramRequest("/wallet", "GET", null, WALLET_API_MESSAGES, "Wallet ma’lumotini yuklab bo‘lmadi.");
}

async function createDeposit(amount) {
    return await secureTelegramRequest("/deposit/create", "POST", { amount }, DEPOSIT_API_MESSAGES, "Deposit yaratib bo‘lmadi.");
}

async function uploadDepositReceipt(depositId, file, onProgress) {
    const initData = getWalletInitData();
    if (!initData) return { success: false, status_code: 401, message: "Telegram sessiyasi topilmadi." };
    const form = new FormData(); form.append("file", file);
    return await new Promise((resolve) => {
        const request = new XMLHttpRequest();
        request.open("POST", `${API_URL}/deposits/${depositId}/receipt`);
        request.setRequestHeader("X-Telegram-Init-Data", initData);
        request.timeout = WALLET_REQUEST_TIMEOUT_MS;
        request.upload.onprogress = (event) => { if (event.lengthComputable && onProgress) onProgress(Math.round(event.loaded * 100 / event.total)); };
        request.onerror = () => resolve({ success: false, status_code: 503, message: "Internet yoki server bilan aloqa uzildi." });
        request.ontimeout = () => resolve({ success: false, status_code: 504, message: "Server javobi kutilgan vaqtdan oshdi." });
        request.onload = () => { try { const data = JSON.parse(request.responseText); const success = request.status >= 200 && request.status < 300; resolve({ ...data, success, status_code: request.status, message: success ? data.message : (RECEIPT_API_MESSAGES[request.status] || "Receipt yuklanmadi. Qayta urinib ko‘ring.") }); } catch { resolve({ success: false, status_code: request.status, message: "Server noto‘g‘ri javob qaytardi." }); } };
        request.send(form);
    });
}

async function createWithdraw(amount, cardNumber, cardHolder, bankName) {
    return await secureTelegramRequest("/withdraw/create", "POST", {
        amount,
        card_number: cardNumber,
        card_holder: cardHolder,
        bank_name: bankName,
    }, WITHDRAW_API_MESSAGES, "Withdraw yaratib bo‘lmadi.");
}

async function getTransactions(params = {}) {
    const query = new URLSearchParams({ limit: "20", offset: "0", ...params });
    return await secureTelegramRequest(`/transactions?${query}`, "GET", null, TRANSACTION_API_MESSAGES, "Transaction tarixini yuklab bo‘lmadi.");
}

async function getProducts(category = "") {
    const query = category
        ? `?category=${encodeURIComponent(category)}`
        : "";

    return await api(`/products/active${query}`);
}

async function createOrder(productId, region = null) {
    return await api("/orders/create", "POST", {
        telegram_id: TELEGRAM_ID,
        product_id: productId,
        region,
    });
}

async function getOpenP2POrders(orderType = "") {
    const query = orderType
        ? `?order_type=${orderType}`
        : "";

    return await api(`/p2p/open${query}`);
}

async function getMyP2POrders() {
    return await api(`/p2p/my/${TELEGRAM_ID}`);
}

async function getMyP2PTrades() {
    return await api(`/p2p/trades/my/${TELEGRAM_ID}`);
}

async function getP2PHistory(status = "") {
    const query = status
        ? `?status=${status}`
        : "";

    return await api(`/p2p/history/${TELEGRAM_ID}${query}`);
}

async function getWheelStatus() {
    return await api(`/wheel/status/${TELEGRAM_ID}`);
}

// =========================
// 1vs1 ARENA
// =========================

async function getOpenMatches() {
    return await api("/matches/open");
}

async function getMyMatches() {
    return await api(`/matches/user/${TELEGRAM_ID}`);
}

async function createMatch(efcAmount, scheduledAt) {
    return await api("/matches/", "POST", {
        creator_telegram_id: TELEGRAM_ID,
        efc_amount: efcAmount,
        scheduled_at: scheduledAt,
    });
}

async function acceptMatch(matchId) {
    return await api(`/matches/${matchId}/accept`, "POST", {
        opponent_telegram_id: TELEGRAM_ID,
    });
}

async function setReady(matchId) {
    return await api(`/matches/${matchId}/ready`, "POST", {
        telegram_id: TELEGRAM_ID,
    });
}

async function createRoomCode(matchId, roomCode) {
    return await api(`/matches/${matchId}/room-code`, "POST", {
        telegram_id: TELEGRAM_ID,
        room_code: roomCode,
    });
}

async function uploadMatchScreenshot(matchId, fileId) {
    return await api(`/matches/${matchId}/screenshot`, "POST", {
        telegram_id: TELEGRAM_ID,
        screenshot_file_id: fileId,
    });
}

async function getMatchStats() {
    return await api(`/matches/stats/${TELEGRAM_ID}`);
}

async function getMatchLeaderboard(period = "all") {
    return await api(`/matches/leaderboard?period=${period}`);
}

async function getMatchGuide() {
    return await api("/matches/guide");
}

async function getMatchOverview() {
    return await api("/matches/overview");
}
