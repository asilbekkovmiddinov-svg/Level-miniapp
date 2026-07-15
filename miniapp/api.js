async function registerUser() {
    if (!TELEGRAM_ID) return null;
    return await walletRequest("/user/register", { method: "POST" });
}

async function updateUserSeen() {
    if (!TELEGRAM_ID) return null;

    return await walletRequest("/user/seen", { method: "POST" });
}

function telegramInitData() {
    return window.Telegram?.WebApp?.initData || tg?.initData || "";
}

function walletHttpMessage(status) {
    const messages = {
        400: "Kiritilgan ma’lumotlarni tekshiring.",
        401: "Telegram tasdiqlashi yaroqsiz yoki eskirgan.",
        403: "Bu amalni bajarishga ruxsat yo‘q.",
        404: "Hamyon topilmadi.",
        409: "So‘rov holati o‘zgargan. Qayta urinib ko‘ring.",
        422: "Kiritilgan ma’lumotlar formati noto‘g‘ri.",
    };
    return status >= 500
        ? "Serverda vaqtinchalik xatolik yuz berdi."
        : messages[status] || "So‘rovni bajarib bo‘lmadi.";
}

async function walletRequest(path, { method = "GET", body = null, idempotencyKey = null } = {}) {
    const initData = telegramInitData();
    if (!initData) {
        throw new Error("Telegram tasdiqlash ma’lumoti topilmadi.");
    }

    const response = await fetch(`${API_URL}${path}`, {
        method,
        headers: {
            "X-Telegram-Init-Data": initData,
            ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
            ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });

    let payload;
    try {
        payload = await response.json();
    } catch (_error) {
        throw new Error("Wallet serveridan noto‘g‘ri javob olindi.");
    }

    if (!response.ok) {
        throw new Error(walletHttpMessage(response.status));
    }

    return payload;
}

async function getWallet() {
    return await walletRequest("/wallet");
}

async function getWalletTransactions({ limit = 10, offset = 0 } = {}) {
    return await walletRequest(`/transactions?limit=${limit}&offset=${offset}`);
}

async function createDeposit(amount) {
    return await walletRequest("/deposit/create", {
        method: "POST",
        body: { amount },
        idempotencyKey: walletIdempotencyKey("deposit"),
    });
}

async function uploadDepositEvidence(depositId, file) {
    const id = Number(depositId);
    if (!Number.isInteger(id) || id <= 0) {
        throw new Error("Deposit ID noto‘g‘ri.");
    }
    if (!(file instanceof Blob) || !String(file.type || "").startsWith("image/")) {
        throw new Error("To‘lov cheki rasm formatida bo‘lishi kerak.");
    }

    const initData = telegramInitData();
    if (!initData) {
        throw new Error("Telegram tasdiqlash ma’lumoti topilmadi.");
    }

    const formData = new FormData();
    formData.append("file", file, file.name || `deposit-${id}-receipt.jpg`);

    const response = await fetch(`${API_URL}/deposit/${id}/evidence`, {
        method: "POST",
        headers: {
            "X-Telegram-Init-Data": initData,
        },
        body: formData,
    });

    let payload;
    try {
        payload = await response.json();
    } catch (_error) {
        throw new Error("Evidence serveridan noto‘g‘ri javob olindi.");
    }

    if (!response.ok) {
        throw new Error(walletHttpMessage(response.status));
    }

    if (payload.notification_status === "FAILED") {
        throw new Error("Admin notification yuborilmadi. Qayta urinib ko‘ring.");
    }
    return payload;
}

async function createWithdraw(amount, cardNumber, cardHolder, bankName) {
    return await walletRequest("/withdraw/create", {
        method: "POST",
        body: {
            amount,
            card_number: cardNumber,
            card_holder: cardHolder,
            bank_name: bankName,
        },
        idempotencyKey: walletIdempotencyKey("withdraw"),
    });
}

function walletIdempotencyKey(scope) {
    const randomPart = globalThis.crypto?.randomUUID?.()
        || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `${scope}-${randomPart}`;
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

async function getUserOrders() {
    return await api(`/orders/user/${TELEGRAM_ID}`);
}

async function getOpenP2POrders(orderType = "") {
    const query = orderType
        ? `?order_type=${orderType}`
        : "";

    return await api(`/p2p/open${query}`);
}

async function createP2POrder({ orderType, efcAmount, priceUzs, minTradeEfc, responseMinutes }) {
    return await walletRequest("/p2p/create", {
        method: "POST",
        body: {
            telegram_id: TELEGRAM_ID,
            order_type: orderType,
            efc_amount: efcAmount,
            price_uzs: priceUzs,
            min_trade_efc: minTradeEfc,
            response_minutes: responseMinutes,
        },
    });
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
