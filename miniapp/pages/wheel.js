const WHEEL_PRIZES = [
    { label: "5 EFC", tone: "#7c3aed" },
    { label: "10 EFC", tone: "#db2777" },
    { label: "20 EFC", tone: "#dc2626" },
    { label: "Yana spin", tone: "#ea580c" },
    { label: "50 EFC", tone: "#ca8a04" },
    { label: "Omad", tone: "#059669" },
    { label: "100 EFC", tone: "#0284c7" },
    { label: "25 EFC", tone: "#4f46e5" },
];

const WHEEL_DEMO_REWARDS = [
    { type: "NONE", amount: 0 },
    { type: "EFC", amount: 50 },
    { type: "EFC", amount: 100 },
    { type: "UZS", amount: 500 },
    { type: "EFC", amount: 250 },
    { type: "EFC", amount: 500 },
    { type: "UZS", amount: 1000 },
    { type: "UZS", amount: 5000 },
    { type: "COIN", amount: 130 },
    { type: "COIN", amount: 2000 },
];

let wheelData = null;
let wheelRotation = 0;
let wheelSpinning = false;
let wheelResultTimer = null;

function wheelStatusValue(source, keys, fallback = 0) {
    for (const key of keys) {
        if (source?.[key] !== undefined && source?.[key] !== null) return source[key];
    }
    return fallback;
}

function wheelTargetRotation(index, currentRotation = 0, turns = 6, sectors = WHEEL_PRIZES.length) {
    const safeIndex = Math.max(0, Math.min(sectors - 1, Number(index) || 0));
    const sectorAngle = 360 / sectors;
    const targetAtPointer = 360 - (safeIndex * sectorAngle + sectorAngle / 2);
    const completedTurns = Math.floor(currentRotation / 360) * 360;
    let target = completedTurns + turns * 360 + targetAtPointer;
    while (target <= currentRotation) target += 360;
    return target;
}

function normalizeWheelReward(payload) {
    const source = payload?.data?.reward || payload?.reward || payload?.data || payload || {};
    const rawType = String(source.reward_type || source.currency || source.type || "NONE").toUpperCase();
    const aliases = { EFC_BALANCE: "EFC", UZS_BALANCE: "UZS", COINS: "COIN" };
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

function wheelPrizeMarkup() {
    return WHEEL_PRIZES.map((prize, index) => {
        const angle = index * (360 / WHEEL_PRIZES.length) + 360 / WHEEL_PRIZES.length / 2;
        return `<span class="wheel-prize" style="--prize-angle:${angle}deg"><b>${prize.label}</b></span>`;
    }).join("");
}

function wheelPageMarkup() {
    const gradient = WHEEL_PRIZES.map((prize, index) => {
        const start = index * (360 / WHEEL_PRIZES.length);
        const end = (index + 1) * (360 / WHEEL_PRIZES.length);
        return `${prize.tone} ${start}deg ${end}deg`;
    }).join(",");

    return `
        <div class="premium-wheel" style="--wheel-gradient:conic-gradient(from -22.5deg,${gradient})">
            <header class="wheel-hero">
                <span class="wheel-kicker">LEVEL BONUS</span>
                <h2>Omad g‘ildiragi</h2>
                <p>Bugungi imkoniyatingizni aylantiring va sovrinni qo‘lga kiriting.</p>
            </header>

            <section class="wheel-stage" aria-label="Omad g‘ildiragi">
                <div class="wheel-aura"></div>
                <div class="wheel-pointer" aria-hidden="true"><i></i></div>
                <div id="premiumWheelDisc" class="premium-wheel-disc">
                    <div class="wheel-sectors">${wheelPrizeMarkup()}</div>
                    <div class="wheel-hub"><span>LG</span><small>WHEEL</small></div>
                </div>
            </section>

            <div id="wheelStatusRegion" class="wheel-status-region" aria-live="polite">
                ${wheelSkeletonMarkup()}
            </div>

            <button id="wheelSpinButton" class="wheel-spin-button" type="button" disabled>
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
            <section id="wheelResultCard" class="wheel-result-card" role="dialog" aria-modal="true" aria-labelledby="wheelResultTitle">
                <div id="wheelResultIcon" class="wheel-result-burst">🎉</div>
                <span id="wheelResultKicker">OMAD SIZ TOMONDA</span>
                <h3 id="wheelResultTitle">Tabriklaymiz!</h3>
                <p id="wheelResultMessage">Siz <strong id="wheelResultPrize">—</strong> yutdingiz.</p>
                <small id="wheelRewardCredit" class="wheel-reward-credit">Balansingizga avtomatik qo‘shildi.</small>
                <button id="wheelCoinOrderButton" class="wheel-coin-order" type="button" hidden>🏆 Coin buyurtmasini rasmiylashtirish</button>
                <button class="wheel-result-continue" type="button" data-wheel-close>Davom etish</button>
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
}

async function loadWheelStatus() {
    const region = document.getElementById("wheelStatusRegion");
    const button = document.getElementById("wheelSpinButton");
    if (!region || !button) return;

    region.innerHTML = wheelSkeletonMarkup();
    button.disabled = true;

    try {
        const result = await getWheelStatus();
        if (!result || result.success === false) throw new Error("Wheel status unavailable");
        wheelData = result.data || result;
        renderWheelInfo();
    } catch (error) {
        console.error(error);
        region.innerHTML = `<div class="wheel-state-card wheel-error-state">
            <span>!</span><strong>Wheel ma’lumotlari yuklanmadi</strong>
            <small>Internet aloqasini tekshirib, qayta urinib ko‘ring.</small>
            <button type="button" onclick="loadWheelStatus()">Qayta urinish</button>
        </div>`;
        button.disabled = true;
        document.getElementById("wheelSpinHint").textContent = "Hozircha mavjud emas";
    }
}

function renderWheelInfo() {
    const region = document.getElementById("wheelStatusRegion");
    const button = document.getElementById("wheelSpinButton");
    if (!region || !button) return;

    const freeSpins = Number(wheelStatusValue(wheelData, ["free_spins", "daily_free_spins"]));
    const adSpins = Number(wheelStatusValue(wheelData, ["ad_spins", "rewarded_spins"]));
    const remaining = Number(wheelStatusValue(wheelData, ["remaining_spins", "spins_left"], freeSpins + adSpins));
    const lastPrize = wheelStatusValue(wheelData, ["last_prize", "last_reward", "last_win"], "Hali yo‘q");

    region.innerHTML = `<div class="wheel-stats">
        <article><i>☀</i><span>Bugungi bepul spin</span><b>${freeSpins}</b></article>
        <article><i>▶</i><span>Reklama orqali</span><b>${adSpins}</b></article>
        <article><i>✦</i><span>Qolgan spinlar</span><b>${remaining}</b></article>
        <article><i>🏆</i><span>Oxirgi yutuq</span><b>${String(lastPrize)}</b></article>
    </div>`;

    button.disabled = wheelSpinning;
    document.getElementById("wheelSpinHint").textContent = "Demo spin";
}

async function spinFreeWheel() {
    if (wheelSpinning) return;
    const disc = document.getElementById("premiumWheelDisc");
    const button = document.getElementById("wheelSpinButton");
    if (!disc || !button) return;

    wheelSpinning = true;
    button.disabled = true;
    button.classList.add("is-loading");
    button.querySelector("b").textContent = "Aylanmoqda";
    document.getElementById("wheelSpinHint").textContent = "Natija aniqlanmoqda";

    const resultIndex = Math.floor(Math.random() * WHEEL_PRIZES.length);
    const turns = 4 + Math.floor(Math.random() * 5);
    wheelRotation = wheelTargetRotation(resultIndex, wheelRotation, turns);
    disc.style.setProperty("--wheel-rotation", `${wheelRotation}deg`);
    disc.classList.add("is-spinning");

    const reducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    clearTimeout(wheelResultTimer);
    wheelResultTimer = setTimeout(() => {
        const demoReward = WHEEL_DEMO_REWARDS[Math.floor(Math.random() * WHEEL_DEMO_REWARDS.length)];
        finishWheelSpin(resultIndex, demoReward);
    }, reducedMotion ? 120 : 4600);
}

function finishWheelSpin(resultIndex, backendResult) {
    const disc = document.getElementById("premiumWheelDisc");
    const button = document.getElementById("wheelSpinButton");
    wheelSpinning = false;
    disc?.classList.remove("is-spinning");
    if (button) {
        button.disabled = false;
        button.classList.remove("is-loading");
        button.querySelector("b").textContent = "Yana aylantirish";
    }
    const hint = document.getElementById("wheelSpinHint");
    if (hint) hint.textContent = "Demo spin";
    openWheelResult(backendResult || { type: "EFC", amount: Number.parseFloat(WHEEL_PRIZES[resultIndex]?.label) || 0 });
}

function openWheelResult(backendResult) {
    const modal = document.getElementById("wheelResultModal");
    const prizeNode = document.getElementById("wheelResultPrize");
    if (!modal || !prizeNode) return;
    const reward = normalizeWheelReward(backendResult);
    const card = document.getElementById("wheelResultCard");
    const coinButton = document.getElementById("wheelCoinOrderButton");
    const credit = document.getElementById("wheelRewardCredit");
    const title = document.getElementById("wheelResultTitle");
    const message = document.getElementById("wheelResultMessage");

    modal.classList.toggle("is-large-reward", reward.isLarge);
    modal.classList.toggle("is-empty-reward", reward.empty);
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
    requestAnimationFrame(() => modal.classList.add("is-open"));
}

function showWheelCoinOrderPreview() {
    tg.showPopup({
        title: "Coin buyurtmasi",
        message: "Coin buyurtmasini rasmiylashtirish keyingi sprintda ishga tushadi.",
        buttons: [{ type: "ok", text: "Tushunarli" }],
    });
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
        WHEEL_DEMO_REWARDS,
        wheelStatusValue,
        wheelTargetRotation,
        normalizeWheelReward,
        wheelPageMarkup,
    };
}
