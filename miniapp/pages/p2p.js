let p2pOrders = [];
let currentP2PType = "SELL";
let p2pCreatePending = false;
let p2pTradePending = false;
const P2P_RESPONSE_MINUTES = new Set([5, 10, 15, 30, 60]);
let p2pTradeDetail = null;
let p2pTradeDetailTimer = null;
let p2pTradeCountdownTimer = null;
let p2pLifecyclePending = false;
const P2P_TERMINAL_STATUSES = new Set(["COMPLETED", "CANCELLED", "REJECTED", "TIMEOUT"]);

async function loadP2PPage() {
    Navbar.setActive("p2p");
    showPage("p2pPage", "P2P Market");

    await loadP2POrders("SELL");
}

async function loadP2POrders(type = "SELL") {
    currentP2PType = type;

    const page = document.getElementById("p2pPage");

    page.innerHTML = `
        <section class="p2p-v2-head">
            <div><small>SECURE MARKET</small><h2>P2P e’lonlar</h2>
                <p>EFC’ni xavfsiz sotib oling yoki soting.</p></div>
            <div class="p2p-head-actions"><button type="button" onclick="openP2PTradesHistory()">Tarix</button>
                <button type="button" onclick="openP2PCreateOrder()"><span>＋</span>E’lon yaratish</button></div>
        </section>
        <div class="tab-row">
            <button class="tab-btn ${type === "SELL" ? "active" : ""}" onclick="loadP2POrders('SELL')">
                Sotish
            </button>
            <button class="tab-btn ${type === "BUY" ? "active" : ""}" onclick="loadP2POrders('BUY')">
                Sotib olish
            </button>
        </div>

        <div id="p2pList" class="p2p-list">
            <div class="empty-state">Yuklanmoqda...</div>
        </div>
    `;

    try {
        const result = await getOpenP2POrders(type);

        if (!result || result.success === false) {
            document.getElementById("p2pList").innerHTML =
                `<div class="empty-state">E’lonlarni yuklab bo‘lmadi.</div>`;
            return;
        }

        p2pOrders = result.data || [];
        renderP2POrders();
    } catch (error) {
        console.error(error);
        document.getElementById("p2pList").innerHTML =
            `<div class="empty-state">Xatolik yuz berdi.</div>`;
    }
}

function renderP2POrders() {
    const list = document.getElementById("p2pList");

    if (!p2pOrders.length) {
        list.innerHTML = `<div class="empty-state">Hozircha e’lonlar yo‘q.</div>`;
        return;
    }

    list.innerHTML = p2pOrders.map((order) => {
        return `
            <div class="list-card">
                <div class="profile-hero" style="margin-bottom:12px;">
                    <div class="avatar">LG</div>
                    <div>
                        <h3>Order #${order.id}</h3>
                        <p class="${order.owner_is_online ? "green" : "gray"}">
                            ${order.owner_online_text || "⚪ Offline"}
                        </p>
                        <small class="gray">
                            ${order.owner_last_seen_text || "Noma’lum"}
                        </small>
                    </div>
                </div>

                <p>📌 Tur: <b>${order.order_type}</b></p>
                <p>🪙 Qolgan EFC: <b>${formatNumber(order.remaining_efc)}</b></p>
                <p>💵 1 EFC: <b>${formatNumber(order.price_uzs)} UZS</b></p>
                <p>🔻 Minimal savdo: <b>${formatNumber(order.min_trade_efc)} EFC</b></p>
                <p>⏱ Javob vaqti: <b>${order.response_minutes} daqiqa</b></p>

                <button class="red-btn" onclick="openP2PTrade(${order.id})">
                    🤝 ${p2pTradeActionLabel(order.order_type)}
                </button>
            </div>
        `;
    }).join("");
}

function p2pTradeActionLabel(orderType) {
    return String(orderType).toUpperCase() === "SELL" ? "Sotib olish" : "Sotish";
}

function validateP2PTradeAmount(value, minimum, remaining) {
    const amount = p2pNumber(value);
    const min = p2pNumber(minimum);
    const max = p2pNumber(remaining);
    if (amount <= 0) return { valid: false, message: "Savdo miqdorini kiriting." };
    if (amount < min) {
        return { valid: false, message: `Minimal savdo miqdori ${formatNumber(min)} EFC.` };
    }
    if (amount > max) {
        return { valid: false, message: `Maksimal savdo miqdori ${formatNumber(max)} EFC.` };
    }
    return { valid: true, amount };
}

function openP2PTrade(orderId) {
    if (p2pTradePending) return;
    const order = p2pOrders.find((item) => Number(item.id) === Number(orderId));
    if (!order) {
        Modal.error("E’lon topilmadi. Ro‘yxatni yangilang.");
        return;
    }
    const remaining = p2pNumber(order.remaining_efc);
    const minimum = p2pNumber(order.min_trade_efc);
    if (remaining <= 0) {
        refreshP2P();
        return;
    }
    closeP2PTrade();
    const overlay = document.createElement("div");
    overlay.id = "p2pTradeOverlay";
    overlay.className = "p2p-trade-overlay";
    overlay.innerHTML = `<section>
        <header><div><small>ORDER #${Number(order.id)}</small><h3>${p2pTradeActionLabel(order.order_type)}</h3></div>
            <button type="button" onclick="closeP2PTrade()">×</button></header>
        <div class="p2p-trade-summary"><span><small>1 EFC narxi</small><b>${formatNumber(order.price_uzs)} UZS</b></span>
            <span><small>Mavjud</small><b>${formatNumber(remaining)} EFC</b></span></div>
        <form onsubmit="submitP2PTrade(event, ${Number(order.id)})">
            <label>Savdo miqdori (EFC)<input name="efcAmount" type="number" inputmode="decimal"
                min="${minimum}" max="${remaining}" step="0.0001" placeholder="${formatNumber(minimum)}" required
                oninput="updateP2PTradeTotal(this, ${p2pNumber(order.price_uzs)})"></label>
            <div class="p2p-trade-limits"><span>Min: <b>${formatNumber(minimum)} EFC</b></span>
                <span>Max: <b>${formatNumber(remaining)} EFC</b></span></div>
            <div class="p2p-trade-total"><small>Taxminiy summa</small><b id="p2pTradeTotal">0 UZS</b></div>
            <div id="p2pTradeError" class="p2p-create-error" role="alert"></div>
            <button class="p2p-create-submit" type="submit"><span>✓</span><b>Savdoni tasdiqlash</b></button>
        </form>
    </section>`;
    document.body.appendChild(overlay);
}

function closeP2PTrade() {
    if (p2pTradePending) return;
    document.getElementById("p2pTradeOverlay")?.remove();
}

function updateP2PTradeTotal(input, priceUzs) {
    const target = document.getElementById("p2pTradeTotal");
    if (target) target.textContent = `${formatNumber(p2pNumber(input?.value) * p2pNumber(priceUzs))} UZS`;
}

function setP2PTradePending(pending) {
    p2pTradePending = pending;
    document.querySelectorAll("#p2pTradeOverlay input, #p2pTradeOverlay button")
        .forEach((element) => { element.disabled = pending; });
    document.querySelector("#p2pTradeOverlay .p2p-create-submit")?.classList.toggle("is-loading", pending);
}

function p2pTradeError(message = "") {
    const target = document.getElementById("p2pTradeError");
    if (target) target.textContent = message;
}

function p2pTradeResponse(result) {
    return result?.data || result?.trade || result || {};
}

async function submitP2PTrade(event, orderId) {
    event.preventDefault();
    if (p2pTradePending) return;
    const order = p2pOrders.find((item) => Number(item.id) === Number(orderId));
    if (!order) {
        p2pTradeError("E’lon yangilangan. Ro‘yxatni qayta yuklang.");
        return;
    }
    const validation = validateP2PTradeAmount(
        new FormData(event.currentTarget).get("efcAmount"),
        order.min_trade_efc,
        order.remaining_efc,
    );
    if (!validation.valid) {
        p2pTradeError(validation.message);
        return;
    }
    setP2PTradePending(true);
    p2pTradeError("");
    try {
        const result = await createP2PTrade(orderId, validation.amount);
        if (!result || result.success === false) {
            throw new Error(result?.message || "Savdo yaratilmadi.");
        }
        const trade = p2pTradeResponse(result);
        p2pTradePending = false;
        document.getElementById("p2pTradeOverlay")?.remove();
        await loadP2POrders(currentP2PType);
        tg?.HapticFeedback?.notificationOccurred?.("success");
        const tradeId = trade.id || trade.trade_id;
        if (tradeId) {
            await openP2PTradeDetails(tradeId, trade);
        } else {
            Modal.success("P2P savdo yaratildi. Holatni Savdolar tarixida kuzating.");
        }
    } catch (error) {
        setP2PTradePending(false);
        p2pTradeError(error.message || "Savdo yaratishda xatolik yuz berdi.");
    }
}

function p2pTradesArray(payload) {
    if (Array.isArray(payload)) return payload;
    for (const key of ["data", "items", "trades"]) {
        if (Array.isArray(payload?.[key])) return payload[key];
    }
    return [];
}

function p2pTradeStatus(trade) {
    return String(trade?.status || "PENDING").toUpperCase();
}

function p2pTradeRole(trade, telegramId = typeof TELEGRAM_ID !== "undefined" ? TELEGRAM_ID : 0) {
    if (Number(trade?.owner_id) === Number(telegramId)) return "owner";
    if (Number(trade?.requester_id) === Number(telegramId)) return "requester";
    return "viewer";
}

function p2pTradePayerRole(trade) {
    return String(trade?.order_type).toUpperCase() === "BUY" ? "owner" : "requester";
}

function p2pTradeDeadline(trade, role = p2pTradeRole(trade)) {
    if (role === "owner" && trade?.owner_expires_at) return trade.owner_expires_at;
    if (role === "requester" && trade?.requester_expires_at) return trade.requester_expires_at;
    return trade?.expires_at || trade?.owner_expires_at || trade?.requester_expires_at || null;
}

function p2pTradeLifecycleActions(trade, telegramId) {
    const status = p2pTradeStatus(trade);
    if (P2P_TERMINAL_STATUSES.has(status)) return [];
    const role = p2pTradeRole(trade, telegramId);
    if (role === "viewer") return [];
    if (status === "PENDING") {
        return role === "owner"
            ? [{ action: "approve", label: "Tasdiqlash", primary: true }, { action: "reject", label: "Bekor qilish" }]
            : [{ action: "reject", label: "Bekor qilish" }];
    }
    if (status === "OWNER_APPROVED") {
        const payer = p2pTradePayerRole(trade);
        const payerStatus = String(trade?.[`${payer}_status`] || "PENDING").toUpperCase();
        const ownStatus = String(trade?.[`${role}_status`] || "PENDING").toUpperCase();
        if (role === payer && ownStatus === "PENDING") {
            return [{ action: "confirm", label: "To‘lov qildim", primary: true }, { action: "reject", label: "Bekor qilish" }];
        }
        if (role !== payer && payerStatus !== "PENDING" && ownStatus !== "COMPLETED") {
            return [{ action: "confirm", label: "To‘lovni tasdiqlash", primary: true }, { action: "reject", label: "Bekor qilish" }];
        }
        return [{ action: "reject", label: "Bekor qilish" }];
    }
    return [{ action: "confirm", label: "To‘lovni tasdiqlash", primary: true }, { action: "reject", label: "Bekor qilish" }];
}

const P2P_TIMELINE = [
    ["CREATED", "Trade Created"], ["PENDING", "Waiting Owner"],
    ["PAYMENT", "Waiting Payment"], ["CONFIRMATION", "Waiting Confirmation"],
    ["COMPLETED", "Completed"], ["CANCELLED", "Cancelled"], ["TIMEOUT", "Timeout"],
];

function p2pTradeStage(trade) {
    const status = p2pTradeStatus(trade);
    if (status === "COMPLETED") return "COMPLETED";
    if (["CANCELLED", "REJECTED"].includes(status)) return "CANCELLED";
    if (status === "TIMEOUT") return "TIMEOUT";
    if (status === "PENDING") return "PENDING";
    if (status === "OWNER_APPROVED") {
        const payer = p2pTradePayerRole(trade);
        return String(trade?.[`${payer}_status`] || "PENDING").toUpperCase() === "PENDING"
            ? "PAYMENT" : "CONFIRMATION";
    }
    return "CONFIRMATION";
}

function p2pTradeTimeline(trade) {
    const stage = p2pTradeStage(trade);
    const activeIndex = P2P_TIMELINE.findIndex(([key]) => key === stage);
    const completed = stage === "COMPLETED";
    return `<ol class="p2p-lifecycle">${P2P_TIMELINE.map(([key, label], index) => {
        const state = key === stage ? "is-active" : (completed && index < activeIndex)
            || (!completed && index < activeIndex && index < 4) ? "is-done" : "";
        return `<li class="${state}"><i>${state === "is-done" ? "✓" : ""}</i><span>${label}</span></li>`;
    }).join("")}</ol>`;
}

function p2pTradeCounterparty(trade, role = p2pTradeRole(trade)) {
    return role === "owner"
        ? trade.requester_display_name || trade.requester_username || `User ${trade.requester_id || "—"}`
        : trade.owner_display_name || trade.owner_username || `User ${trade.owner_id || "—"}`;
}

function renderP2PTradeDetails(trade) {
    p2pTradeDetail = trade;
    const page = document.getElementById("p2pPage");
    const status = p2pTradeStatus(trade);
    const actions = p2pTradeLifecycleActions(trade);
    const deadline = p2pTradeDeadline(trade);
    page.innerHTML = `<section class="p2p-detail-v2">
        <header><button type="button" onclick="closeP2PTradeDetails()">←</button><div><small>TRADE #${Number(trade.id || trade.trade_id)}</small>
            <h2>P2P Trade Details</h2></div><button type="button" onclick="refreshP2PTradeDetails()">↻</button></header>
        <div class="p2p-detail-status"><span>${status}</span><b id="p2pTradeCountdown">${deadline ? "—:—" : "Deadline yo‘q"}</b></div>
        <div class="p2p-detail-grid"><span>Tur</span><b>${String(trade.order_type || "—").toUpperCase()}</b>
            <span>EFC miqdori</span><b>${formatNumber(trade.efc_amount)} EFC</b>
            <span>UZS summa</span><b>${formatNumber(trade.total_uzs)} UZS</b>
            <span>Narx</span><b>${formatNumber(trade.price_uzs)} UZS</b>
            <span>Counterparty</span><b>${p2pTradeCounterparty(trade)}</b></div>
        ${p2pTradeTimeline(trade)}
        <div id="p2pLifecycleError" class="p2p-create-error"></div>
        <div class="p2p-lifecycle-actions">${actions.map((item) => `<button type="button" class="${item.primary ? "is-primary" : ""}"
            onclick="runP2PTradeAction('${item.action}')">${item.label}</button>`).join("")}</div>
        ${status === "TIMEOUT" ? `<div class="p2p-timeout-state"><b>Trade vaqti tugadi</b><span>Balans holati backend tomonidan xavfsiz yakunlandi.</span></div>` : ""}
    </section>`;
    startP2PTradeLiveRefresh();
}

async function fetchP2PTrade(tradeId) {
    const payload = await getMyP2PTrades();
    return p2pTradesArray(payload).find((trade) => Number(trade.id || trade.trade_id) === Number(tradeId)) || null;
}

async function openP2PTradeDetails(tradeId, initialTrade = null) {
    clearP2PTradeTimers();
    showPage("p2pPage", "P2P Trade");
    const page = document.getElementById("p2pPage");
    page.innerHTML = `<div class="p2p-detail-loading"><i></i><b>Trade yuklanmoqda…</b></div>`;
    try {
        const trade = await fetchP2PTrade(tradeId) || initialTrade;
        if (!trade) throw new Error("Trade topilmadi.");
        renderP2PTradeDetails(trade);
    } catch (error) {
        page.innerHTML = `<div class="p2p-detail-empty"><b>Trade yuklanmadi</b><span>${error.message}</span>
            <button onclick="openP2PTradeDetails(${Number(tradeId)})">Qayta urinish</button></div>`;
    }
}

async function refreshP2PTradeDetails() {
    if (!p2pTradeDetail || p2pLifecyclePending) return;
    try {
        const trade = await fetchP2PTrade(p2pTradeDetail.id || p2pTradeDetail.trade_id);
        if (trade) renderP2PTradeDetails(trade);
    } catch (error) {
        const target = document.getElementById("p2pLifecycleError");
        if (target) target.textContent = "Holat yangilanmadi. Qayta urinib ko‘ring.";
    }
}

async function runP2PTradeAction(action) {
    if (p2pLifecyclePending || !p2pTradeDetail) return;
    p2pLifecyclePending = true;
    document.querySelectorAll(".p2p-lifecycle-actions button").forEach((button) => { button.disabled = true; });
    const errorTarget = document.getElementById("p2pLifecycleError");
    if (errorTarget) errorTarget.textContent = "";
    try {
        const result = await p2pTradeAction(p2pTradeDetail.id || p2pTradeDetail.trade_id, action);
        if (!result || result.success === false) throw new Error(result?.message || "Amal bajarilmadi.");
        p2pLifecyclePending = false;
        await refreshP2PTradeDetails();
    } catch (error) {
        p2pLifecyclePending = false;
        if (errorTarget) errorTarget.textContent = error.message || "Amal bajarilmadi.";
        document.querySelectorAll(".p2p-lifecycle-actions button").forEach((button) => { button.disabled = false; });
    }
}

function updateP2PTradeCountdown() {
    const target = document.getElementById("p2pTradeCountdown");
    const deadline = p2pTradeDeadline(p2pTradeDetail || {});
    if (!target || !deadline) return;
    const seconds = Math.max(0, Math.ceil((Date.parse(deadline) - Date.now()) / 1000));
    target.textContent = seconds > 0
        ? `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`
        : "00:00";
    if (seconds === 0 && !P2P_TERMINAL_STATUSES.has(p2pTradeStatus(p2pTradeDetail))) {
        target.classList.add("is-expired");
    }
}

function startP2PTradeLiveRefresh() {
    clearP2PTradeTimers();
    updateP2PTradeCountdown();
    if (!P2P_TERMINAL_STATUSES.has(p2pTradeStatus(p2pTradeDetail))) {
        p2pTradeCountdownTimer = setInterval(updateP2PTradeCountdown, 1000);
        p2pTradeDetailTimer = setInterval(refreshP2PTradeDetails, 10000);
    }
}

function clearP2PTradeTimers() {
    clearInterval(p2pTradeDetailTimer); clearInterval(p2pTradeCountdownTimer);
    p2pTradeDetailTimer = null; p2pTradeCountdownTimer = null;
}

async function closeP2PTradeDetails() {
    clearP2PTradeTimers(); p2pTradeDetail = null;
    await loadP2POrders(currentP2PType);
}

async function openP2PTradesHistory() {
    clearP2PTradeTimers();
    showPage("p2pPage", "P2P History");
    const page = document.getElementById("p2pPage");
    page.innerHTML = `<div class="p2p-detail-loading"><i></i><b>Tarix yuklanmoqda…</b></div>`;
    try {
        const trades = p2pTradesArray(await getP2PHistory());
        page.innerHTML = `<section class="p2p-history-v2"><header><button onclick="loadP2POrders(currentP2PType)">←</button>
            <div><small>HISTORY</small><h2>P2P savdolar</h2></div><button onclick="openP2PTradesHistory()">↻</button></header>
            <div>${trades.length ? trades.map((trade) => `<button class="p2p-history-card" onclick="openP2PTradeDetails(${Number(trade.id || trade.trade_id)})">
                <span><b>Trade #${Number(trade.id || trade.trade_id)}</b><small>${String(trade.order_type || "P2P")}</small></span>
                <span><b>${formatNumber(trade.efc_amount)} EFC</b><small>${p2pTradeStatus(trade)}</small></span></button>`).join("")
                : `<div class="p2p-detail-empty"><b>Tarix hali bo‘sh</b><span>Yakunlangan savdolar shu yerda ko‘rinadi.</span></div>`}</div></section>`;
    } catch (error) {
        page.innerHTML = `<div class="p2p-detail-empty"><b>Tarix yuklanmadi</b><span>${error.message}</span>
            <button onclick="openP2PTradesHistory()">Qayta urinish</button></div>`;
    }
}

function p2pNumber(value) {
    const number = Number(String(value ?? "").replace(/[\s,]/g, ""));
    return Number.isFinite(number) ? number : 0;
}

function validateP2PCreateOrder({ orderType, efcAmount, priceUzs, minTradeEfc, responseMinutes }) {
    const type = String(orderType || "").toUpperCase();
    const amount = p2pNumber(efcAmount);
    const price = p2pNumber(priceUzs);
    const minimum = p2pNumber(minTradeEfc);
    const minutes = Number(responseMinutes);
    if (!['BUY', 'SELL'].includes(type)) {
        return { valid: false, message: "E’lon turini tanlang." };
    }
    if (amount <= 0) return { valid: false, message: "EFC miqdorini to‘g‘ri kiriting." };
    if (price <= 0) return { valid: false, message: "1 EFC narxini to‘g‘ri kiriting." };
    if (minimum <= 0) return { valid: false, message: "Minimal savdo miqdorini kiriting." };
    if (minimum > amount) {
        return { valid: false, message: "Minimal savdo miqdori umumiy EFC’dan oshmasin." };
    }
    if (!P2P_RESPONSE_MINUTES.has(minutes)) {
        return { valid: false, message: "Javob vaqtini ro‘yxatdan tanlang." };
    }
    return {
        valid: true,
        orderType: type,
        efcAmount: amount,
        priceUzs: price,
        minTradeEfc: minimum,
        responseMinutes: minutes,
    };
}

function openP2PCreateOrder() {
    if (p2pCreatePending) return;
    closeP2PCreateOrder();
    const overlay = document.createElement("div");
    overlay.id = "p2pCreateOverlay";
    overlay.className = "p2p-create-overlay";
    overlay.innerHTML = `<section>
        <header><div><small>YANGI E’LON</small><h3>P2P order yaratish</h3></div>
            <button type="button" onclick="closeP2PCreateOrder()">×</button></header>
        <form onsubmit="submitP2PCreateOrder(event)">
            <fieldset><legend>E’lon turi</legend>
                <label><input type="radio" name="orderType" value="SELL" checked><span>Sotish</span></label>
                <label><input type="radio" name="orderType" value="BUY"><span>Sotib olish</span></label>
            </fieldset>
            <label>EFC miqdori<input name="efcAmount" type="number" min="0.0001" step="0.0001"
                inputmode="decimal" placeholder="100" required></label>
            <label>1 EFC narxi (UZS)<input name="priceUzs" type="number" min="0.01" step="0.01"
                inputmode="decimal" placeholder="1 000" required></label>
            <label>Minimal savdo miqdori<input name="minTradeEfc" type="number" min="0.0001" step="0.0001"
                inputmode="decimal" placeholder="10" required></label>
            <label>Javob berish vaqti<select name="responseMinutes" required>
                ${[5, 10, 15, 30, 60].map((minute) => `<option value="${minute}" ${minute === 15 ? "selected" : ""}>${minute} daqiqa</option>`).join("")}
            </select></label>
            <div id="p2pCreateError" class="p2p-create-error" role="alert"></div>
            <button class="p2p-create-submit" type="submit"><span>＋</span><b>E’lon yaratish</b></button>
        </form>
    </section>`;
    document.body.appendChild(overlay);
}

function closeP2PCreateOrder() {
    if (p2pCreatePending) return;
    document.getElementById("p2pCreateOverlay")?.remove();
}

function setP2PCreatePending(pending) {
    p2pCreatePending = pending;
    document.querySelectorAll("#p2pCreateOverlay input, #p2pCreateOverlay select, #p2pCreateOverlay button")
        .forEach((element) => { element.disabled = pending; });
    document.querySelector("#p2pCreateOverlay .p2p-create-submit")?.classList.toggle("is-loading", pending);
}

function p2pCreateError(message = "") {
    const target = document.getElementById("p2pCreateError");
    if (target) target.textContent = message;
}

function optimisticP2POrder(result, values) {
    const data = result?.data || result?.order || result || {};
    return {
        ...data,
        id: data.id || data.order_id || result?.order_id || "Yangi",
        order_type: data.order_type || values.orderType,
        efc_amount: data.efc_amount ?? values.efcAmount,
        remaining_efc: data.remaining_efc ?? values.efcAmount,
        price_uzs: data.price_uzs ?? values.priceUzs,
        min_trade_efc: data.min_trade_efc ?? values.minTradeEfc,
        response_minutes: data.response_minutes ?? values.responseMinutes,
        owner_id: data.owner_id || (typeof TELEGRAM_ID !== "undefined" ? TELEGRAM_ID : 0),
        owner_is_online: true,
        owner_online_text: data.owner_online_text || "🟢 Sizning e’loningiz",
    };
}

async function submitP2PCreateOrder(event) {
    event.preventDefault();
    if (p2pCreatePending) return;
    const form = new FormData(event.currentTarget);
    const values = validateP2PCreateOrder({
        orderType: form.get("orderType"),
        efcAmount: form.get("efcAmount"),
        priceUzs: form.get("priceUzs"),
        minTradeEfc: form.get("minTradeEfc"),
        responseMinutes: form.get("responseMinutes"),
    });
    if (!values.valid) {
        p2pCreateError(values.message);
        return;
    }
    setP2PCreatePending(true);
    p2pCreateError("");
    try {
        const result = await createP2POrder(values);
        if (!result || result.success === false) {
            throw new Error(result?.message || "E’lon yaratilmadi.");
        }
        const created = optimisticP2POrder(result, values);
        p2pCreatePending = false;
        document.getElementById("p2pCreateOverlay")?.remove();
        currentP2PType = values.orderType;
        await loadP2POrders(values.orderType);
        if (!p2pOrders.some((order) => String(order.id) === String(created.id))) {
            p2pOrders.unshift(created);
            renderP2POrders();
        }
        tg?.HapticFeedback?.notificationOccurred?.("success");
    } catch (error) {
        setP2PCreatePending(false);
        p2pCreateError(error.message || "E’lon yaratishda xatolik yuz berdi.");
    }
}

async function refreshP2P() {
    await loadP2POrders(currentP2PType);
}

function formatNumber(value) {
    return Number(value || 0).toLocaleString("uz-UZ", {
        maximumFractionDigits: 4,
    });
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        validateP2PCreateOrder,
        optimisticP2POrder,
        p2pNumber,
        p2pTradeActionLabel,
        validateP2PTradeAmount,
        p2pTradeResponse,
        p2pTradesArray,
        p2pTradeRole,
        p2pTradePayerRole,
        p2pTradeDeadline,
        p2pTradeLifecycleActions,
        p2pTradeStage,
    };
}
