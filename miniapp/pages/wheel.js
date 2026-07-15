const WHEEL_PRIZES = [
    { label: "Omad kelmadi", icon: "✦", tone: "#34313b", type: "NONE", amount: 0 },
    { label: "50 EFC", icon: "💰", tone: "#991b1b", type: "EFC", amount: 50 },
    { label: "100 EFC", icon: "💰", tone: "#4c1d95", type: "EFC", amount: 100 },
    { label: "500 UZS", icon: "💵", tone: "#166534", type: "UZS", amount: 500 },
    { label: "250 EFC", icon: "💎", tone: "#9f1239", type: "EFC", amount: 250 },
    { label: "500 EFC", icon: "💎", tone: "#4338ca", type: "EFC", amount: 500 },
    { label: "1000 UZS", icon: "💵", tone: "#047857", type: "UZS", amount: 1000 },
    { label: "5000 UZS", icon: "💵", tone: "#0f766e", type: "UZS", amount: 5000 },
    { label: "130 Coin", icon: "🪙", tone: "#b45309", type: "COIN", amount: 130 },
    { label: "2000 Coin", icon: "👑", tone: "#7e22ce", type: "COIN", amount: 2000 },
];

let wheelData = null;
let wheelSpinState = {
    rotation: 0,
    sectorIndex: null,
    backendResult: null,
    spinning: false,
};
let wheelActiveReward = null;
let wheelCoinWizard = null;
let wheelCoinSubmitting = false;
let wheelCountdownTimer = null;
let wheelCooldownSnapshot = null;
let wheelStateRefreshing = false;
let wheelLastExpiryRefreshKey = null;
let wheelLastBackendResult = null;

const WHEEL_COIN_REGIONS = ["Global", "Japan"];
const WHEEL_COIN_PLATFORMS = ["Android", "iOS"];

function wheelStatusValue(source, keys, fallback = 0) {
    for (const key of keys) {
        if (source?.[key] !== undefined && source?.[key] !== null) return source[key];
    }
    return fallback;
}

function wheelStatusFlag(source, keys) {
    const value = wheelStatusValue(source, keys, null);
    return value === true || value === 1 || ["true", "1", "yes"].includes(String(value).toLowerCase());
}

function wheelHasStatusField(source, keys) {
    return keys.some((key) => Object.prototype.hasOwnProperty.call(source || {}, key));
}

function wheelTimestamp(source, deadlineKeys, lastKeys, cooldownMs) {
    const direct = wheelStatusValue(source, deadlineKeys, null);
    if (direct) {
        const value = new Date(direct).getTime();
        if (Number.isFinite(value)) return value;
    }
    const last = wheelStatusValue(source, lastKeys, null);
    if (!last) return null;
    const value = new Date(last).getTime();
    return Number.isFinite(value) ? value + cooldownMs : null;
}

function wheelCooldownState(source, now = Date.now()) {
    const hasNewFreeCount = wheelHasStatusField(source, ["remaining_free_spins"]);
    const hasNewFreeFlag = wheelHasStatusField(source, ["free_spin_available", "free_spin_ready"]);
    const hasLegacyFree = wheelHasStatusField(source, ["free_spin_used"]);
    const hasNewAdCount = wheelHasStatusField(source, ["remaining_ad_spins"]);
    const hasNewAdFlag = wheelHasStatusField(source, ["ad_spin_available", "ad_spin_ready"]);
    const hasLegacyAd = wheelHasStatusField(source, ["ad_spin_count", "max_ad_spins"]);

    const legacyFreeAvailable = hasLegacyFree && !wheelStatusFlag(source, ["free_spin_used"]);
    const freeSpins = hasNewFreeCount
        ? Math.max(0, Number(source.remaining_free_spins) || 0)
        : hasLegacyFree ? (legacyFreeAvailable ? 1 : 0)
            : Math.max(0, Number(wheelStatusValue(source, ["free_spins", "daily_free_spins"])) || 0);

    const legacyAdUsed = Math.max(0, Number(source?.ad_spin_count) || 0);
    const legacyAdMax = Math.max(0, Number(source?.max_ad_spins) || 0);
    const adSpins = hasNewAdCount
        ? Math.max(0, Number(source.remaining_ad_spins) || 0)
        : hasLegacyAd ? Math.max(0, legacyAdMax - legacyAdUsed)
            : Math.max(0, Number(wheelStatusValue(source, ["ad_spins", "rewarded_spins"])) || 0);
    const explicitRemaining = wheelStatusValue(source, ["remaining_spins", "spins_left"], null);
    const remaining = explicitRemaining === null ? freeSpins + adSpins : Math.max(0, Number(explicitRemaining) || 0);
    const freeAt = wheelTimestamp(
        source,
        ["next_free_spin_at", "free_spin_available_at", "free_spin_cooldown_until"],
        ["last_free_spin_at", "free_spin_used_at"],
        24 * 60 * 60 * 1000,
    );
    const adAt = wheelTimestamp(
        source,
        ["next_ad_spin_at", "ad_spin_available_at", "ad_spin_cooldown_until"],
        ["last_ad_spin_at", "ad_spin_used_at", "ad_viewed_at"],
        60 * 60 * 1000,
    );
    const freeReady = (hasNewFreeFlag && wheelStatusFlag(source, ["free_spin_available", "free_spin_ready"]))
        || (!hasNewFreeFlag && legacyFreeAvailable)
        || freeSpins > 0 || (freeAt !== null && freeAt <= now);
    const adReady = hasNewAdFlag
        ? wheelStatusFlag(source, ["ad_spin_available", "ad_spin_ready"])
        : adSpins > 0 && adAt === null;
    const freeCooldown = !freeReady && freeAt !== null && freeAt > now;
    const adCooldown = !adReady && adAt !== null && adAt > now;
    const deadlines = [freeReady ? null : freeAt, adReady ? null : adAt].filter((value) => value && value > now);

    return {
        freeSpins,
        adSpins,
        remaining,
        freeAt,
        adAt,
        freeReady,
        adReady,
        freeCooldown,
        adCooldown,
        canSpin: (explicitRemaining !== null && Number(explicitRemaining) > 0) || freeReady || adReady,
        nextReadyAt: deadlines.length ? Math.min(...deadlines) : null,
    };
}

function formatWheelCountdown(deadline, now = Date.now()) {
    if (!deadline || deadline <= now) return "00:00:00";
    const seconds = Math.max(0, Math.ceil((deadline - now) / 1000));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const rest = seconds % 60;
    return [hours, minutes, rest].map((value) => String(value).padStart(2, "0")).join(":");
}

function normalizeWheelDegrees(rotation) {
    const value = Number(rotation);
    if (!Number.isFinite(value)) return 0;
    const normalized = ((value % 360) + 360) % 360;
    return Math.abs(normalized - 360) < 1e-9 || Math.abs(normalized) < 1e-9 ? 0 : normalized;
}

function wheelFinalRotationForSector(index, sectors = WHEEL_PRIZES.length) {
    const safeIndex = Math.max(0, Math.min(sectors - 1, Math.round(Number(index) || 0)));
    return normalizeWheelDegrees(360 - safeIndex * (360 / sectors));
}

function wheelSectorIndexFromRotation(rotation, sectors = WHEEL_PRIZES.length) {
    return Math.round(normalizeWheelDegrees(360 - normalizeWheelDegrees(rotation)) / (360 / sectors)) % sectors;
}

function wheelTargetRotation(index, currentRotation = 0, turns = 6, sectors = WHEEL_PRIZES.length) {
    const current = Number.isFinite(Number(currentRotation)) ? Number(currentRotation) : 0;
    const targetAtPointer = wheelFinalRotationForSector(index, sectors);
    let target = Math.floor(current / 360) * 360 + Math.max(1, Number(turns) || 1) * 360 + targetAtPointer;
    while (target <= current) target += 360;
    return target;
}

function setWheelRotation(disc, rotation) {
    wheelSpinState.rotation = Number(rotation);
    disc.dataset.rotation = String(wheelSpinState.rotation);
    disc.style.transform = `rotate(${wheelSpinState.rotation}deg)`;
}

function beginWheelVisualSpin(disc, sectorIndex, backendResult, turns) {
    wheelSpinState = {
        rotation: wheelTargetRotation(sectorIndex, wheelSpinState.rotation, turns),
        sectorIndex,
        backendResult,
        spinning: true,
    };
    disc.classList.add("is-spinning");
    void disc.offsetWidth;
    setWheelRotation(disc, wheelSpinState.rotation);
}

function settleWheelVisualSpin(disc) {
    disc.classList.remove("is-spinning");
    setWheelRotation(disc, wheelFinalRotationForSector(wheelSpinState.sectorIndex));
    void disc.offsetWidth;
    wheelSpinState.spinning = false;
    return wheelSectorIndexFromRotation(wheelSpinState.rotation);
}

function normalizeWheelReward(payload) {
    const source = payload?.data?.reward || payload?.reward || payload?.data || payload || {};
    const rawType = String(source.reward_type || source.currency || source.type || "NONE").toUpperCase();
    const aliases = { EFC_BALANCE: "EFC", UZS_BALANCE: "UZS", COINS: "COIN", COIN_ORDER: "COIN", BONUS_SPIN: "BONUS" };
    const type = aliases[rawType] || rawType;
    const amount = Math.max(0, Number(source.amount ?? source.reward_amount ?? source.value ?? 0) || 0);
    const empty = amount === 0 || ["NONE", "NO_REWARD", "LOSE", "EMPTY"].includes(type);
    const currency = empty ? "NONE" : type;
    const formattedAmount = (Number.isInteger(amount)
        ? amount.toLocaleString("uz-UZ")
        : amount.toLocaleString("uz-UZ", { maximumFractionDigits: 2 }))
        .replace(/[\u00a0\u202f]/g, " ");
    const label = empty ? "Omad kelmadi" : `${formattedAmount} ${currency === "COIN" ? "Coin" : currency}`;
    const isCoin = currency === "COIN";
    const isLarge = (currency === "EFC" && amount >= 250)
        || (currency === "UZS" && amount >= 5000)
        || (isCoin && amount >= 2000);

    return {
        type: currency,
        amount,
        label,
        icon: empty ? "✦" : isCoin ? (amount >= 2000 ? "👑" : "🪙") : currency === "UZS" ? "💵" : amount >= 250 ? "💎" : "💰",
        isCoin,
        isLarge,
        credited: currency === "EFC" || currency === "UZS",
        empty,
    };
}

function wheelSectorIndexForReward(payload) {
    const reward = normalizeWheelReward(payload);
    const exact = WHEEL_PRIZES.findIndex((prize) => prize.type === reward.type && Number(prize.amount) === reward.amount);
    if (exact >= 0) return exact;
    const key = String(payload?.reward_code || `${reward.type}:${reward.amount}`);
    let hash = 0;
    for (let index = 0; index < key.length; index += 1) hash = ((hash * 31) + key.charCodeAt(index)) >>> 0;
    return hash % WHEEL_PRIZES.length;
}

function applyWheelBackendSector(payload) {
    return wheelSectorIndexForReward(payload);
}

function wheelSectorSvgMarkup() {
    const sectorPath = "M100 100 L72.188 14.405 A90 90 0 0 1 127.812 14.405 Z";
    return WHEEL_PRIZES.map((prize, index) => {
        const angle = index * (360 / WHEEL_PRIZES.length);
        return `<g class="wheel-v2-sector" data-sector-index="${index}" transform="rotate(${angle} 100 100)">
            <path d="${sectorPath}" fill="${prize.tone}"></path>
            <text class="wheel-v2-icon" x="100" y="29" text-anchor="middle">${prize.icon}</text>
            <text class="wheel-v2-label" x="100" y="42" text-anchor="middle">${escapeWheelText(prize.label)}</text>
        </g>`;
    }).join("");
}

function wheelDiscMarkup() {
    return `<div class="wheel-v2-disc">
        <svg class="wheel-v2-svg" viewBox="0 0 200 200" role="img" aria-label="Omad g‘ildiragi">
            <g id="premiumWheelDisc" class="wheel-v2-rotor" data-rotation="0">
                <circle cx="100" cy="100" r="96" class="wheel-v2-rim"></circle>
                <g class="wheel-v2-sectors">${wheelSectorSvgMarkup()}</g>
                <circle cx="100" cy="100" r="24" class="wheel-v2-hub-ring"></circle>
                <circle cx="100" cy="100" r="18" class="wheel-v2-hub"></circle>
                <text x="100" y="104" text-anchor="middle" class="wheel-v2-logo">LG</text>
            </g>
            <g id="wheelPointer" class="wheel-v2-pointer" aria-hidden="true">
                <path d="M91 0 H109 L100 10 Z"></path>
                <circle cx="100" cy="3.5" r="3"></circle>
            </g>
        </svg>
    </div>`;
}

function wheelPageMarkup() {
    return `
        <div class="premium-wheel premium-wheel-visual wheel-v2">
            <header class="wheel-hero">
                <span class="wheel-kicker">LEVEL BONUS</span>
                <h2>Omad g‘ildiragi</h2>
                <p>Bugungi imkoniyatingizni aylantiring va sovrinni qo‘lga kiriting.</p>
            </header>

            <section class="wheel-stage" aria-label="Omad g‘ildiragi">
                ${wheelDiscMarkup()}
            </section>

            <div id="wheelStatusRegion" class="wheel-status-region" aria-live="polite">
                ${wheelSkeletonMarkup()}
            </div>

            <button id="wheelSpinButton" class="wheel-spin-button" type="button" disabled>
                <i class="wheel-button-ripple" aria-hidden="true"></i>
                <span class="wheel-spin-icon">✦</span>
                <b>Aylantirish</b>
                <small id="wheelSpinHint">Ma’lumot yuklanmoqda</small>
            </button>
            <p class="wheel-footnote">Har bir spin natijasi bir marta hisoblanadi.</p>
        </div>

        <div id="wheelResultModal" class="wheel-result-modal" hidden>
            <div class="wheel-result-backdrop" data-wheel-close></div>
            <div id="wheelConfetti" class="wheel-confetti" aria-hidden="true">
                ${Array.from({ length: 16 }, (_, index) => `<i style="--confetti-index:${index}"></i>`).join("")}
            </div>
            <div class="wheel-reward-particles" aria-hidden="true">
                ${Array.from({ length: 12 }, (_, index) => `<i style="--particle-index:${index}"></i>`).join("")}
            </div>
            <div class="wheel-reward-flash" aria-hidden="true"></div>
            <section id="wheelResultCard" class="wheel-result-card" role="dialog" aria-modal="true" aria-labelledby="wheelResultTitle">
                <div id="wheelResultIcon" class="wheel-result-burst">🎉</div>
                <span id="wheelResultKicker">OMAD SIZ TOMONDA</span>
                <h3 id="wheelResultTitle">Tabriklaymiz!</h3>
                <p id="wheelResultMessage">Siz <strong id="wheelResultPrize">—</strong> yutdingiz.</p>
                <small id="wheelRewardCredit" class="wheel-reward-credit">Balansingizga avtomatik qo‘shildi.</small>
                <button id="wheelCoinOrderButton" class="wheel-coin-order" type="button" hidden>🏆 Coin buyurtmasini rasmiylashtirish</button>
                <button class="wheel-result-continue" type="button" data-wheel-close>Davom etish</button>
            </section>
        </div>

        <div id="wheelCoinWizard" class="wheel-wizard-modal" hidden>
            <div class="wheel-result-backdrop" data-wheel-wizard-close></div>
            <section class="wheel-wizard-card" role="dialog" aria-modal="true" aria-labelledby="wheelWizardTitle">
                <header>
                    <button class="wheel-wizard-back" type="button" data-wheel-wizard-back aria-label="Ortga">‹</button>
                    <div><span>COIN REWARD</span><h3 id="wheelWizardTitle">Buyurtmani rasmiylashtirish</h3></div>
                    <button class="wheel-wizard-close" type="button" data-wheel-wizard-close aria-label="Yopish">×</button>
                </header>
                <div class="wheel-wizard-progress"><i id="wheelWizardProgress"></i></div>
                <small id="wheelWizardStepLabel" class="wheel-wizard-step">1/4</small>
                <form id="wheelWizardForm" novalidate>
                    <div id="wheelWizardBody"></div>
                    <p id="wheelWizardError" class="wheel-wizard-error" role="alert"></p>
                    <button id="wheelWizardNext" class="wheel-wizard-next" type="submit">Davom etish</button>
                </form>
            </section>
        </div>`;
}

function wheelSkeletonMarkup() {
    return `<div class="wheel-stats wheel-skeleton" aria-label="Wheel ma’lumotlari yuklanmoqda">
        ${Array.from({ length: 4 }, () => `<article><i></i><span></span><b></b></article>`).join("")}
    </div>`;
}

async function loadWheelPage() {
    Navbar.setActive("wheel");
    showPage("wheelPage", "Wheel");

    const page = document.getElementById("wheelPage");
    clearInterval(wheelCountdownTimer);
    page.innerHTML = wheelPageMarkup();
    bindWheelEvents();
    await loadWheelStatus();
}

function bindWheelEvents() {
    document.getElementById("wheelSpinButton")?.addEventListener("click", spinFreeWheel);
    document.querySelectorAll("[data-wheel-close]").forEach((button) => {
        button.addEventListener("click", closeWheelResult);
    });
    document.getElementById("wheelCoinOrderButton")?.addEventListener("click", showWheelCoinOrderPreview);
    document.getElementById("wheelWizardForm")?.addEventListener("submit", submitWheelWizardStep);
    document.querySelector("[data-wheel-wizard-back]")?.addEventListener("click", previousWheelWizardStep);
    document.querySelectorAll("[data-wheel-wizard-close]").forEach((button) => {
        button.addEventListener("click", closeWheelCoinWizard);
    });
}

async function loadWheelStatus({ silent = false } = {}) {
    const region = document.getElementById("wheelStatusRegion");
    const button = document.getElementById("wheelSpinButton");
    if (!region || !button) return;

    if (!silent) {
        region.innerHTML = wheelSkeletonMarkup();
        button.disabled = true;
    }

    try {
        const result = await getWheelStatus();
        if (!result || result.success === false) throw new Error("Wheel status unavailable");
        wheelData = result.data || result;
        if (wheelLastBackendResult
            && !wheelStatusValue(wheelData, ["last_prize", "last_reward", "last_win"], null)) {
            wheelData = { ...wheelData, last_win: wheelLastBackendResult };
        }
        renderWheelInfo();
    } catch (error) {
        console.error(error);
        if (silent) return;
        region.innerHTML = `<div class="wheel-state-card wheel-error-state">
            <span>!</span><strong>Wheel ma’lumotlari yuklanmadi</strong>
            <small>Internet aloqasini tekshirib, qayta urinib ko‘ring.</small>
            <button type="button" onclick="loadWheelStatus()">Qayta urinish</button>
        </div>`;
        button.disabled = true;
        document.getElementById("wheelSpinHint").textContent = "Hozircha mavjud emas";
    }
}

async function refreshWheelState() {
    if (wheelStateRefreshing) return;
    wheelStateRefreshing = true;
    try {
        await loadWheelStatus({ silent: true });
    } finally {
        wheelStateRefreshing = false;
    }
}

function renderWheelInfo() {
    const region = document.getElementById("wheelStatusRegion");
    const button = document.getElementById("wheelSpinButton");
    if (!region || !button) return;

    const cooldown = wheelCooldownState(wheelData);
    const lastPrize = normalizeWheelLastWin(wheelStatusValue(wheelData, ["last_prize", "last_reward", "last_win"], null));

    region.innerHTML = `<div class="wheel-stats">
        <article id="wheelFreeCard" class="wheel-timer-card ${cooldown.freeReady ? "is-ready" : cooldown.freeCooldown ? "is-cooldown" : ""}"><i>☀️</i><span>Bugungi bepul spin</span><b id="wheelFreeCountdown" ${cooldown.freeCooldown ? "" : "hidden"}>${cooldown.freeCooldown ? formatWheelCountdown(cooldown.freeAt) : ""}</b><em id="wheelFreeBadge" ${cooldown.freeReady || cooldown.freeCooldown ? "" : "hidden"}>${cooldown.freeReady ? "🟢 READY" : "🟡 COOLDOWN"}</em></article>
        <article id="wheelAdCard" class="wheel-timer-card ${cooldown.adReady ? "is-ready" : cooldown.adCooldown ? "is-cooldown" : ""}"><i>▶️</i><span>Reklama orqali</span><b id="wheelAdCountdown" ${cooldown.adCooldown ? "" : "hidden"}>${cooldown.adCooldown ? formatWheelCountdown(cooldown.adAt) : ""}</b><em id="wheelAdBadge" ${cooldown.adReady || cooldown.adCooldown ? "" : "hidden"}>${cooldown.adReady ? "🟢 READY" : "🟡 COOLDOWN"}</em></article>
        <article class="wheel-remaining-card"><i>✨</i><span>Qolgan spinlar</span><b>${cooldown.remaining}</b></article>
        <article class="wheel-last-win"><i>${lastPrize.icon}</i><span>Oxirgi yutuq</span><b>${escapeWheelText(lastPrize.label)}</b><small>${escapeWheelText(lastPrize.time)}</small><em>LAST WIN</em></article>
    </div>`;

    wheelCooldownSnapshot = cooldown;
    updateWheelCountdowns();
    clearInterval(wheelCountdownTimer);
    wheelCountdownTimer = setInterval(updateWheelCountdowns, 1000);
}

function updateWheelCountdowns(now = Date.now()) {
    if (!wheelData || !document.getElementById("wheelPage")?.classList.contains("active-page")) {
        clearInterval(wheelCountdownTimer);
        return;
    }
    const previous = wheelCooldownSnapshot;
    const current = wheelCooldownState(wheelData, now);
    updateWheelTimerCard("Free", current.freeReady, current.freeCooldown, current.freeAt, now);
    updateWheelTimerCard("Ad", current.adReady, current.adCooldown, current.adAt, now);
    const button = document.getElementById("wheelSpinButton");
    const hint = document.getElementById("wheelSpinHint");
    if (button) {
        button.disabled = wheelSpinState.spinning || !current.canSpin;
        button.classList.toggle("is-ready", current.canSpin && !wheelSpinState.spinning);
        if (!wheelSpinState.spinning && current.canSpin) button.querySelector("b").textContent = "Aylantirish";
    }
    if (hint) hint.textContent = wheelNextSpinHint(current, now);
    if (previous && ((!previous.freeReady && current.freeReady) || (!previous.adReady && current.adReady))) {
        button?.classList.add("just-ready");
        setTimeout(() => button?.classList.remove("just-ready"), 1400);
    }
    maybeRefreshWheelAtExpiry(current, now);
    wheelCooldownSnapshot = current;
}

function updateWheelTimerCard(kind, ready, cooldown, deadline, now) {
    const card = document.getElementById(`wheel${kind}Card`);
    const countdown = document.getElementById(`wheel${kind}Countdown`);
    const badge = document.getElementById(`wheel${kind}Badge`);
    if (!card || !countdown || !badge) return;
    const wasReady = card.classList.contains("is-ready");
    card.classList.toggle("is-ready", ready);
    card.classList.toggle("is-cooldown", cooldown);
    if (ready && !wasReady) card.classList.add("just-ready");
    countdown.hidden = !cooldown;
    countdown.textContent = cooldown ? formatWheelCountdown(deadline, now) : "";
    badge.hidden = !ready && !cooldown;
    badge.textContent = ready ? "🟢 READY" : cooldown ? "🟡 COOLDOWN" : "";
}

function wheelExpiredRefreshKey(state, now = Date.now()) {
    return [
        state.freeAt && state.freeAt <= now && state.freeSpins <= 0 ? `free:${state.freeAt}` : null,
        state.adAt && state.adAt <= now && state.adSpins <= 0 ? `ad:${state.adAt}` : null,
    ].filter(Boolean).join("|") || null;
}

function maybeRefreshWheelAtExpiry(state, now = Date.now()) {
    const key = wheelExpiredRefreshKey(state, now);
    if (!key || key === wheelLastExpiryRefreshKey) return;
    wheelLastExpiryRefreshKey = key;
    refreshWheelState();
}

function wheelNextSpinHint(state, now = Date.now()) {
    if (state.canSpin) return "Spin tayyor";
    const options = [
        !state.freeReady && state.freeAt ? { label: "Keyingi bepul spin", at: state.freeAt } : null,
        !state.adReady && state.adAt ? { label: "Keyingi reklama spini", at: state.adAt } : null,
    ].filter(Boolean).sort((left, right) => left.at - right.at);
    return options.length
        ? `${options[0].label}: ${formatWheelCountdown(options[0].at, now)}`
        : "Spin mavjud emas";
}

function normalizeWheelLastWin(value) {
    if (!value) return { icon: "✦", label: "Hali yutuq yo‘q", time: "—" };
    if (typeof value === "string" || typeof value === "number") {
        return { icon: "🏆", label: String(value), time: "Yaqinda" };
    }
    const reward = normalizeWheelReward(value);
    return {
        icon: reward.icon,
        label: reward.label,
        time: wheelRelativeTime(value.won_at || value.created_at || value.timestamp),
    };
}

function wheelRelativeTime(value, now = Date.now()) {
    const timestamp = new Date(value).getTime();
    if (!Number.isFinite(timestamp)) return "Yaqinda";
    const minutes = Math.max(0, Math.floor((now - timestamp) / 60000));
    if (minutes < 1) return "Hozirgina";
    if (minutes < 60) return `${minutes} daqiqa oldin`;
    const hours = Math.floor(minutes / 60);
    return hours < 24 ? `${hours} soat oldin` : `${Math.floor(hours / 24)} kun oldin`;
}

function wheelSoundCue(type, detail = {}) {
    if (!["spin", "tick", "reward", "jackpot"].includes(type)) return;
    globalThis.dispatchEvent?.(new CustomEvent("levelgroup:wheel-sound", { detail: { type, ...detail } }));
}

async function spinFreeWheel() {
    if (wheelSpinState.spinning) return;
    const disc = document.getElementById("premiumWheelDisc");
    const button = document.getElementById("wheelSpinButton");
    if (!disc || !button) return;

    wheelSpinState.spinning = true;
    button.disabled = true;
    button.classList.add("is-loading");
    button.querySelector("b").textContent = "Aylanmoqda";
    document.getElementById("wheelSpinHint").textContent = "Natija aniqlanmoqda";
    document.getElementById("wheelPointer")?.classList.remove("did-land");
    wheelSoundCue("spin");

    try {
        const spinType = wheelSpinType(wheelCooldownSnapshot, wheelData);
        const backendResult = await spinProductionWheel(spinType);
        if (!backendResult || backendResult.success === false) throw new Error(backendResult?.message || "Wheel aylantirilmadi.");
        wheelLastBackendResult = backendResult;
        const resultIndex = applyWheelBackendSector(backendResult);
        const turns = 6 + (Math.abs(Number(backendResult.global_spin_number) || 0) % 3);
        beginWheelVisualSpin(disc, resultIndex, backendResult, turns);
        disc.addEventListener("transitionend", finishWheelSpin, { once: true });
    } catch (error) {
        wheelSpinState.spinning = false;
        button.disabled = false;
        button.classList.remove("is-loading");
        button.querySelector("b").textContent = "Qayta urinish";
        document.getElementById("wheelSpinHint").textContent = error?.message || "Wheel aylantirilmadi";
        await refreshWheelState();
    }
}

function wheelSpinType(state, source = {}) {
    if (state?.freeReady) return "FREE";
    if (state?.adReady) return "AD";
    if (Number(source?.bonus_spin_count || source?.remaining_bonus_spins || 0) > 0) return "BONUS";
    throw new Error("Spin mavjud emas.");
}

function finishWheelSpin(event) {
    const disc = event.currentTarget;
    if (event.propertyName !== "transform") {
        disc.addEventListener("transitionend", finishWheelSpin, { once: true });
        return;
    }
    const resultIndex = wheelSpinState.sectorIndex;
    const backendResult = wheelSpinState.backendResult;
    if (settleWheelVisualSpin(disc) !== resultIndex) return;

    disc.classList.add("did-land");
    const pointer = document.getElementById("wheelPointer");
    pointer?.classList.add("did-land");
    setTimeout(() => {
        pointer?.classList.remove("did-land");
        disc.classList.remove("did-land");
    }, 720);
    const button = document.getElementById("wheelSpinButton");
    if (button) {
        button.disabled = false;
        button.classList.remove("is-loading");
        button.querySelector("b").textContent = "Yana aylantirish";
    }
    const hint = document.getElementById("wheelSpinHint");
    if (hint) hint.textContent = "Yana bir imkoniyat";
    openWheelResult(backendResult);
    refreshWheelAfterSpin();
}

async function refreshWheelAfterSpin() {
    await Promise.allSettled([
        refreshWheelState(),
        typeof refreshWallet === "function" ? refreshWallet() : Promise.resolve(),
        typeof loadLiveWinners === "function" ? loadLiveWinners({ silent: true, force: true }) : Promise.resolve(),
    ]);
}

function openWheelResult(backendResult) {
    const modal = document.getElementById("wheelResultModal");
    const prizeNode = document.getElementById("wheelResultPrize");
    if (!modal || !prizeNode) return;
    const reward = normalizeWheelReward(backendResult);
    wheelActiveReward = reward;
    const card = document.getElementById("wheelResultCard");
    const coinButton = document.getElementById("wheelCoinOrderButton");
    const credit = document.getElementById("wheelRewardCredit");
    const title = document.getElementById("wheelResultTitle");
    const message = document.getElementById("wheelResultMessage");

    modal.classList.toggle("is-large-reward", reward.isLarge);
    modal.classList.toggle("is-empty-reward", reward.empty);
    modal.classList.toggle("is-coin-reward", reward.isCoin);
    card?.classList.toggle("is-coin-reward", reward.isCoin);
    document.getElementById("wheelResultIcon").textContent = reward.icon;
    document.getElementById("wheelResultKicker").textContent = reward.empty ? "KEYINGI SAFAR OMAD" : "SOVRIN QO‘LGA KIRITILDI";
    title.textContent = reward.empty ? "Omad kelmadi" : "Tabriklaymiz!";
    prizeNode.textContent = reward.label;
    message.firstChild.textContent = reward.empty ? "Bu safar sovrin chiqmadi. " : "Siz ";
    message.lastChild.textContent = reward.empty ? "" : " yutdingiz.";
    credit.hidden = !reward.credited;
    coinButton.hidden = !reward.isCoin;
    modal.hidden = false;
    wheelSoundCue(reward.isLarge ? "jackpot" : "reward", { rewardType: reward.type });
    requestAnimationFrame(() => modal.classList.add("is-open"));
}

function showWheelCoinOrderPreview() {
    if (!wheelActiveReward?.isCoin) return;
    closeWheelResult();
    setTimeout(() => openWheelCoinWizard(wheelActiveReward), 230);
}

function createWheelWizardState(reward) {
    return {
        step: 1,
        reward,
        email: "",
        password: "",
        region: WHEEL_COIN_REGIONS[0],
        platform: WHEEL_COIN_PLATFORMS[0],
    };
}

function openWheelCoinWizard(reward) {
    wheelCoinWizard = createWheelWizardState(reward);
    const modal = document.getElementById("wheelCoinWizard");
    if (!modal) return;
    modal.hidden = false;
    renderWheelWizardStep();
    requestAnimationFrame(() => modal.classList.add("is-open"));
}

function wheelWizardStepMarkup(state) {
    if (state.step === 1) return `<label class="wheel-wizard-field">
        <span>MyKonami Login</span><small>Coin tushiriladigan akkaunt emailingiz</small>
        <input id="wheelCoinEmail" type="email" inputmode="email" autocomplete="username" placeholder="name@example.com" value="${escapeWheelAttribute(state.email)}">
    </label>`;
    if (state.step === 2) return `<label class="wheel-wizard-field">
        <span>MyKonami Password</span><small>Faqat buyurtmani yuborishda ishlatiladi</small>
        <div class="wheel-password-wrap"><input id="wheelCoinPassword" type="password" autocomplete="current-password" placeholder="Parolingiz"><button type="button" onclick="toggleWheelPassword()">Ko‘rsatish</button></div>
    </label>`;
    if (state.step === 3) return `<fieldset class="wheel-wizard-options"><legend>Regionni tanlang</legend>
        ${WHEEL_COIN_REGIONS.map((region) => `<button type="button" class="${state.region === region ? "is-selected" : ""}" onclick="selectWheelWizardOption('region','${region}')"><i>${region === "Japan" ? "🇯🇵" : "🌍"}</i><b>${region}</b><small>${region === "Japan" ? "Japan akkauntlari" : "Xalqaro akkauntlar"}</small></button>`).join("")}
    </fieldset>`;
    return `<fieldset class="wheel-wizard-options"><legend>Platformani tanlang</legend>
        ${WHEEL_COIN_PLATFORMS.map((platform) => `<button type="button" class="${state.platform === platform ? "is-selected" : ""}" onclick="selectWheelWizardOption('platform','${platform}')"><i>${platform === "iOS" ? "" : "◉"}</i><b>${platform}</b><small>${platform === "iOS" ? "iPhone va iPad" : "Android qurilmalar"}</small></button>`).join("")}
        <div class="wheel-wizard-review"><span>🎁 Reward <b>${state.reward.label}</b></span><span>Email <b>${escapeWheelText(state.email)}</b></span><span>Region <b>${state.region}</b></span><span>Platform <b>${state.platform}</b></span></div>
    </fieldset>`;
}

function renderWheelWizardStep() {
    if (!wheelCoinWizard) return;
    const { step } = wheelCoinWizard;
    document.getElementById("wheelWizardBody").innerHTML = wheelWizardStepMarkup(wheelCoinWizard);
    document.getElementById("wheelWizardStepLabel").textContent = `${step}/4`;
    document.getElementById("wheelWizardProgress").style.width = `${step * 25}%`;
    document.getElementById("wheelWizardError").textContent = "";
    const next = document.getElementById("wheelWizardNext");
    next.textContent = step === 4 ? "Tasdiqlash" : "Davom etish";
    next.disabled = false;
    document.querySelector("[data-wheel-wizard-back]").disabled = step === 1;
    setTimeout(() => document.querySelector("#wheelWizardBody input")?.focus(), 80);
}

function validateWheelWizardStep(state, value = "") {
    if (state.step === 1) {
        const email = String(value).trim();
        if (!email) return "MyKonami emailingizni kiriting.";
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Email formatini tekshiring.";
    }
    if (state.step === 2 && !String(value)) return "MyKonami parolingizni kiriting.";
    if (state.step === 3 && !WHEEL_COIN_REGIONS.includes(state.region)) return "Regionni tanlang.";
    if (state.step === 4 && !state.password) return "Parolni qayta kiriting.";
    if (state.step === 4 && !WHEEL_COIN_PLATFORMS.includes(state.platform)) return "Platformani tanlang.";
    return "";
}

async function submitWheelWizardStep(event) {
    event.preventDefault();
    if (!wheelCoinWizard || wheelCoinSubmitting) return;
    const value = wheelCoinWizard.step === 1
        ? document.getElementById("wheelCoinEmail")?.value
        : wheelCoinWizard.step === 2 ? document.getElementById("wheelCoinPassword")?.value : "";
    const error = validateWheelWizardStep(wheelCoinWizard, value);
    if (error) {
        document.getElementById("wheelWizardError").textContent = error;
        return;
    }
    if (wheelCoinWizard.step === 1) wheelCoinWizard.email = String(value).trim();
    if (wheelCoinWizard.step === 2) wheelCoinWizard.password = String(value);
    if (wheelCoinWizard.step < 4) {
        wheelCoinWizard.step += 1;
        renderWheelWizardStep();
        return;
    }
    await submitWheelCoinOrder();
}

function previousWheelWizardStep() {
    if (!wheelCoinWizard || wheelCoinSubmitting || wheelCoinWizard.step <= 1) return;
    const passwordWasSet = Boolean(wheelCoinWizard.password);
    wheelCoinWizard.password = "";
    wheelCoinWizard.step = passwordWasSet ? Math.min(wheelCoinWizard.step - 1, 2) : wheelCoinWizard.step - 1;
    renderWheelWizardStep();
}

function selectWheelWizardOption(field, value) {
    if (!wheelCoinWizard || wheelCoinSubmitting) return;
    if (field === "region" && WHEEL_COIN_REGIONS.includes(value)) wheelCoinWizard.region = value;
    if (field === "platform" && WHEEL_COIN_PLATFORMS.includes(value)) wheelCoinWizard.platform = value;
    renderWheelWizardStep();
}

function toggleWheelPassword() {
    const input = document.getElementById("wheelCoinPassword");
    if (!input) return;
    input.type = input.type === "password" ? "text" : "password";
    input.nextElementSibling.textContent = input.type === "password" ? "Ko‘rsatish" : "Yashirish";
}

async function findWheelCoinProduct(amount) {
    const result = await getProducts();
    const list = Array.isArray(result?.data) ? result.data : Array.isArray(result) ? result : [];
    return list.find((product) => Number(product.coin_amount) === Number(amount)) || null;
}

async function submitWheelCoinOrder() {
    const state = wheelCoinWizard;
    if (!state || wheelCoinSubmitting) return;
    const button = document.getElementById("wheelWizardNext");
    const errorNode = document.getElementById("wheelWizardError");
    wheelCoinSubmitting = true;
    button.disabled = true;
    button.classList.add("is-loading");
    button.textContent = "Yuborilmoqda…";

    try {
        const product = await findWheelCoinProduct(state.reward.amount);
        if (!product) throw new Error(`${state.reward.label} mahsuloti hozir mavjud emas.`);
        const password = state.password;
        state.password = "";
        const result = await createCoinRewardOrder({
            productId: product.id,
            email: state.email,
            password,
            region: state.region,
            platform: state.platform,
        });
        if (!result || result.success === false) throw new Error(result?.message || "Coin buyurtmasi yaratilmadi.");
        renderWheelCoinSuccess(result.data || result);
    } catch (error) {
        state.password = "";
        state.step = 2;
        renderWheelWizardStep();
        document.getElementById("wheelWizardError").textContent = error?.message || "Buyurtmani yaratib bo‘lmadi. Parolni qayta kiritib, yana urinib ko‘ring.";
    } finally {
        wheelCoinSubmitting = false;
    }
}

function renderWheelCoinSuccess(order) {
    const body = document.getElementById("wheelWizardBody");
    document.getElementById("wheelWizardStepLabel").textContent = "TAYYOR";
    document.getElementById("wheelWizardProgress").style.width = "100%";
    document.getElementById("wheelWizardError").textContent = "";
    body.innerHTML = `<div class="wheel-wizard-success"><i>🎉</i><h4>Coin buyurtmangiz yaratildi.</h4><p>Status: <b>${escapeWheelText(order.status || "PENDING")}</b></p><small>Orders bo‘limidan kuzatishingiz mumkin.</small></div>`;
    const button = document.getElementById("wheelWizardNext");
    button.classList.remove("is-loading");
    button.disabled = false;
    button.type = "button";
    button.textContent = "Yopish";
    button.onclick = closeWheelCoinWizard;
    wheelCoinWizard.password = "";
}

function closeWheelCoinWizard() {
    const modal = document.getElementById("wheelCoinWizard");
    if (!modal || wheelCoinSubmitting) return;
    if (wheelCoinWizard) wheelCoinWizard.password = "";
    wheelCoinWizard = null;
    modal.classList.remove("is-open");
    setTimeout(() => { modal.hidden = true; }, 220);
}

function escapeWheelText(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function escapeWheelAttribute(value) {
    return escapeWheelText(value);
}

function closeWheelResult() {
    const modal = document.getElementById("wheelResultModal");
    if (!modal) return;
    modal.classList.remove("is-open");
    setTimeout(() => { modal.hidden = true; }, 220);
}

async function spinAdWheel() {
    await spinFreeWheel();
}

async function refreshWheel() {
    await loadWheelStatus();
}

if (typeof module !== "undefined") {
    module.exports = {
        WHEEL_PRIZES,
        wheelStatusValue,
        wheelStatusFlag,
        wheelHasStatusField,
        wheelTimestamp,
        wheelCooldownState,
        formatWheelCountdown,
        wheelNextSpinHint,
        wheelExpiredRefreshKey,
        normalizeWheelDegrees,
        wheelFinalRotationForSector,
        wheelSectorIndexFromRotation,
        wheelTargetRotation,
        setWheelRotation,
        beginWheelVisualSpin,
        settleWheelVisualSpin,
        normalizeWheelReward,
        wheelSectorIndexForReward,
        wheelSpinType,
        normalizeWheelLastWin,
        wheelRelativeTime,
        wheelSoundCue,
        createWheelWizardState,
        validateWheelWizardStep,
        wheelWizardStepMarkup,
        wheelSectorSvgMarkup,
        wheelDiscMarkup,
        wheelPageMarkup,
    };
}
