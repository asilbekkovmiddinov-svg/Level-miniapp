let p2pOrders = [];
let currentP2PType = "SELL";
let p2pCreatePending = false;
let p2pTradePending = false;
const P2P_RESPONSE_MINUTES = new Set([5, 10, 15, 30, 60]);

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
            <button type="button" onclick="openP2PCreateOrder()"><span>＋</span>E’lon yaratish</button>
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
        Modal.success(`P2P Trade #${trade.id || trade.trade_id || "—"} yaratildi. Savdo holatini Buyurtmalar sahifasida kuzating.`);
    } catch (error) {
        setP2PTradePending(false);
        p2pTradeError(error.message || "Savdo yaratishda xatolik yuz berdi.");
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
    };
}
