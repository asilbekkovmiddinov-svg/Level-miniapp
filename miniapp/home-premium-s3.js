const homePremiumS3State = {
    initialized: false,
    loading: false,
    newsTimer: null,
    promotionObserver: null,
};

function homeS3Escape(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function homeS3Greeting(hour = new Date().getHours()) {
    if (hour >= 5 && hour < 12) return "GOOD MORNING";
    if (hour >= 12 && hour < 18) return "GOOD AFTERNOON";
    return "GOOD EVENING";
}

function homeS3Source(payload) {
    return payload?.data ?? payload ?? null;
}

function homeS3Metric(source, keys, suffix = "") {
    if (!source || typeof source !== "object") return "—";
    for (const key of keys) {
        const value = source[key];
        if (value !== undefined && value !== null && value !== "") {
            const numeric = Number(value);
            const text = Number.isFinite(numeric) ? numeric.toLocaleString("uz-UZ") : String(value);
            return `${text}${suffix}`;
        }
    }
    return "—";
}

function setHomeS3Greeting() {
    const target = document.getElementById("homeGreeting");
    if (target) target.textContent = homeS3Greeting();
}

function bindHomeS3Parallax(page) {
    const hero = page.querySelector(".home-v4-hero");
    if (!hero || globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
        || !globalThis.matchMedia?.("(pointer: fine)")?.matches) return;
    hero.addEventListener("pointermove", (event) => {
        const bounds = hero.getBoundingClientRect();
        hero.style.setProperty("--home-parallax-x", `${((event.clientX - bounds.left) / bounds.width - .5) * 10}px`);
        hero.style.setProperty("--home-parallax-y", `${((event.clientY - bounds.top) / bounds.height - .5) * 10}px`);
    });
    hero.addEventListener("pointerleave", () => {
        hero.style.setProperty("--home-parallax-x", "0px");
        hero.style.setProperty("--home-parallax-y", "0px");
    });
}

function bindHomeS3QuickFeedback(page) {
    page.addEventListener("pointerdown", (event) => {
        const card = event.target.closest(".home-v4-quick");
        if (!card || card.disabled) return;
        card.classList.add("is-pressed", "is-active");
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach((name) => page.addEventListener(name, (event) => {
        event.target.closest?.(".home-v4-quick")?.classList.remove("is-pressed");
    }, true));
}

function syncHomeS3QuickBadges() {
    if (typeof promotionsUserState === "undefined" || typeof PromotionsUserCore === "undefined") return;
    const byPage = new Map();
    promotionsUserState.items.forEach((item) => {
        const action = PromotionsUserCore.resolveAction(item);
        if (action.type === "page" && item.badge && !byPage.has(action.target)) byPage.set(action.target, item.badge);
    });
    document.querySelectorAll("[data-home-smart-badge]").forEach((badge) => {
        const value = byPage.get(badge.dataset.homeSmartBadge === "shop" ? "shop" : badge.dataset.homeSmartBadge);
        badge.hidden = !value;
        badge.textContent = value ? String(value).slice(0, 12) : "";
    });
}

function homeS3DashboardSkeleton() {
    return `<div class="home-s3-dashboard-skeleton">${"<i></i>".repeat(4)}</div>`;
}

function renderHomeS3Dashboard(results) {
    const root = document.getElementById("homePersonalDashboard");
    if (!root) return;
    const arena = results.arena;
    const wallet = homeS3Source(results.wallet);
    const referral = homeS3Source(results.referral);
    const wheel = homeS3Source(results.wheel);
    const cards = [
        {
            icon: "⚔", title: "Arena Stats", page: "arena",
            rows: [
                ["Matches", homeS3Metric(arena, ["totalMatches"])],
                ["Wins", homeS3Metric(arena, ["wins"])],
                ["Win Rate", homeS3Metric(arena, ["winRate"], "%")],
            ],
        },
        {
            icon: "◆", title: "Wallet Summary", page: "wallet",
            rows: [
                ["EFC", homeS3Metric(wallet, ["efc_balance"], " EFC")],
                ["UZS", homeS3Metric(wallet, ["uzs_balance"], " UZS")],
                ["Locked", homeS3Metric(wallet, ["locked_efc"], " EFC")],
            ],
        },
        {
            icon: "✦", title: "Referral Summary", page: "referral",
            rows: [
                ["Referrals", homeS3Metric(referral, ["total_referrals"])],
                ["Buyers", homeS3Metric(referral, ["coin_shop_buyers"])],
                ["Earned", homeS3Metric(referral, ["total_earned_uzs"], " UZS")],
            ],
        },
        {
            icon: "🎡", title: "Wheel Summary", page: "wheel",
            rows: [
                ["Free Spins", homeS3Metric(wheel, ["remaining_free_spins"])],
                ["Ad Spins", homeS3Metric(wheel, ["remaining_ad_spins"])],
                ["Last Win", homeS3Metric(wheel?.last_win, ["reward_amount", "amount"])],
            ],
        },
    ];
    root.innerHTML = cards.map((card, index) => `<button class="home-s3-dashboard-card" data-home-s3-page="${card.page}" type="button" style="--s3-order:${index}">
        <header><span aria-hidden="true">${card.icon}</span><strong>${card.title}</strong><i>›</i></header>
        <div>${card.rows.map(([label, value]) => `<p><small>${label}</small><b>${homeS3Escape(value)}</b></p>`).join("")}</div>
    </button>`).join("");
}

function homeS3PromotionState(item, now = Date.now()) {
    const start = item?.start_at ? Date.parse(item.start_at) : NaN;
    const end = item?.end_at ? Date.parse(item.end_at) : NaN;
    if (Number.isFinite(start) && start > now) return { key: "upcoming", label: "UPCOMING" };
    if (Number.isFinite(end) && end > now && end - now <= 72 * 60 * 60 * 1000) return { key: "ending", label: "ENDING SOON" };
    return { key: "live", label: "LIVE" };
}

function homeS3Countdown(item, now = Date.now()) {
    const state = homeS3PromotionState(item, now);
    const target = state.key === "upcoming" ? item.start_at : item.end_at;
    if (!target || typeof PromotionsUserCore === "undefined") return state.key === "live" ? "Hozir faol" : "Vaqt belgilanmagan";
    return PromotionsUserCore.countdown(target, now);
}

function renderHomeS3News() {
    const root = document.getElementById("homeNewsEvents");
    if (!root || typeof promotionsUserState === "undefined") return;
    const items = promotionsUserState.items.slice(0, 6);
    if (!items.length) {
        root.innerHTML = typeof homeS2Empty === "function"
            ? homeS2Empty("◈", "News & Events tayyorlanmoqda", "Faol Promotions API ma’lumotlari kelganda tadbirlar shu yerda ko‘rinadi.", "promotions", "Promotions")
            : "";
        return;
    }
    root.innerHTML = items.map((item, index) => {
        const state = homeS3PromotionState(item);
        return `<button class="home-s3-news-card is-${state.key}" data-home-s3-promotion="${item.id}" type="button" style="--s3-order:${index}">
            <span>${state.label}</span><strong>${homeS3Escape(item.title)}</strong>
            <small>${homeS3Escape(item.subtitle || item.description || "")}</small>
            <time data-home-s3-countdown="${item.id}">${homeS3Escape(homeS3Countdown(item))}</time><i>›</i>
        </button>`;
    }).join("");
}

function updateHomeS3Countdowns() {
    if (typeof promotionsUserState === "undefined") return;
    document.querySelectorAll("[data-home-s3-countdown]").forEach((node) => {
        const item = promotionsUserState.items.find((value) => value.id === Number(node.dataset.homeS3Countdown));
        if (item) node.textContent = homeS3Countdown(item);
    });
}

async function loadHomePremiumS3() {
    const page = document.getElementById("homePage");
    const root = document.getElementById("homePersonalDashboard");
    if (!page?.classList.contains("active-page") || homePremiumS3State.loading) return;
    homePremiumS3State.loading = true;
    if (root) root.innerHTML = homeS3DashboardSkeleton();
    const calls = {
        arena: typeof arenaApiClient !== "undefined" && arenaApiClient.profile ? arenaApiClient.profile() : Promise.resolve(null),
        wallet: typeof getWallet === "function" ? getWallet() : Promise.resolve(null),
        referral: typeof getReferralSummary === "function" ? getReferralSummary() : Promise.resolve(null),
        wheel: typeof getWheelStatus === "function" ? getWheelStatus() : Promise.resolve(null),
    };
    const pairs = await Promise.all(Object.entries(calls).map(async ([key, promise]) => {
        try { return [key, await promise]; } catch (_) { return [key, null]; }
    }));
    renderHomeS3Dashboard(Object.fromEntries(pairs));
    renderHomeS3News();
    syncHomeS3QuickBadges();
    homePremiumS3State.loading = false;
}

function initializeHomePremiumS3() {
    const page = document.getElementById("homePage");
    if (!page) return;
    setHomeS3Greeting();
    if (!homePremiumS3State.initialized) {
        bindHomeS3Parallax(page);
        bindHomeS3QuickFeedback(page);
        page.addEventListener("click", (event) => {
            const dashboard = event.target.closest("[data-home-s3-page]");
            const promotion = event.target.closest("[data-home-s3-promotion]");
            if (dashboard && typeof openPage === "function") openPage(dashboard.dataset.homeS3Page);
            if (promotion && typeof activatePromotion === "function") activatePromotion(Number(promotion.dataset.homeS3Promotion));
        });
        if (typeof MutationObserver !== "undefined") {
            const promotions = document.getElementById("homePromotions");
            homePremiumS3State.promotionObserver = new MutationObserver(() => {
                renderHomeS3News();
                syncHomeS3QuickBadges();
            });
            if (promotions) homePremiumS3State.promotionObserver.observe(promotions, { childList: true, subtree: true });
        }
        clearInterval(homePremiumS3State.newsTimer);
        homePremiumS3State.newsTimer = setInterval(updateHomeS3Countdowns, 1000);
        homePremiumS3State.initialized = true;
    }
    loadHomePremiumS3();
}

globalThis.loadHomePremiumS3 = loadHomePremiumS3;
globalThis.addEventListener?.("levelgroup:app-ready", initializeHomePremiumS3);

if (typeof module !== "undefined") {
    module.exports = { homeS3Greeting, homeS3Source, homeS3Metric, homeS3PromotionState, homeS3Countdown };
}
