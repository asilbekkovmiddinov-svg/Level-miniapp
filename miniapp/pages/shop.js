let products = [];
let selectedShopCategory = null;
let selectedShopProduct = null;

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

        products = result.data || [];
        renderShopCategories();

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

    const filtered = products.filter((product) => {
        return product.category === category;
    });

    renderProductList(filtered, category);
}

function renderProductList(list, category) {
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
            <div class="list-card">
                <h3>${formatMoney(product.coin_amount)} Coins</h3>

                <p>
                    💵 Narx:
                    <b>${formatMoney(product.price)} UZS</b>
                </p>

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
    const container = document.getElementById("shopProducts");

    container.innerHTML = `
        <div class="list-card">
            <h3>${formatMoney(selectedShopProduct.coin_amount)} Coins</h3>
            <p>
                💵 Narx:
                <b>${formatMoney(selectedShopProduct.price)} UZS</b>
            </p>
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
    if (!selectedShopProduct) {
        Modal.error("Mahsulot tanlanmagan.");
        return;
    }

    const regionText = region ? `\nRegion: ${region}` : "";

    const confirmed = confirm(
        `${selectedShopProduct.coin_amount} Coins\nNarx: ${formatMoney(selectedShopProduct.price)} UZS${regionText}\n\nBuyurtma berasizmi?`
    );

    if (!confirmed) {
        return;
    }

    await buyProduct(selectedShopProduct.id, region);
}

async function buyProduct(productId, region = null) {
    const result = await createOrder(productId, region);

    if (!result || result.success === false) {
        Modal.error(result?.message || "Buyurtma yaratilmadi.");
        return;
    }

    Modal.success("Buyurtma muvaffaqiyatli yaratildi.");
}

async function refreshShop() {
    await loadShopPage();
}

function formatMoney(value) {
    return Number(value || 0).toLocaleString("uz-UZ");
}
