let p2pOrders = [];
let currentP2PType = "SELL";
let p2pCreatePending = false;
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
                    🤝 Savdo qilish
                </button>
            </div>
        `;
    }).join("");
}

function openP2PTrade(orderId) {
    tg.showPopup({
        title: "P2P savdo",
        message: `Order #${orderId} bo‘yicha savdo bot orqali yakunlanadi. WebApp savdo formasi V1.1 da qo‘shiladi.`,
        buttons: [
            { type: "ok", text: "Tushunarli" }
        ]
    });
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
    };
}
