window.addEventListener("load", async () => {
    Loader.show();

    try {
        const homeName = document.getElementById("homeName");
        if (homeName) homeName.textContent = USERNAME ? `@${USERNAME}` : FIRST_NAME;

        await registerUser();
        await requireChannelSubscriptions();
        await updateUserSeen();

        Navbar.init();
        bindMenuButtons();
        bindHeaderButtons();

        const query = new URLSearchParams(window.location.search);
        if (query.get("admin") === "wheel-orders") await loadWheelOrderAdminPage();
        else if (query.get("admin") === "coin-promotions") await loadCoinPromotionAdminPage();
        else if (query.get("admin") === "promotions") await loadPromotionsAdminPage();
        else if (query.get("admin") === "division") await loadDivisionAdminPage();
        else if (query.get("admin") === "tournament") await loadTournamentAdminPage();
        else if (query.get("admin") === "arena-promocodes") await loadArenaPromocodeAdminPage();
        else if (query.get("admin") === "wallet-shop") await loadWalletShopAdminPage();
        else {
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

async function requireChannelSubscriptions() {
    const requestStatus = async () => {
        const response = await fetch(`${API_URL}/subscription/status`, {
            headers: { "X-Telegram-Init-Data": telegramInitData() },
        });
        let payload = null;
        try { payload = await response.json(); } catch (_error) {}
        if (!response.ok) throw new Error(payload?.detail || "Obunani tekshirib bo‘lmadi");
        return payload;
    };

    const gate = document.createElement("section");
    gate.id = "subscriptionGate";
    gate.className = "subscription-gate";
    gate.setAttribute("role", "dialog");
    gate.setAttribute("aria-modal", "true");
    gate.innerHTML = `
        <div class="subscription-gate-card">
            <div class="subscription-gate-lock" aria-hidden="true">🔐</div>
            <small>LEVEL_GROUP ACCESS</small>
            <h1>Kanallarga obuna bo‘ling</h1>
            <p>Bot va MiniApp’dan foydalanish uchun quyidagi kanallarga obuna bo‘lish majburiy.</p>
            <div class="subscription-gate-channels"></div>
            <p class="subscription-gate-status" aria-live="polite"></p>
            <button class="subscription-gate-check" type="button">✅ Obunani tekshirish</button>
        </div>`;
    document.body.appendChild(gate);
    const channelsRoot = gate.querySelector(".subscription-gate-channels");
    const statusRoot = gate.querySelector(".subscription-gate-status");
    const checkButton = gate.querySelector(".subscription-gate-check");

    const renderChannels = (channels) => {
        channelsRoot.replaceChildren();
        for (const channel of channels || []) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "subscription-gate-channel";
            button.textContent = `➕ ${channel.title}`;
            button.addEventListener("click", () => {
                if (globalThis.Telegram?.WebApp?.openTelegramLink) {
                    globalThis.Telegram.WebApp.openTelegramLink(channel.url);
                } else {
                    window.open(channel.url, "_blank", "noopener");
                }
            });
            channelsRoot.appendChild(button);
        }
    };

    try {
        while (true) {
            checkButton.disabled = true;
            checkButton.textContent = "⏳ Tekshirilmoqda...";
            try {
                const status = await requestStatus();
                if (status?.subscribed) return true;
                renderChannels(status?.missing_channels || []);
                statusRoot.textContent = "Barcha kanallarga kirib obuna bo‘ling, keyin qayta tekshiring.";
                statusRoot.classList.remove("is-error");
            } catch (error) {
                renderChannels([]);
                statusRoot.textContent = "Tekshiruv xizmati vaqtincha ishlamayapti. Birozdan keyin qayta urining.";
                statusRoot.classList.add("is-error");
                console.error(error);
            }
            Loader.hide();
            checkButton.disabled = false;
            checkButton.textContent = "✅ Obunani tekshirish";
            await new Promise((resolve) => checkButton.addEventListener("click", resolve, { once: true }));
        }
    } finally {
        gate.remove();
        Loader.show();
    }
}

let pageReturnTarget = null;
let penaltyDuelHotfixPromise = null;

async function ensurePenaltyDuelHotfix() {
    if (window.penaltyDuelController?.__singleChoiceHotfixApplied) return;
    if (!penaltyDuelHotfixPromise) {
        penaltyDuelHotfixPromise = new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = "pages/penalty-duel-hotfix.js?v=1.1.0";
            script.async = true;
            script.onload = resolve;
            script.onerror = () => reject(new Error("Penalty Duel yangilanishini yuklab bo‘lmadi."));
            document.head.appendChild(script);
        });
    }
    await penaltyDuelHotfixPromise;
}

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
    if (pageTitle) pageTitle.textContent = title || "LEVEL_GROUP";
    return true;
}

function bindMenuButtons() {
    document.querySelectorAll(".menu-card").forEach((button) => button.addEventListener("click", async () => await openPage(button.dataset.page)));
}

function bindHeaderButtons() {
    const refreshBtn = document.getElementById("refreshBtn");
    const backBtn = document.getElementById("backBtn");
    if (refreshBtn) refreshBtn.addEventListener("click", refreshEverything);
    if (backBtn) backBtn.addEventListener("click", handlePageBack);
}

async function handlePageBack() {
    if (document.getElementById("arenaPage")?.classList.contains("active-page")) {
        window.divisionController?.stop?.();
        window.tournamentController?.stop?.();
    }
    if (document.getElementById("wallRushPage")?.classList.contains("active-page")) await window.wallRushController?.leave?.();
    if (document.getElementById("penaltyDuelPage")?.classList.contains("active-page")) await window.penaltyDuelController?.leave?.();
    const target = pageReturnTarget;
    pageReturnTarget = null;
    if (target) await openPage(target);
    else await loadHome();
}

async function openPage(page, options = {}) {
    if (page !== "arena") window.divisionController?.stop?.();
    if (page !== "arena") window.tournamentController?.stop?.();
    if (page !== "wall-rush" && window.wallRushController) window.wallRushController.stop();
    if (page !== "penalty-duel" && window.penaltyDuelController) await window.penaltyDuelController.leave();
    pageReturnTarget = options.returnPage || null;
    if (page !== "wheel-orders-admin") document.body.classList.remove("wheel-order-admin-open");
    if (page !== "coin-promotions-admin") document.body.classList.remove("coin-promotion-admin-open");
    if (page !== "promotions-admin") document.body.classList.remove("promotions-admin-open");
    switch (page) {
        case "shop": await loadShopPage(options); break;
        case "p2p": await loadP2PPage(); break;
        case "wheel": await loadWheelPage(); break;
        case "arena": await loadArenaV3Page(); break;
        case "wall-rush": await loadWallRushPage(); break;
        case "penalty-duel": await ensurePenaltyDuelHotfix(); await loadPenaltyDuelPage(); break;
        case "orders": await loadOrdersPage(); break;
        case "profile": await loadProfilePage(); break;
        case "support": await loadSupportPage(); break;
        case "referral": await loadReferralPage(); break;
        case "wallet": await loadDedicatedWalletPage(); break;
        case "wallet-shop": await loadWalletShopPage(); break;
        case "promotions-admin": await loadPromotionsAdminPage(); break;
        case "division-admin": await loadDivisionAdminPage(); break;
        case "tournament-admin": await loadTournamentAdminPage(); break;
        case "coin-promotions-admin": await loadCoinPromotionAdminPage(); break;
        case "wheel-orders-admin": await loadWheelOrderAdminPage(); break;
        case "arena-promocodes-admin": await loadArenaPromocodeAdminPage(); break;
        case "wallet-shop-admin": await loadWalletShopAdminPage(); break;
        case "promotions": await loadPromotionsPage(); break;
        case "notifications": await loadNotificationsPage(); break;
        default: await loadHome();
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

async function refreshCurrentPage() { await openPage(Navbar.currentPage || "home"); }

async function refreshEverything() {
    Loader.show();
    try {
        await updateUserSeen();
        await refreshCurrentPage();
    } catch (error) {
        console.error(error);
        Modal.error("Ma'lumotlarni yangilab bo'lmadi.");
    } finally { Loader.hide(); }
}

setInterval(async () => {
    try { await updateUserSeen(); } catch (e) { console.log(e); }
}, 60000);
