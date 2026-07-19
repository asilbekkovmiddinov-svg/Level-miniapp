let products = [];
let selectedShopCategory = null;
let selectedShopProduct = null;
let shopOrderSubmitting = false;
let shopOrderAttempt = null;
let shopPromotionRefreshTimer = null;
let shopPromotionCountdownTimer = null;
let shopView = "categories";
const SHOP_PROMOTION_REFRESH_MS = 15000;

const SHOP_REGIONS = [
    "🇺🇿 Uzbekistan",
    "🇯🇵 Yaponiya",
    "🇦🇪 OAE",
    "🇪🇬 Misr",
    "🇨🇦 Kanada",
    "🇲🇽 Meksika",
    "🇺🇸 AQSH",
    "🇸🇦 Saudiya Arabistoni",
    "🇦🇺 Avstraliya",
    "🇸🇪 Shvetsiya",
    "🇨🇭 Shveytsariya",
    "🇬🇧 Buyuk Britaniya",
    "🇮🇩 Indoneziya",
    "🇲🇾 Malayziya",
];

async function loadShopPage() {
    Navbar.setActive("shop");
    showPage("shopPage", "Coin Shop");

    const page = document.getElementById("shopPage");

    page.innerHTML = `
        <div id="shopProducts">
            <div class="empty-state">
                Mahsulotlar yuklanmoqda...
            </div>
        </div>
    `;

    try {
        const result = await getProducts();

        if (!result || result.success === false) {
            document.getElementById("shopProducts").innerHTML = `
                <div class="empty-state">
                    Mahsulotlarni yuklab bo'lmadi.
                </div>
            `;
            return;
        }

        products = (result.data || []).map(CoinPromotionCore.normalizeProduct);
        renderShopCategories();
        startShopPromotionRefresh();
        startShopPromotionCountdown();

    } catch (error) {
        console.error(error);

        document.getElementById("shopProducts").innerHTML = `
            <div class="empty-state">
                Xatolik yuz berdi.
            </div>
        `;
    }
}

function renderShopCategories() {
    shopView = "categories";
    const container = document.getElementById("shopProducts");

    container.innerHTML = `
        <div class="list-card">
            <h3>📱 Android Coinlar</h3>
            <p>Akkaunt ichiga kirib coin olib beriladi.</p>
            <button class="red-btn" onclick="openShopCategory('ANDROID_COINS')">
                Ko'rish
            </button>
        </div>

        <div class="list-card">
            <h3>🌍 Region orqali Coin</h3>
            <p>Android va iPhone uchun limit yo'qotmasdan coin olib beriladi.</p>
            <button class="red-btn" onclick="openShopCategory('REGION_COINS')">
                Ko'rish
            </button>
        </div>
    `;
}

function openShopCategory(category) {
    selectedShopCategory = category;
    selectedShopProduct = null;
    shopOrderAttempt = null;

    const filtered = products.filter((product) => {
        return product.category === category;
    });

    renderProductList(filtered, category);
}

function renderProductList(list, category) {
    shopView = "list";
    const container = document.getElementById("shopProducts");

    const title = category === "ANDROID_COINS"
        ? "📱 Android Coinlar"
        : "🌍 Region orqali Coin";

    const description = category === "ANDROID_COINS"
        ? "Akkaunt ichiga kirib coin olib beriladi."
        : "Android va iPhone uchun limit yo'qotmasdan coin olib beriladi.";

    if (!list.length) {
        container.innerHTML = `
            <div class="list-card">
                <h3>${title}</h3>
                <p>${description}</p>
            </div>

            <div class="empty-state">
                Mahsulotlar topilmadi.
            </div>

            <button class="secondary-btn" onclick="renderShopCategories()">
                Ortga
            </button>
        `;
        return;
    }

    container.innerHTML = `
        <div class="list-card">
            <h3>${title}</h3>
            <p>${description}</p>
        </div>

        ${list.map((product) => `
            <div class="list-card coin-product-card ${product.has_promotion ? "is-promotion" : ""}" data-product-id="${product.id}">
                ${product.has_promotion ? '<span class="coin-promotion-badge">🔥 Flash Sale</span>' : ""}
                <h3>${formatMoney(product.coin_amount)} Coins</h3>
                ${shopPriceMarkup(product)}
                ${shopPromotionMetaMarkup(product)}

                <button
                    class="red-btn"
                    onclick="selectShopProduct(${product.id})"
                >
                    🛒 Tanlash
                </button>
            </div>
        `).join("")}

        <button class="secondary-btn" onclick="renderShopCategories()">
            Ortga
        </button>
    `;
}

function selectShopProduct(productId) {
    selectedShopProduct = products.find((product) => product.id === productId);
    shopOrderAttempt = null;

    if (!selectedShopProduct) {
        Modal.error("Mahsulot topilmadi.");
        return;
    }

    if (selectedShopProduct.category === "REGION_COINS") {
        renderRegionSelect();
        return;
    }

    confirmBuyProduct(null);
}

function renderRegionSelect() {
    shopView = "region";
    const container = document.getElementById("shopProducts");

    container.innerHTML = `
        <div class="list-card">
            <h3>${formatMoney(selectedShopProduct.coin_amount)} Coins</h3>
            ${shopPriceMarkup(selectedShopProduct)}
            ${shopPromotionMetaMarkup(selectedShopProduct)}
            <p>🌍 Regionni tanlang</p>
        </div>

        ${SHOP_REGIONS.map((region) => `
            <button
                class="region-btn"
                onclick="confirmBuyProduct('${region}')"
            >
                ${region}
            </button>
        `).join("")}

        <button
            class="secondary-btn"
            onclick="openShopCategory('REGION_COINS')"
        >
            Ortga
        </button>
    `;
}

async function confirmBuyProduct(region) {
    if (shopOrderSubmitting) return;
    if (!selectedShopProduct) {
        Modal.error("Mahsulot tanlanmagan.");
        return;
    }

    const regionText = region ? `\nRegion: ${region}` : "";

    const confirmed = confirm(
        `${selectedShopProduct.coin_amount} Coins\nNarx: ${formatMoney(selectedShopProduct.display_price)} UZS${regionText}\n\nBuyurtma berasizmi?`
    );

    if (!confirmed) {
        return;
    }

    await buyProduct(selectedShopProduct.id, region);
}

async function buyProduct(productId, region = null) {
    if (shopOrderSubmitting) return;
    const fingerprint = `${Number(productId)}:${region || ""}`;
    if (!shopOrderAttempt || shopOrderAttempt.fingerprint !== fingerprint) {
        shopOrderAttempt = {
            fingerprint,
            idempotencyKey: walletIdempotencyKey("coin-order"),
        };
    }
    shopOrderSubmitting = true;
    document.querySelectorAll("#shopProducts button").forEach((button) => {
        button.disabled = true;
    });
    try {
        const result = await createOrder(productId, region, shopOrderAttempt.idempotencyKey);
        if (!result || result.success === false) {
            Modal.error(result?.message || "Buyurtma yaratilmadi.");
            return;
        }
        shopOrderAttempt = null;
        const locked = globalThis.CoinPromotionCore?.normalizeOrder
            ? CoinPromotionCore.normalizeOrder(result.data)
            : { promotionId: Number(result.data?.promotion_id) || null, lockedPrice: Number(result.data?.locked_price ?? result.data?.price_uzs ?? 0) };
        Modal.success(
            `Buyurtma yaratildi.\n\n` +
            `Order raqami: ${result.data?.order_number}\n\n` +
            `Locked narx: ${formatMoney(locked.lockedPrice)} UZS\n\n` +
            "Admin siz bilan Telegram orqali bog‘lanadi."
        );
        await loadOrdersPage();
    } catch (error) {
        Modal.error(error?.message || "Buyurtma yaratilmadi.");
    } finally {
        shopOrderSubmitting = false;
        document.querySelectorAll("#shopProducts button").forEach((button) => {
            button.disabled = false;
        });
    }
}

async function refreshShop() {
    await loadShopPage();
}

function shopPriceMarkup(product) {
    if (!product.has_promotion) {
        return `<div class="coin-price"><strong>${formatMoney(product.display_price)} UZS</strong></div>`;
    }
    return `<div class="coin-price"><del>${formatMoney(product.original_price)} UZS</del><strong class="promo">${formatMoney(product.promotion_price)} UZS</strong></div>`;
}

function shopPromotionMetaMarkup(product) {
    if (!product.has_promotion) return "";
    const timer = CoinPromotionCore.countdown(product.promotion_end_at);
    return `<div class="coin-promotion-meta">
        <span class="coin-promotion-remaining">Qoldi: ${product.remaining_quantity} ta</span>
        ${timer ? `<span class="coin-promotion-countdown ${timer.urgent ? "is-urgent" : ""}" data-promotion-countdown="${product.id}">⏱ ${timer.text}</span>` : ""}
    </div>`;
}

function updateShopPromotionCountdowns() {
    let expired = false;
    products = products.map((product) => {
        if (!product.has_promotion || !product.promotion_end_at) return product;
        const timer = CoinPromotionCore.countdown(product.promotion_end_at);
        if (!timer?.expired) return product;
        expired = true;
        return CoinPromotionCore.expirePromotion(product);
    });
    if (expired) {
        if (selectedShopProduct) selectedShopProduct = products.find((product) => product.id === selectedShopProduct.id) || selectedShopProduct;
        if (selectedShopCategory && shopView === "list") renderProductList(products.filter((product) => product.category === selectedShopCategory), selectedShopCategory);
        else if (shopView === "region" && selectedShopProduct) renderRegionSelect();
        return;
    }
    document.querySelectorAll("[data-promotion-countdown]").forEach((element) => {
        const product = products.find((item) => item.id === Number(element.dataset.promotionCountdown));
        const timer = CoinPromotionCore.countdown(product?.promotion_end_at);
        if (!timer) return;
        element.textContent = `⏱ ${timer.text}`;
        element.classList.toggle("is-urgent", timer.urgent);
    });
}

async function refreshShopPromotionData(animate = true) {
    if (shopOrderSubmitting) return;
    const page = document.getElementById("shopPage");
    if (!page?.classList.contains("active-page")) return;
    try {
        const result = await getProducts();
        if (!result || result.success === false) return;
        products = (result.data || []).map(CoinPromotionCore.normalizeProduct);
        if (selectedShopProduct) {
            selectedShopProduct = products.find((product) => product.id === selectedShopProduct.id) || selectedShopProduct;
        }
        if (selectedShopCategory && shopView === "list") {
            renderProductList(products.filter((product) => product.category === selectedShopCategory), selectedShopCategory);
            if (animate) document.querySelectorAll(".coin-product-card").forEach((card) => card.classList.add("promotion-refresh"));
        } else if (shopView === "region" && selectedShopProduct) {
            renderRegionSelect();
        }
    } catch (error) {
        console.warn("Coin promotion refresh failed", error);
    }
}

function startShopPromotionRefresh() {
    if (shopPromotionRefreshTimer) return;
    shopPromotionRefreshTimer = setInterval(() => refreshShopPromotionData(), SHOP_PROMOTION_REFRESH_MS);
}

function startShopPromotionCountdown() {
    if (shopPromotionCountdownTimer) return;
    shopPromotionCountdownTimer = setInterval(updateShopPromotionCountdowns, 1000);
}

function formatMoney(value) {
    return Number(value || 0).toLocaleString("uz-UZ");
}
