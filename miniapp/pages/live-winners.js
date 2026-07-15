let liveWinnersTimer = null;
let liveWinnerIds = new Set();
let liveWinnersLoaded = false;

function maskWinnerIdentity(value) {
    const text = String(value || "").trim().replace(/^@/, "");
    if (!text) return "LG foydalanuvchi";
    if (text.length <= 2) return `${text[0]}*`;
    const visibleStart = text.slice(0, Math.min(2, text.length - 1));
    const visibleEnd = text.slice(-1);
    return `${visibleStart}${"*".repeat(Math.max(4, text.length - 3))}${visibleEnd}`;
}

function normalizeWinnerReward(source = {}) {
    const rawType = String(source.reward_type || source.currency || source.type || "EFC").toUpperCase();
    const type = rawType === "COINS" ? "COIN" : rawType;
    const amount = Math.max(0, Number(source.reward_amount ?? source.amount ?? source.value ?? 0) || 0);
    const formatted = amount.toLocaleString("uz-UZ").replace(/[\u00a0\u202f]/g, " ");
    return {
        type,
        amount,
        label: `${formatted} ${type === "COIN" ? "Coin" : type}`,
        icon: type === "COIN" ? (amount >= 2000 ? "👑" : "🪙") : type === "UZS" ? "💵" : "💰",
    };
}

function liveWinnersArray(payload) {
    const source = payload?.data || payload || {};
    const winners = source.winners || source.items || source.results || [];
    return Array.isArray(winners) ? winners : [];
}

function normalizeLiveWinners(payload) {
    const source = payload?.data || payload || {};
    return {
        winners: liveWinnersArray(payload).map((winner, index) => ({
            ...winner,
            _key: String(winner.id || winner.reward_id || `${winner.telegram_id || "winner"}-${winner.created_at || winner.won_at || index}`),
            reward: normalizeWinnerReward(winner),
            maskedName: maskWinnerIdentity(winner.display_name || winner.first_name || winner.name),
            maskedUsername: winner.username ? `@${maskWinnerIdentity(winner.username)}` : "",
            wonAt: winner.won_at || winner.created_at || winner.timestamp || null,
        })),
        today: source.today_stats || source.stats || {},
        jackpot: source.last_jackpot || source.jackpot || null,
    };
}

function liveWinnerRelativeTime(value, now = Date.now()) {
    const timestamp = new Date(value).getTime();
    if (!Number.isFinite(timestamp)) return "Hozirgina";
    const minutes = Math.max(0, Math.floor((now - timestamp) / 60000));
    if (minutes < 1) return "Hozirgina";
    if (minutes < 60) return `${minutes} daqiqa oldin`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} soat oldin`;
    return `${Math.floor(hours / 24)} kun oldin`;
}

function liveWinnerAvatar(winner) {
    const user = {
        photo_url: winner.photo_url || winner.avatar_url || winner.profile_photo_url,
        display_name: winner.maskedName,
        username: winner.maskedUsername,
    };
    return typeof userAvatarComponent === "function"
        ? userAvatarComponent(user, { size: "md" })
        : `<span class="user-avatar user-avatar-md is-fallback"><b class="user-avatar-fallback">LG</b></span>`;
}

function liveWinnerCard(winner, isNew = false) {
    const tone = ["EFC", "UZS", "COIN"].includes(winner.reward.type) ? winner.reward.type.toLowerCase() : "efc";
    return `<article class="live-winner-card live-reward-${tone} ${isNew ? "is-new" : ""}" data-winner-id="${winner._key}">
        ${liveWinnerAvatar(winner)}
        <span class="live-winner-copy"><strong>${liveWinnersEscape(winner.maskedName)}</strong>${winner.maskedUsername ? `<small>${liveWinnersEscape(winner.maskedUsername)}</small>` : ""}</span>
        <span class="live-winner-reward"><b>${winner.reward.icon} ${liveWinnersEscape(winner.reward.label)}</b><time>${liveWinnersEscape(liveWinnerRelativeTime(winner.wonAt))}</time></span>
    </article>`;
}

function liveWinnersMeta(data) {
    const efc = Number(data.today.efc || data.today.total_efc || 0).toLocaleString("uz-UZ");
    const uzs = Number(data.today.uzs || data.today.total_uzs || 0).toLocaleString("uz-UZ");
    const coin = Number(data.today.coin || data.today.coins || data.today.total_coin || 0).toLocaleString("uz-UZ");
    const jackpotReward = data.jackpot ? normalizeWinnerReward(data.jackpot) : null;
    return `<div class="live-winners-meta">
        <article class="live-today-stats"><span>📊 Bugun tarqatildi</span><div class="live-today-values"><b>💰 EFC: ${efc}</b><b>💵 UZS: ${uzs}</b><b>🪙 Coin: ${coin}</b></div></article>
        <article class="live-jackpot"><span>🔥 Oxirgi Jackpot</span><strong>${jackpotReward ? `${jackpotReward.icon} ${liveWinnersEscape(jackpotReward.label)}` : "Hali yo‘q"}</strong><small>${data.jackpot ? liveWinnersEscape(liveWinnerRelativeTime(data.jackpot.won_at || data.jackpot.created_at)) : "—"}</small></article>
    </div>`;
}

function renderLiveWinners(payload) {
    const panel = document.getElementById("liveWinnersPanel");
    if (!panel) return;
    const data = normalizeLiveWinners(payload);
    if (!data.winners.length) {
        panel.innerHTML = `<div class="live-winners-state"><i>🏆</i><strong>Bugungi g‘olib siz bo‘lishingiz mumkin</strong><small>Yangi yutuqlar shu yerda jonli ko‘rinadi.</small></div>${liveWinnersMeta(data)}`;
        liveWinnersLoaded = true;
        return;
    }
    const incomingIds = new Set(data.winners.map((winner) => winner._key));
    panel.innerHTML = `<div class="live-winners-list">${data.winners.slice(0, 6).map((winner) => liveWinnerCard(winner, liveWinnersLoaded && !liveWinnerIds.has(winner._key))).join("")}</div>${liveWinnersMeta(data)}`;
    liveWinnerIds = incomingIds;
    liveWinnersLoaded = true;
}

async function loadLiveWinners({ silent = false } = {}) {
    const panel = document.getElementById("liveWinnersPanel");
    if (!panel || !document.getElementById("homePage")?.classList.contains("active-page")) return;
    if (!silent && !liveWinnersLoaded) panel.innerHTML = `<div class="live-winners-skeleton" aria-label="Yutuqlar yuklanmoqda"><i></i><i></i><i></i></div>`;
    try {
        renderLiveWinners(await getLiveWheelWinners());
    } catch (error) {
        if (silent && liveWinnersLoaded) return;
        panel.innerHTML = `<div class="live-winners-state"><i>!</i><strong>Yutuqlar yuklanmadi</strong><small>Aloqani tekshirib, qayta urinib ko‘ring.</small><button type="button" onclick="loadLiveWinners()">Qayta urinish</button></div>`;
    }
}

function startLiveWinners() {
    clearInterval(liveWinnersTimer);
    loadLiveWinners();
    liveWinnersTimer = setInterval(() => loadLiveWinners({ silent: true }), 12000);
}

function liveWinnersEscape(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

if (typeof module !== "undefined") {
    module.exports = { maskWinnerIdentity, normalizeWinnerReward, normalizeLiveWinners, liveWinnerRelativeTime, liveWinnerCard };
}
