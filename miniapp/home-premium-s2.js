const homePremiumS2State = {
    loading: false,
    initialized: false,
    promotionObserver: null,
};

function homeS2Escape(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function homeS2Array(payload, keys = []) {
    if (Array.isArray(payload)) return payload;
    const source = payload?.data ?? payload ?? {};
    if (Array.isArray(source)) return source;
    for (const key of keys) if (Array.isArray(source[key])) return source[key];
    return [];
}

function homeS2Timestamp(item) {
    const value = item?.created_at ?? item?.createdAt ?? item?.completed_at ?? item?.completedAt
        ?? item?.timestamp ?? item?.date ?? item?.time ?? null;
    const timestamp = value ? Date.parse(value) : NaN;
    return Number.isFinite(timestamp) ? timestamp : null;
}

function homeS2Time(timestamp) {
    if (!timestamp) return "";
    return new Intl.DateTimeFormat("uz-UZ", {
        day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    }).format(new Date(timestamp));
}

function homeS2Status(value) {
    const status = String(value || "completed").toLowerCase();
    if (["won", "success", "successful", "completed", "paid", "approved", "finished"].includes(status)) return "success";
    if (["lost", "failed", "rejected", "cancelled", "canceled"].includes(status)) return "danger";
    if (["pending", "waiting", "processing", "playing", "active"].includes(status)) return "pending";
    return "neutral";
}

function homeS2Amount(item) {
    const amount = item?.reward ?? item?.reward_amount ?? item?.amount ?? item?.total_amount ?? null;
    if (amount === null || amount === undefined || amount === "") return "";
    const currency = item?.currency ?? item?.reward_currency ?? item?.asset ?? "";
    return `${homeS2Escape(amount)}${currency ? ` ${homeS2Escape(currency)}` : ""}`;
}

function homeS2Activity(type, item, options) {
    const timestamp = homeS2Timestamp(item);
    if (!timestamp) return null;
    const status = item?.result ?? item?.status ?? options.status ?? "completed";
    return {
        type,
        icon: options.icon,
        title: options.title(item),
        detail: options.detail(item),
        amount: homeS2Amount(item),
        status,
        timestamp,
        page: options.page,
    };
}

function collectHomeS2Activities(results) {
    const activities = [];
    const arenaItems = homeS2Array(results.arena, ["items", "matches", "results"]);
    arenaItems.forEach((item) => {
        const activity = homeS2Activity("arena", item, {
            icon: "⚔", page: "arena",
            title: () => "Arena match",
            detail: (value) => value.gameType ?? value.game_type ?? value.game ?? "Arena",
        });
        if (activity) activities.push(activity);
    });
    const transactions = homeS2Array(results.wallet, ["items", "transactions", "results"]);
    transactions.forEach((item) => {
        const activity = homeS2Activity("wallet", item, {
            icon: "↗", page: "wallet",
            title: () => "Wallet transaction",
            detail: (value) => value.description ?? value.transaction_type ?? value.type ?? "Wallet",
        });
        if (activity) activities.push(activity);
    });
    const wheelWin = results.wheel?.data?.last_win ?? results.wheel?.last_win ?? null;
    if (wheelWin) {
        const activity = homeS2Activity("wheel", wheelWin, {
            icon: "🎡", page: "wheel", status: "completed",
            title: () => "Wheel reward",
            detail: (value) => value.prize_name ?? value.title ?? value.reward_name ?? "Wheel",
        });
        if (activity) activities.push(activity);
    }
    const orders = homeS2Array(results.orders, ["items", "orders", "results"]);
    orders.forEach((item) => {
        const activity = homeS2Activity("order", item, {
            icon: "🪙", page: "orders",
            title: () => "Coin Shop order",
            detail: (value) => value.product_name ?? value.coin_name ?? value.title ?? "Coin Shop",
        });
        if (activity) activities.push(activity);
    });
    const referralEvents = homeS2Array(results.referrals, ["recent_rewards", "reward_history", "activities"]);
    referralEvents.forEach((item) => {
        const activity = homeS2Activity("referral", item, {
            icon: "✦", page: "referral",
            title: () => "Referral reward",
            detail: (value) => value.description ?? value.referral_name ?? "Referral",
        });
        if (activity) activities.push(activity);
    });
    return activities.sort((a, b) => b.timestamp - a.timestamp).slice(0, 8);
}

function homeS2Empty(icon, title, copy, page, action) {
    return `<article class="home-s2-empty"><span aria-hidden="true">${icon}</span><strong>${homeS2Escape(title)}</strong>
        <p>${homeS2Escape(copy)}</p>${page ? `<button class="menu-card" data-page="${page}" type="button">${homeS2Escape(action)}</button>` : ""}</article>`;
}

function renderHomeS2Activity(items) {
    const root = document.getElementById("homeRecentActivity");
    if (!root) return;
    if (!items.length) {
        root.innerHTML = homeS2Empty("⌁", "Hozircha faollik yo‘q", "Birinchi Arena matchini boshlang yoki premium imkoniyatlardan foydalaning.", "arena", "Arena boshlash");
        return;
    }
    root.innerHTML = items.map((item, index) => `<button class="home-s2-activity menu-card" data-page="${item.page}" type="button" style="--s2-order:${index}">
        <span class="home-s2-activity-icon" aria-hidden="true">${item.icon}</span>
        <span class="home-s2-activity-copy"><strong>${homeS2Escape(item.title)}</strong><small>${homeS2Escape(item.detail)}</small><time>${homeS2Time(item.timestamp)}</time></span>
        <span class="home-s2-activity-meta">${item.amount ? `<b>${item.amount}</b>` : ""}<em class="is-${homeS2Status(item.status)}">${homeS2Escape(item.status)}</em></span>
    </button>`).join("");
}

function explicitMissionRows(payloads) {
    const sources = Object.values(payloads).flatMap((payload) => {
        const source = payload?.data ?? payload ?? {};
        return [source.daily_missions, source.missions_today, source.today_missions].filter(Array.isArray);
    }).flat();
    return sources.filter((item) => item && (item.progress !== undefined || item.current !== undefined)
        && (item.target !== undefined || item.goal !== undefined)).map((item) => ({
        title: item.title ?? item.name ?? item.description ?? "Daily mission",
        progress: Number(item.progress ?? item.current),
        target: Number(item.target ?? item.goal),
        completed: Boolean(item.completed ?? item.is_completed),
        icon: item.icon ?? "◆",
    })).filter((item) => Number.isFinite(item.progress) && Number.isFinite(item.target) && item.target > 0);
}

function renderHomeS2Missions(items) {
    const root = document.getElementById("homeDailyMissions");
    if (!root) return;
    if (!items.length) {
        root.innerHTML = homeS2Empty("◎", "Kunlik missiyalar kutilmoqda", "Mavjud API kunlik progress yuborganda natijalar shu yerda ko‘rinadi.", "", "");
        return;
    }
    root.innerHTML = items.map((item, index) => {
        const progress = Math.max(0, Math.min(item.progress, item.target));
        const percent = Math.round(progress / item.target * 100);
        return `<article class="home-s2-mission ${item.completed ? "is-complete" : ""}" style="--s2-order:${index}">
            <span aria-hidden="true">${homeS2Escape(item.icon)}</span><div><strong>${homeS2Escape(item.title)}</strong>
            <small>${progress.toLocaleString("uz-UZ")} / ${item.target.toLocaleString("uz-UZ")}</small>
            <i><b style="--mission-progress:${percent}%"></b></i></div><em>${percent}%</em></article>`;
    }).join("");
}

function renderHomeS2Featured() {
    const root = document.getElementById("homeFeaturedCards");
    if (!root || typeof promotionsUserState === "undefined") return;
    const items = promotionsUserState.items.slice(0, 3);
    if (!items.length) {
        root.innerHTML = homeS2Empty("◇", "Featured kartalar tayyorlanmoqda", "Faol premium takliflar paydo bo‘lganda shu yerda ko‘rsatiladi.", "promotions", "Takliflarni ko‘rish");
        return;
    }
    root.innerHTML = items.map((item, index) => `<button class="home-s2-feature" data-home-feature="${item.id}" type="button" style="--s2-order:${index}">
        <span>${homeS2Escape(item.badge || "FEATURED")}</span><strong>${homeS2Escape(item.title)}</strong>
        <small>${homeS2Escape(item.subtitle || item.description || "")}</small><i>›</i></button>`).join("");
    root.querySelectorAll("[data-home-feature]").forEach((button) => {
        button.addEventListener("click", () => activatePromotion(Number(button.dataset.homeFeature)));
    });
}

function renderHomeS2Loading() {
    ["homeRecentActivity", "homeDailyMissions", "homeFeaturedCards"].forEach((id) => {
        const root = document.getElementById(id);
        if (root) root.innerHTML = `<div class="home-s2-skeleton"><i></i><i></i><i></i></div>`;
    });
}

async function loadHomePremiumS2() {
    const page = document.getElementById("homePage");
    if (!page?.classList.contains("active-page") || homePremiumS2State.loading) return;
    homePremiumS2State.loading = true;
    renderHomeS2Loading();
    const calls = {
        arena: typeof arenaApiClient !== "undefined" && arenaApiClient.myMatches ? arenaApiClient.myMatches({ limit: 5 }) : Promise.resolve([]),
        wallet: typeof getWalletTransactions === "function" ? getWalletTransactions({ limit: 5, offset: 0 }) : Promise.resolve([]),
        wheel: typeof getWheelStatus === "function" ? getWheelStatus() : Promise.resolve({}),
        orders: typeof getUserOrders === "function" ? getUserOrders() : Promise.resolve([]),
        referrals: typeof getReferralSummary === "function" ? getReferralSummary() : Promise.resolve({}),
    };
    const entries = await Promise.all(Object.entries(calls).map(async ([key, promise]) => {
        try { return [key, await promise]; } catch (_) { return [key, null]; }
    }));
    const results = Object.fromEntries(entries);
    renderHomeS2Activity(collectHomeS2Activities(results));
    renderHomeS2Missions(explicitMissionRows(results));
    renderHomeS2Featured();
    homePremiumS2State.loading = false;
}

function initializeHomePremiumS2() {
    const page = document.getElementById("homePage");
    if (!page) return;
    if (!homePremiumS2State.initialized) {
        if (typeof MutationObserver !== "undefined") {
            homePremiumS2State.promotionObserver = new MutationObserver(renderHomeS2Featured);
            const promotions = document.getElementById("homePromotions");
            if (promotions) homePremiumS2State.promotionObserver.observe(promotions, { childList: true, subtree: true });
        }
        page.addEventListener("click", (event) => {
            const target = event.target.closest(".home-s2-empty [data-page],.home-s2-activity[data-page]");
            if (!target || typeof openPage !== "function") return;
            event.preventDefault();
            openPage(target.dataset.page);
        });
        page.addEventListener("pointerdown", (event) => {
            const card = event.target.closest(".home-s2-feature,.home-s2-activity,.home-s2-empty button");
            if (!card || card.disabled) return;
            const ripple = document.createElement("i");
            ripple.className = "home-v4-ripple";
            const bounds = card.getBoundingClientRect();
            ripple.style.setProperty("--x", `${event.clientX - bounds.left}px`);
            ripple.style.setProperty("--y", `${event.clientY - bounds.top}px`);
            card.appendChild(ripple);
            setTimeout(() => ripple.remove(), 640);
        });
        homePremiumS2State.initialized = true;
    }
    loadHomePremiumS2();
}

globalThis.loadHomePremiumS2 = loadHomePremiumS2;
globalThis.addEventListener?.("levelgroup:app-ready", initializeHomePremiumS2);

if (typeof module !== "undefined") {
    module.exports = { homeS2Array, homeS2Timestamp, homeS2Status, collectHomeS2Activities, explicitMissionRows };
}
