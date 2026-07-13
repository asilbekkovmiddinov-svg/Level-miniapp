async function registerUser() {
    if (!TELEGRAM_ID) return null;

    return await api("/user/register", "POST", {
        telegram_id: TELEGRAM_ID,
        first_name: FIRST_NAME || "User",
        username: USERNAME || null,
        language: "uz",
    });
}

async function updateUserSeen() {
    if (!TELEGRAM_ID) return null;

    return await api(`/user/${TELEGRAM_ID}/seen`, "POST");
}

async function getWallet() {
    const initData = window.Telegram?.WebApp?.initData || tg?.initData || "";
    if (!initData) {
        throw new Error("Telegram tasdiqlash ma’lumoti topilmadi.");
    }

    const response = await fetch(`${API_URL}/wallet`, {
        method: "GET",
        headers: {
            "X-Telegram-Init-Data": initData,
        },
    });

    let payload;
    try {
        payload = await response.json();
    } catch (_error) {
        throw new Error("Wallet serveridan noto‘g‘ri javob olindi.");
    }

    if (!response.ok) {
        throw new Error("Hamyonni yuklab bo‘lmadi.");
    }

    return payload;
}

async function createDeposit(amount) {
    return await api("/deposit/create", "POST", {
        telegram_id: TELEGRAM_ID,
        amount,
    });
}

async function createWithdraw(amount, cardNumber, cardHolder, bankName) {
    return await api("/withdraw/create", "POST", {
        telegram_id: TELEGRAM_ID,
        amount,
        card_number: cardNumber,
        card_holder: cardHolder,
        bank_name: bankName,
    });
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
