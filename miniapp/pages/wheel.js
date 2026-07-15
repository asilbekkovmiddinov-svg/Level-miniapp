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
            <section class="wheel-result-card" role="dialog" aria-modal="true" aria-labelledby="wheelResultTitle">
                <div class="wheel-result-burst">🎉</div>
                <span>OMAD SIZ TOMONDA</span>
                <h3 id="wheelResultTitle">Tabriklaymiz!</h3>
                <p>Siz <strong id="wheelResultPrize">—</strong> yutdingiz.</p>
                <button type="button" data-wheel-close>OK</button>
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
    wheelResultTimer = setTimeout(() => finishWheelSpin(resultIndex), reducedMotion ? 120 : 4600);
}

function finishWheelSpin(resultIndex) {
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
    openWheelResult(WHEEL_PRIZES[resultIndex]?.label || "sovrin");
}

function openWheelResult(prize) {
    const modal = document.getElementById("wheelResultModal");
    const prizeNode = document.getElementById("wheelResultPrize");
    if (!modal || !prizeNode) return;
    prizeNode.textContent = prize;
    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add("is-open"));
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
    module.exports = { WHEEL_PRIZES, wheelStatusValue, wheelTargetRotation, wheelPageMarkup };
}
