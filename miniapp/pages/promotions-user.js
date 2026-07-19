const promotionsUserApi = new PromotionsUserApi({ baseUrl: API_URL, initDataProvider: () => telegramInitData() });
const promotionsUserState = { items: [], index: 0, offline: false, loading: false, viewed: new Set(), slideTimer: null, countdownTimer: null, refreshTimer: null };
const promotionsEscape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));

function promotionImage(item, className = "") {
    const url = /^https:\/\//i.test(item.banner_url || "") ? promotionsEscape(item.banner_url) : "";
    return url ? `<img class="${className}" src="${url}" alt="" loading="lazy">` : `<div class="pux-placeholder ${className}"><span>LEVEL</span><b>GROUP</b></div>`;
}

function promotionsHomeMarkup() {
    if (promotionsUserState.loading && !promotionsUserState.items.length) return `<div class="pux-carousel pux-skeleton" aria-label="Promotions yuklanmoqda"></div>`;
    if (!promotionsUserState.items.length) return "";
    const slides = promotionsUserState.items.map((item, index) => `<article class="pux-slide ${index === promotionsUserState.index ? "is-active" : ""}" data-promotion-id="${item.id}" data-slide="${index}">
        ${promotionImage(item)}<div class="pux-shade"></div><div class="pux-slide-copy">${item.badge ? `<em>${promotionsEscape(item.badge)}</em>` : ""}<h3>${promotionsEscape(item.title)}</h3><p>${promotionsEscape(item.subtitle || "")}</p><button type="button" data-open-promotions>Ko‘rish <i>›</i></button></div>
    </article>`).join("");
    const dots = promotionsUserState.items.map((_, index) => `<button type="button" data-carousel-index="${index}" class="${index === promotionsUserState.index ? "is-active" : ""}" aria-label="${index + 1}-banner"></button>`).join("");
    return `<div class="pux-carousel" id="promotionsCarousel"><div class="pux-slides">${slides}</div><div class="pux-dots">${dots}</div></div>`;
}

function renderPromotionsHome() {
    const root = document.getElementById("homePromotions");
    if (!root) return;
    root.innerHTML = promotionsHomeMarkup(); bindPromotionsHome(); scheduleCarousel();
    const active = promotionsUserState.items[promotionsUserState.index]; if (active) trackPromotionView(active.id, "home");
}

function movePromotionSlide(index) {
    const length = promotionsUserState.items.length; if (!length) return;
    promotionsUserState.index = (index + length) % length; renderPromotionsHome();
}

function bindPromotionsHome() {
    const carousel = document.getElementById("promotionsCarousel"); if (!carousel) return;
    carousel.querySelectorAll("[data-carousel-index]").forEach((button) => button.onclick = () => movePromotionSlide(Number(button.dataset.carouselIndex)));
    carousel.querySelector("[data-open-promotions]")?.addEventListener("click", () => openPage("promotions"));
    let startX = 0;
    carousel.addEventListener("touchstart", (event) => { startX = event.touches[0].clientX; }, { passive: true });
    carousel.addEventListener("touchend", (event) => { const delta = event.changedTouches[0].clientX - startX; if (Math.abs(delta) > 42) movePromotionSlide(promotionsUserState.index + (delta < 0 ? 1 : -1)); }, { passive: true });
}

function scheduleCarousel() {
    clearInterval(promotionsUserState.slideTimer);
    if (promotionsUserState.items.length > 1 && !matchMedia("(prefers-reduced-motion: reduce)").matches) promotionsUserState.slideTimer = setInterval(() => movePromotionSlide(promotionsUserState.index + 1), 5000);
}

function promotionCard(item) {
    const action = PromotionsUserCore.resolveAction(item);
    return `<article class="pux-card" data-promotion-id="${item.id}">${promotionImage(item, "pux-card-image")}<div class="pux-shade"></div>
        <div class="pux-card-copy">${item.badge ? `<em>${promotionsEscape(item.badge)}</em>` : ""}<h2>${promotionsEscape(item.title)}</h2><h3>${promotionsEscape(item.subtitle || "")}</h3><p>${promotionsEscape(item.description || "")}</p>
        <div class="pux-countdown" data-end-at="${promotionsEscape(item.end_at || "")}"><span>⏱</span><b>${PromotionsUserCore.countdown(item.end_at)}</b></div>
        ${action.type !== "none" ? `<button type="button" data-promotion-action="${item.id}">${promotionsEscape(item.button_text || "Batafsil")} <i>›</i></button>` : ""}</div></article>`;
}

function renderPromotionsPage() {
    const page = document.getElementById("promotionsPage"); if (!page) return;
    if (promotionsUserState.loading && !promotionsUserState.items.length) page.innerHTML = `<div class="pux-page-head"><small>LEVEL_GROUP</small><h2>Maxsus takliflar</h2></div>${"<div class=\"pux-card pux-skeleton\"></div>".repeat(3)}`;
    else if (!promotionsUserState.items.length) page.innerHTML = `<div class="pux-empty"><span>◇</span><h2>Yangi takliflar tayyorlanmoqda</h2><p>Premium aksiyalar tez orada shu yerda paydo bo‘ladi.</p>${promotionsUserState.offline ? `<button type="button" data-promotions-retry>Qayta urinish</button>` : ""}</div>`;
    else page.innerHTML = `<div class="pux-page-head"><small>LEVEL_GROUP • PROMOTIONS</small><h2>Maxsus takliflar</h2><p>${promotionsUserState.offline ? "Offline cache ko‘rsatilmoqda" : "Siz uchun tanlangan premium imkoniyatlar"}</p></div><div class="pux-list">${promotionsUserState.items.map(promotionCard).join("")}</div>`;
    bindPromotionsPage(); updatePromotionCountdowns(); observePromotionCards();
}

function bindPromotionsPage() {
    document.querySelector("[data-promotions-retry]")?.addEventListener("click", () => loadUserPromotions(true));
    document.querySelectorAll("[data-promotion-action]").forEach((button) => button.onclick = () => activatePromotion(Number(button.dataset.promotionAction)));
}

async function activatePromotion(id) {
    const item = promotionsUserState.items.find((value) => value.id === id); if (!item) return;
    const action = PromotionsUserCore.resolveAction(item);
    await promotionsUserApi.click(id).catch(() => {});
    if (action.type === "page") await openPage(action.target);
    else if (action.type === "url") {
        if (globalThis.Telegram?.WebApp?.openLink) globalThis.Telegram.WebApp.openLink(action.target);
        else window.open(action.target, "_blank", "noopener");
    }
}

function trackPromotionView(id, surface = "page") {
    const key = `${surface}:${id}`;
    if (promotionsUserState.viewed.has(key)) return;
    promotionsUserState.viewed.add(key); promotionsUserApi.view(id).catch(() => promotionsUserState.viewed.delete(key));
}

function observePromotionCards() {
    if (!("IntersectionObserver" in window)) return document.querySelectorAll(".pux-card[data-promotion-id]").forEach((card) => trackPromotionView(Number(card.dataset.promotionId)));
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => { if (entry.isIntersecting && entry.intersectionRatio >= .55) { trackPromotionView(Number(entry.target.dataset.promotionId)); observer.unobserve(entry.target); } }), { threshold: .55 });
    document.querySelectorAll(".pux-card[data-promotion-id]").forEach((card) => observer.observe(card));
}

function updatePromotionCountdowns() {
    let expired = false;
    document.querySelectorAll("[data-end-at]").forEach((node) => { const value = PromotionsUserCore.remaining(node.dataset.endAt); node.querySelector("b").textContent = PromotionsUserCore.countdown(node.dataset.endAt); if (value?.expired) expired = true; });
    if (expired) { promotionsUserState.items = PromotionsUserCore.normalize(promotionsUserState.items); renderPromotionsPage(); renderPromotionsHome(); }
}

async function loadUserPromotions(force = false) {
    if (promotionsUserState.loading) return;
    promotionsUserState.loading = true;
    if (!promotionsUserState.items.length) promotionsUserState.items = PromotionsUserCore.load(localStorage);
    renderPromotionsHome(); if (document.getElementById("promotionsPage")?.classList.contains("active-page")) renderPromotionsPage();
    try { promotionsUserState.items = PromotionsUserCore.normalize(await promotionsUserApi.active()); promotionsUserState.offline = false; PromotionsUserCore.save(localStorage, promotionsUserState.items); }
    catch (_error) { promotionsUserState.offline = true; if (!promotionsUserState.items.length && force) promotionsUserState.items = []; }
    finally { promotionsUserState.loading = false; promotionsUserState.index = Math.min(promotionsUserState.index, Math.max(0, promotionsUserState.items.length - 1)); renderPromotionsHome(); if (document.getElementById("promotionsPage")?.classList.contains("active-page")) renderPromotionsPage(); }
}

async function loadPromotionsPage() {
    Navbar.setActive(""); showPage("promotionsPage", "Promotions"); renderPromotionsPage(); await loadUserPromotions();
    clearInterval(promotionsUserState.countdownTimer); promotionsUserState.countdownTimer = setInterval(updatePromotionCountdowns, 1000);
}

function startPromotionsAutoRefresh() {
    clearInterval(promotionsUserState.refreshTimer); promotionsUserState.refreshTimer = setInterval(() => loadUserPromotions(), 30000);
}
