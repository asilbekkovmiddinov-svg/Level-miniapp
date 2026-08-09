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
        if (query.get("admin") === "wheel-orders") {
            await loadWheelOrderAdminPage();
        } else if (query.get("admin") === "coin-promotions") {
            await loadCoinPromotionAdminPage();
        } else if (query.get("admin") === "promotions") {
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

let pageReturnTarget = null;

async function openCoinOrderDeepLink() {
    const params = new URLSearchParams(window.location.search);
    const type = String(params.get("coin_order_type") || "").toUpperCase();
    const orderId = params.get("coin_order_id");
    if (!orderId || !["SHOP", "WHEEL"].includes(type)) return;
    await loadOrdersPage();
    if (type === "WHEEL") await openCoinOrderChatById("wheel_coin", orderId);
}

function showPage(pageId, title) {
    const pageContent = document.getElementById("pageContent");
    const pages = pageContent?.querySelectorAll(":scope > .page") || [];
    const nextPage = document.getElementById(pageId);
    if (!nextPage || !nextPage.matches("#pageContent > .page")) return false;

    pages.forEach((page) => {
        const active = page === nextPage;
        page.classList.toggle("active-page", active);
        page.hidden = !active;
        page.inert = !active;
        page.setAttribute("aria-hidden", String(!active));
    });

    nextPage.scrollTop = 0;
    if (pageContent) pageContent.scrollTop = 0;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });

    const pageTitle = document.getElementById("pageTitle");
    if (pageTitle) {
        pageTitle.textContent = title || "LEVEL_GROUP";
    }
    return true;
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

    if (backBtn) backBtn.addEventListener("click", handlePageBack);
}

async function handlePageBack() {
    if (document.getElementById("wallRushPage")?.classList.contains("active-page")) {
        await window.wallRushController?.leave?.();
    }
    const target = pageReturnTarget;
    pageReturnTarget = null;
    if (target) await openPage(target);
    else await loadHome();
}

async function openPage(page, options = {}) {
    if (page !== "wall-rush" && window.wallRushController) window.wallRushController.stop();
    pageReturnTarget = options.returnPage || null;
    if (page !== "wheel-orders-admin") document.body.classList.remove("wheel-order-admin-open");
    if (page !== "coin-promotions-admin") document.body.classList.remove("coin-promotion-admin-open");
    if (page !== "promotions-admin") {
        document.body.classList.remove("promotions-admin-open");
    }
    switch (page) {
        case "shop":
            await loadShopPage(options);
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
        case "wall-rush":
            await loadWallRushPage();
            break;
        case "orders":
            await loadOrdersPage();
            break;
        case "profile":
            await loadProfilePage();
            break;
        case "support":
            await loadSupportPage();
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
        case "coin-promotions-admin":
            await loadCoinPromotionAdminPage();
            break;
        case "wheel-orders-admin":
            await loadWheelOrderAdminPage();
            break;
        case "promotions":
            await loadPromotionsPage();
            break;
        case "notifications":
            await loadNotificationsPage();
            break;
        default:
            await loadHome();
    }
}

async function loadHome() {
    document.body.classList.remove("promotions-admin-open");
    document.body.classList.remove("coin-promotion-admin-open");
    document.body.classList.remove("wheel-order-admin-open");
    Navbar.setActive("home");
    showPage("homePage", "LEVEL_GROUP");
    await loadWalletPage();
    await loadUserPromotions();
    startPromotionsAutoRefresh();
    await refreshNotifications();
    startNotificationsAutoRefresh();
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
