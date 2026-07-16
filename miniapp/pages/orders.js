let orderHistory = [];
let ordersLoading = false;

const ORDER_STATUS_LABELS = {
    WAITING_DETAILS: "Ma’lumotlar kutilmoqda",
    WAITING_OTP: "Kod kutilmoqda",
    OTP_SUBMITTED: "Kod yuborildi",
    PENDING: "Kutilmoqda",
    CLAIMED: "Tekshiruvda",
    PROCESSING: "Jarayonda",
    OWNER_APPROVED: "Tasdiq kutilmoqda",
    APPROVED: "Tasdiqlandi",
    COMPLETED: "Bajarildi",
    SUCCESS: "Bajarildi",
    REJECTED: "Rad etildi",
    CANCELLED: "Bekor qilindi",
    TIMEOUT: "Vaqti tugadi",
    WAITING_PLAYER: "Raqib kutilmoqda",
    WAITING_READY: "Tayyorlik kutilmoqda",
    ROOM_READY: "Xona tayyor",
    PLAYING: "O‘ynalmoqda",
    WAITING_ADMIN: "Admin tekshiruvida",
    TECHNICAL_REVIEW: "Texnik tekshiruv",
    OPEN: "Faol",
    PARTIAL: "Qisman bajarildi",
};

function ordersEscape(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function ordersArray(payload, keys = []) {
    if (Array.isArray(payload)) return payload;
    for (const key of ["data", "items", ...keys]) {
        if (Array.isArray(payload?.[key])) return payload[key];
    }
    return [];
}

function orderDate(item) {
    return item.created_at || item.updated_at || item.completed_at
        || item.approved_at || item.scheduled_at || item.scheduledAt
        || item.timestamp || null;
}

function normalizeHistoryItem(kind, item, index = 0) {
    const status = String(item.status || item.transaction_status || "PENDING").toUpperCase();
    const definitions = {
        deposit: { type: "Deposit", icon: "↓", currency: "UZS" },
        withdraw: { type: "Withdraw", icon: "↑", currency: "UZS" },
        p2p_order: { type: "P2P Order", icon: "P", currency: item.locked_currency || "EFC" },
        p2p_trade: { type: "P2P Trade", icon: "P", currency: "EFC" },
        arena: { type: "Arena Match", icon: "A", currency: "EFC" },
        shop: { type: "Coin Shop", icon: "C", currency: "UZS" },
        wheel_coin: { type: "Wheel Coin", icon: "C", currency: "COIN" },
        wheel: { type: "Wheel Reward", icon: "W", currency: item.currency || "EFC" },
    };
    const definition = definitions[kind];
    const amount = item.amount ?? item.coin_amount ?? item.efc_amount ?? item.stakeEfc ?? item.locked_amount
        ?? item.total_uzs ?? item.total_price ?? item.price_uzs ?? item.price ?? 0;
    const id = item.id ?? item.order_id ?? item.match_id ?? item.transaction_id ?? index + 1;
    const description = item.description || item.product_name || item.game_type || item.gameType
        || item.order_type || item.transaction_type || definition.type;
    return {
        key: `${kind}-${id}-${index}`,
        kind,
        id,
        type: definition.type,
        icon: definition.icon,
        status,
        amount: Number(amount || 0),
        currency: String(item.currency || definition.currency).toUpperCase(),
        date: orderDate(item),
        description: String(description),
        extra: item,
    };
}

function normalizeTransactionHistory(payload) {
    return ordersArray(payload).flatMap((item, index) => {
        const type = String(item.transaction_type || item.type || "").toUpperCase();
        if (type.includes("DEPOSIT")) return [normalizeHistoryItem("deposit", item, index)];
        if (type.includes("WITHDRAW")) return [normalizeHistoryItem("withdraw", item, index)];
        if (type.includes("WHEEL") || type.includes("SPIN")) {
            return [normalizeHistoryItem("wheel", item, index)];
        }
        return [];
    });
}

function normalizeOrdersHistory({ transactions, shop, wheelCoins, p2pOrders, p2pTrades, matches }) {
    const combined = [
        ...normalizeTransactionHistory(transactions),
        ...ordersArray(shop, ["orders"]).map((item, index) => normalizeHistoryItem("shop", item, index)),
        ...ordersArray(wheelCoins, ["orders"]).map((item, index) => normalizeHistoryItem("wheel_coin", item, index)),
        ...ordersArray(p2pOrders, ["orders"]).map((item, index) => normalizeHistoryItem("p2p_order", item, index)),
        ...ordersArray(p2pTrades, ["trades"]).map((item, index) => normalizeHistoryItem("p2p_trade", item, index)),
        ...ordersArray(matches, ["matches"]).map((item, index) => normalizeHistoryItem("arena", item, index)),
    ];
    return combined.sort((left, right) => {
        const rightTime = Date.parse(right.date || "") || 0;
        const leftTime = Date.parse(left.date || "") || 0;
        return rightTime - leftTime;
    });
}

async function loadAllWalletTransactions() {
    const items = [];
    const limit = 100;
    for (let offset = 0; offset < 1000; offset += limit) {
        const page = await getWalletTransactions({ limit, offset });
        const batch = ordersArray(page);
        items.push(...batch);
        if (!page?.has_more || batch.length < limit) break;
    }
    return items;
}

async function loadAllArenaMatches() {
    const matches = [];
    const limit = 100;
    for (let skip = 0; skip < 1000; skip += limit) {
        const batch = await arenaApiClient.myMatches({ skip, limit });
        matches.push(...batch);
        if (batch.length < limit) break;
    }
    return matches;
}

function ordersDateTime(value) {
    if (!value || Number.isNaN(Date.parse(value))) return "Sana ko‘rsatilmagan";
    return new Intl.DateTimeFormat("uz-UZ", {
        timeZone: "Asia/Tashkent",
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
    }).format(new Date(value));
}

function ordersAmount(order) {
    return `${Number(order.amount || 0).toLocaleString("uz-UZ", {
        maximumFractionDigits: 4,
    })} ${ordersEscape(order.currency)}`;
}

function orderStatusBadge(status) {
    const value = String(status || "PENDING").toUpperCase();
    return `<span class="orders-status orders-status-${value.toLowerCase()}">
        ${ordersEscape(ORDER_STATUS_LABELS[value] || value)}
    </span>`;
}

async function loadOrdersPage() {
    Navbar.setActive("orders");
    showPage("ordersPage", "Buyurtmalar");
    const page = document.getElementById("ordersPage");
    page.innerHTML = `<section class="orders-v2">
        <header class="orders-v2-header"><div><small>ACTIVITY</small><h2>Buyurtmalar tarixi</h2>
            <p>Barcha operatsiyalaringiz bitta xavfsiz ro‘yxatda.</p></div>
            <button type="button" onclick="refreshOrders()" aria-label="Yangilash">↻</button>
        </header>
        <div id="ordersList" class="orders-v2-list">${ordersSkeleton()}</div>
    </section>`;
    await loadOrders();
}

function ordersSkeleton() {
    return `<div class="orders-skeleton">${Array.from({ length: 4 }, () => "<i></i>").join("")}</div>`;
}

async function loadOrders() {
    if (ordersLoading) return;
    ordersLoading = true;
    const container = document.getElementById("ordersList");
    if (container) container.innerHTML = ordersSkeleton();
    try {
        const requests = await Promise.allSettled([
            loadAllWalletTransactions(),
            getUserOrders(),
            getWheelCoinOrders(),
            getMyP2POrders(),
            getMyP2PTrades(),
            loadAllArenaMatches(),
        ]);
        if (requests.every((result) => result.status === "rejected")) {
            throw requests[0].reason;
        }
        const value = (index) => requests[index].status === "fulfilled" ? requests[index].value : [];
        orderHistory = normalizeOrdersHistory({
            transactions: value(0), shop: value(1), wheelCoins: value(2),
            p2pOrders: value(3), p2pTrades: value(4), matches: value(5),
        });
        renderOrders();
    } catch (error) {
        console.error(error);
        if (container) container.innerHTML = `<div class="orders-error"><b>Tarix yuklanmadi</b>
            <span>Internet aloqasini tekshirib, qayta urinib ko‘ring.</span>
            <button type="button" onclick="refreshOrders()">Qayta urinish</button></div>`;
    } finally {
        ordersLoading = false;
    }
}

function renderOrders() {
    const container = document.getElementById("ordersList");
    if (!container) return;
    if (!orderHistory.length) {
        container.innerHTML = `<div class="orders-empty"><span>⌁</span><b>Tarix hali bo‘sh</b>
            <p>Birinchi buyurtmangiz yoki operatsiyangiz shu yerda ko‘rinadi.</p></div>`;
        return;
    }
    container.innerHTML = orderHistory.map((order, index) => `<button class="orders-card" type="button"
        onclick="openOrderDetails(${index})">
        <span class="orders-card-icon orders-kind-${order.kind}">${ordersEscape(order.icon)}</span>
        <span class="orders-card-main"><span><b>${ordersEscape(order.type)}</b>${orderStatusBadge(order.status)}</span>
            <small>${ordersEscape(order.description)}</small><time>${ordersEscape(ordersDateTime(order.date))}</time></span>
        <span class="orders-card-amount"><b>${ordersAmount(order)}</b>${["shop","wheel_coin"].includes(order.kind) ? "<em>💬</em>" : ""}<i>›</i></span>
    </button>`).join("");
}

async function openOrderDetails(index) {
    const order = orderHistory[Number(index)];
    if (!order) return;
    closeOrderDetails();
    const overlay = document.createElement("div");
    overlay.id = "orderDetailsOverlay";
    overlay.className = "orders-detail-overlay";
    const extra = Object.entries(order.extra || {})
        .filter(([key, value]) => value !== null && value !== "" && ![
            "id", "status", "amount", "created_at", "updated_at", "description",
        ].includes(key))
        .slice(0, 5);
    overlay.innerHTML = `<section><header><div><small>${ordersEscape(order.type.toUpperCase())}</small>
        <h3>Order #${ordersEscape(order.id)}</h3></div><button type="button" onclick="closeOrderDetails()">×</button></header>
        ${["wheel_coin", "shop"].includes(order.kind) ? wheelCoinTimelineMarkup(order.status) : ""}
        <div class="orders-detail-grid"><span>Status</span><b>${orderStatusBadge(order.status)}</b>
            <span>Summa</span><b>${ordersAmount(order)}</b><span>Sana</span><b>${ordersEscape(ordersDateTime(order.date))}</b>
            <span>Tavsif</span><b>${ordersEscape(order.description)}</b>
            ${extra.map(([key, value]) => `<span>${ordersEscape(key.replaceAll("_", " "))}</span><b>${ordersEscape(value)}</b>`).join("")}
        </div>${["wheel_coin", "shop"].includes(order.kind) ? coinOrderChatMarkup() : ""}</section>`;
    document.body.appendChild(overlay);
    if (["wheel_coin", "shop"].includes(order.kind)) await loadCoinOrderChat(order);
}

function wheelCoinTimelineMarkup(status) {
    const current = String(status || "WAITING_DETAILS").toUpperCase();
    const steps = ["WAITING_DETAILS", "WAITING_OTP", "OTP_SUBMITTED", "PENDING", "CLAIMED", "COMPLETED", "REJECTED"];
    return `<ol class="coin-order-timeline" aria-label="Coin order status">
        ${steps.map((step) => `<li class="${step === current ? "is-current" : ""}"><i></i><span>${ordersEscape(ORDER_STATUS_LABELS[step] || step)}</span></li>`).join("")}
    </ol>`;
}

const COIN_STATUS_HELP = {
    WAITING_DETAILS: "MyKonami ma’lumotlarini yuboring.",
    WAITING_OTP: "Emailingizga yuborilgan tasdiqlash kodini kiriting.",
    OTP_SUBMITTED: "Kod operatorga yuborildi.",
    PENDING: "Buyurtmangiz tekshirilmoqda.",
    CLAIMED: "Operator buyurtmangiz ustida ishlamoqda.",
    COMPLETED: "Coin muvaffaqiyatli topshirildi.",
    REJECTED: "Buyurtma bekor qilindi.",
};

function coinOrderChatMarkup() {
    return `<section class="coin-order-chat"><header><h4>💬 Buyurtma suhbati</h4><small id="coinChatStatus"></small></header>
        <div id="coinChatMessages" class="coin-chat-messages"><p>Yuklanmoqda…</p></div>
        <form onsubmit="submitCoinChatMessage(event)"><input name="message" maxlength="1000" placeholder="Xabar yozish…" required>
            <button type="submit">Yuborish</button></form></section>`;
}

async function loadCoinOrderChat(order) {
    const type = order.kind === "shop" ? "SHOP" : "WHEEL";
    const box = document.getElementById("coinChatMessages");
    if (!box) return;
    box.dataset.orderType = type; box.dataset.orderId = order.id;
    try {
        const result = await getCoinOrderMessages(type, order.id);
        document.getElementById("coinChatStatus").textContent = COIN_STATUS_HELP[result.status] || "";
        const messages = Array.isArray(result.data) ? result.data : [];
        box.innerHTML = messages.length ? messages.map((item) => `<article class="coin-chat-${String(item.sender).toLowerCase()}">
            <b>${item.sender === "USER" ? "Siz" : "Operator"}</b><p>${ordersEscape(item.message)}</p>
            <time>${ordersEscape(ordersDateTime(item.created_at))}</time></article>`).join("") : "<p>Suhbat hali boshlanmagan.</p>";
        box.scrollTop = box.scrollHeight;
        if (result.unread_count) await markCoinOrderMessagesRead(type, order.id);
    } catch (error) { box.innerHTML = `<p>${ordersEscape(error?.message || "Chat yuklanmadi.")}</p>`; }
}

async function submitCoinChatMessage(event) {
    event.preventDefault(); const form = event.currentTarget; const box = document.getElementById("coinChatMessages");
    const message = String(form.elements.message.value || "").trim();
    if (!message || !box || form.dataset.submitting) return;
    form.dataset.submitting = "1"; form.querySelector("button").disabled = true;
    try {
        await sendCoinOrderMessage(box.dataset.orderType, box.dataset.orderId, message);
        form.reset();
        const order = orderHistory.find((item) => String(item.id) === box.dataset.orderId &&
            (item.kind === (box.dataset.orderType === "SHOP" ? "shop" : "wheel_coin")));
        if (order) await loadCoinOrderChat(order);
    } finally { delete form.dataset.submitting; form.querySelector("button").disabled = false; }
}

function closeOrderDetails() {
    document.getElementById("orderDetailsOverlay")?.remove();
}

async function refreshOrders() {
    if (ordersLoading) return;
    tg?.HapticFeedback?.impactOccurred?.("light");
    await loadOrders();
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        normalizeHistoryItem,
        normalizeTransactionHistory,
        normalizeOrdersHistory,
        ordersArray,
        ordersDateTime,
        wheelCoinTimelineMarkup,
    };
}
