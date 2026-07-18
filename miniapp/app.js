window.addEventListener("load", async () => {
    Loader.show();

    try {
        const homeName = document.getElementById("homeName");
        if (homeName) {
            homeName.textContent = USERNAME ? `@${USERNAME}` : FIRST_NAME;
        }

        await registerUser();
        await updateUserSeen();

        Navbar.init();
        bindMenuButtons();
        bindHeaderButtons();

        const query = new URLSearchParams(window.location.search);
        if (query.get("admin") === "promotions") {
            await loadPromotionsAdminPage();
        } else {
            await loadHome();
            await openCoinOrderDeepLink();
        }
    } catch (error) {
        console.error(error);
        Modal.error("Mini App yuklanishda xatolik yuz berdi.");
    } finally {
        Loader.hide();
        window.dispatchEvent(new CustomEvent("levelgroup:app-ready"));
    }
});

async function openCoinOrderDeepLink() {
    const params = new URLSearchParams(window.location.search);
    const type = String(params.get("coin_order_type") || "").toUpperCase();
    const orderId = params.get("coin_order_id");
    if (!orderId || !["SHOP", "WHEEL"].includes(type)) return;
    await loadOrdersPage();
    if (type === "WHEEL") await openCoinOrderChatById("wheel_coin", orderId);
}

function showPage(pageId, title) {
    document.querySelectorAll(".page").forEach((page) => {
        page.classList.remove("active-page");
    });

    const page = document.getElementById(pageId);
    if (page) {
        page.classList.add("active-page");
    }

    const pageTitle = document.getElementById("pageTitle");
    if (pageTitle) {
        pageTitle.textContent = title || "LEVEL_GROUP";
    }
}

function bindMenuButtons() {
    document.querySelectorAll(".menu-card").forEach((button) => {
        button.addEventListener("click", async () => {
            await openPage(button.dataset.page);
        });
    });
}

function bindHeaderButtons() {
    const refreshBtn = document.getElementById("refreshBtn");
    const backBtn = document.getElementById("backBtn");

    if (refreshBtn) {
        refreshBtn.addEventListener("click", refreshEverything);
    }

    if (backBtn) {
        backBtn.addEventListener("click", loadHome);
    }
}

async function openPage(page) {
    if (page !== "promotions-admin") {
        document.body.classList.remove("promotions-admin-open");
    }
    switch (page) {
        case "shop":
            await loadShopPage();
            break;
        case "p2p":
            await loadP2PPage();
            break;
        case "wheel":
            await loadWheelPage();
            break;
        case "arena":
            await loadArenaPage();
            break;
        case "orders":
            await loadOrdersPage();
            break;
        case "profile":
            await loadProfilePage();
            break;
        case "referral":
            await loadReferralPage();
            break;
        case "wallet":
            await loadDedicatedWalletPage();
            break;
        case "promotions-admin":
            await loadPromotionsAdminPage();
            break;
        default:
            await loadHome();
    }
}

async function loadHome() {
    document.body.classList.remove("promotions-admin-open");
    Navbar.setActive("home");
    showPage("homePage", "LEVEL_GROUP");
    await loadWalletPage();
    startLiveWinners();
}

async function refreshCurrentPage() {
    await openPage(Navbar.currentPage || "home");
}

async function refreshEverything() {
    Loader.show();

    try {
        await updateUserSeen();
        await refreshCurrentPage();
    } catch (error) {
        console.error(error);
        Modal.error("Ma'lumotlarni yangilab bo'lmadi.");
    } finally {
        Loader.hide();
    }
}

setInterval(async () => {
    try {
        await updateUserSeen();
    } catch (e) {
        console.log(e);
    }
}, 60000);
