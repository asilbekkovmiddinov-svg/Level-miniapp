const homePremiumState = {
    initialized: false,
    balanceObserver: null,
    pageObserver: null,
};

function homePremiumEscape(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function homePremiumSafeUrl(value) {
    try {
        const url = new URL(String(value || ""));
        return url.protocol === "https:" ? url.href : "";
    } catch (_) {
        return "";
    }
}

function homeTelegramProfile() {
    const user = globalThis.Telegram?.WebApp?.initDataUnsafe?.user || {};
    const displayName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim()
        || user.username || globalThis.FIRST_NAME || "O‘yinchi";
    return {
        displayName,
        photoUrl: homePremiumSafeUrl(user.photo_url),
        initial: Array.from(displayName.trim())[0]?.toLocaleUpperCase("uz-UZ") || "L",
    };
}

function renderPremiumHomeIdentity() {
    const profile = homeTelegramProfile();
    const name = document.getElementById("homeName");
    const avatar = document.getElementById("homeTelegramAvatar");
    if (name) name.textContent = profile.displayName;
    if (!avatar) return;
    avatar.classList.toggle("is-fallback", !profile.photoUrl);
    avatar.innerHTML = `<b>${homePremiumEscape(profile.initial)}</b>
        ${profile.photoUrl ? `<img src="${homePremiumEscape(profile.photoUrl)}" alt="" loading="eager" decoding="async"
            onerror="this.remove();this.parentElement.classList.add('is-fallback')">` : ""}<i></i>`;
}

function parseHomeMetric(value) {
    const normalized = String(value ?? "").replaceAll(/[^\d.-]/g, "");
    const number = Number(normalized);
    return Number.isFinite(number) ? number : null;
}

function setHomePremiumCounter(id, value, { suffix = "", duration = 650 } = {}) {
    const target = document.getElementById(id);
    const numeric = parseHomeMetric(value);
    if (!target) return;
    if (numeric === null) {
        target.textContent = value || "—";
        return;
    }
    const reduced = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduced || typeof globalThis.requestAnimationFrame !== "function") {
        target.textContent = `${numeric.toLocaleString("uz-UZ")}${suffix}`;
        return;
    }
    const startedAt = performance.now();
    const tick = (now) => {
        const progress = Math.min(1, (now - startedAt) / duration);
        const current = Math.round(numeric * (1 - Math.pow(1 - progress, 3)));
        target.textContent = `${current.toLocaleString("uz-UZ")}${suffix}`;
        if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
}

function observeHomeBalances() {
    if (homePremiumState.balanceObserver || typeof MutationObserver === "undefined") return;
    const targets = document.querySelectorAll("[data-home-balance]");
    homePremiumState.balanceObserver = new MutationObserver((records) => {
        records.forEach(({ target }) => {
            const element = target.nodeType === Node.TEXT_NODE ? target.parentElement : target;
            element?.classList.remove("home-v4-balance-updated");
            globalThis.requestAnimationFrame?.(() => element?.classList.add("home-v4-balance-updated"));
        });
    });
    targets.forEach((target) => homePremiumState.balanceObserver.observe(target, {
        childList: true, characterData: true, subtree: true,
    }));
}

function bindHomePremiumRipple(page) {
    page.addEventListener("pointerdown", (event) => {
        const button = event.target.closest(".home-v4-quick,.home-v4-icon,.wallet-action");
        if (!button || button.disabled) return;
        const bounds = button.getBoundingClientRect();
        const ripple = document.createElement("i");
        ripple.className = "home-v4-ripple";
        ripple.style.setProperty("--x", `${event.clientX - bounds.left}px`);
        ripple.style.setProperty("--y", `${event.clientY - bounds.top}px`);
        button.appendChild(ripple);
        setTimeout(() => ripple.remove(), 640);
    });
}

async function refreshHomePremiumInfo() {
    const page = document.getElementById("homePage");
    if (!page?.classList.contains("active-page")) return;
    if (typeof arenaApiClient === "undefined" || typeof arenaApiClient.dashboard !== "function") return;
    try {
        const metrics = await arenaApiClient.dashboard();
        const online = metrics.reduce((sum, item) => sum + (Number(item.onlinePlayers) || 0), 0);
        const active = metrics.reduce((sum, item) => sum + (Number(item.openRooms) || 0), 0);
        setHomePremiumCounter("homeOnlineUsers", online);
        setHomePremiumCounter("homeActiveMatches", active);
    } catch (_) {
        setHomePremiumCounter("homeOnlineUsers", "—");
        setHomePremiumCounter("homeActiveMatches", "—");
    }
}

function updateHomePremiumLiveInfo(data = {}, rawPayload = {}) {
    const source = rawPayload?.data || rawPayload || {};
    const today = source.today_stats || source.stats || data.today || {};
    const winnerCount = Number(today.winners_count ?? today.total_winners ?? data.winners?.length);
    const weeklyPrize = source.weekly_prize_pool_efc
        ?? source.weekly_prize_pool
        ?? source.weekly_stats?.prize_pool_efc
        ?? null;
    setHomePremiumCounter("homeTodayWinners", Number.isFinite(winnerCount) ? winnerCount : "—");
    setHomePremiumCounter("homeWeeklyPrize", weeklyPrize === null ? "—" : weeklyPrize, {
        suffix: weeklyPrize === null ? "" : " EFC",
    });
}

function initializePremiumHome() {
    const page = document.getElementById("homePage");
    if (!page) return;
    renderPremiumHomeIdentity();
    observeHomeBalances();
    if (!homePremiumState.initialized) {
        bindHomePremiumRipple(page);
        if (typeof MutationObserver !== "undefined") {
            homePremiumState.pageObserver = new MutationObserver(() => {
                if (page.classList.contains("active-page")) refreshHomePremiumInfo();
            });
            homePremiumState.pageObserver.observe(page, { attributes: true, attributeFilter: ["class"] });
        }
        homePremiumState.initialized = true;
    }
    refreshHomePremiumInfo();
}

globalThis.initializePremiumHome = initializePremiumHome;
globalThis.updateHomePremiumLiveInfo = updateHomePremiumLiveInfo;
globalThis.addEventListener?.("levelgroup:app-ready", initializePremiumHome);

if (typeof module !== "undefined") {
    module.exports = {
        homePremiumSafeUrl,
        homeTelegramProfile,
        parseHomeMetric,
        setHomePremiumCounter,
        updateHomePremiumLiveInfo,
    };
}
