const notificationsApi = new NotificationsApi({ baseUrl: API_URL, initDataProvider: () => telegramInitData() });
const notificationsState = { items: [], filter: "ALL", search: "", loading: false, offline: false, error: null, refreshTimer: null };
const notificationEscape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));

function notificationTime(value) {
    const date = new Date(value); if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("uz-UZ", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

function renderNotificationBadge(count = NotificationsCore.unreadCount(notificationsState.items)) {
    const badge = document.getElementById("notificationBellBadge"); if (!badge) return;
    const value = Math.max(0, Number(count) || 0); badge.textContent = value > 99 ? "99+" : String(value);
    badge.hidden = value === 0; badge.setAttribute("aria-label", `${value} ta o‘qilmagan bildirishnoma`);
}

function notificationCard(item) {
    const e = notificationEscape; const unread = item.status === "UNREAD";
    const image = /^https:\/\//i.test(item.image_url || "") ? `<img src="${e(item.image_url)}" alt="" loading="lazy">` : "";
    return `<article class="nfc-card ${unread ? "is-unread" : ""}" data-notification-id="${item.id}"><div class="nfc-swipe-bg">O‘chirish</div><div class="nfc-card-surface">
        ${image ? `<div class="nfc-banner">${image}</div>` : ""}<div class="nfc-body"><span class="nfc-icon">${NotificationsCore.icon(item.button_action)}</span><div class="nfc-copy"><div class="nfc-title-row"><h3>${e(item.title)}</h3>${item.badge ? `<em>${e(item.badge)}</em>` : ""}</div><p>${e(item.message)}</p><footer><time>${notificationTime(item.created_at)}</time><span>${unread ? "● O‘qilmagan" : item.status === "CLICKED" ? "✓ Bosilgan" : "✓ O‘qilgan"}</span></footer></div></div>
        <div class="nfc-actions"><button type="button" data-notification-open="${item.id}">${unread ? "O‘qish" : "Ochish"}</button><button type="button" data-notification-action="${item.id}">Batafsil ›</button><button class="danger" type="button" data-notification-dismiss="${item.id}" aria-label="O‘chirish">⌫</button></div>
    </div></article>`;
}

function notificationSkeleton() { return `<div class="nfc-page-head"><div class="nfc-skeleton line"></div><div class="nfc-skeleton title"></div></div>${"<div class=\"nfc-skeleton card\"></div>".repeat(4)}`; }

function renderNotificationsPage() {
    const page = document.getElementById("notificationsPage"); if (!page) return;
    if (notificationsState.loading && !notificationsState.items.length) { page.innerHTML = notificationSkeleton(); return; }
    if (notificationsState.error && !notificationsState.items.length) {
        const status = Number(notificationsState.error.status || 0); const title = status === 401 ? "Login required." : status === 403 ? "Permission denied." : "Bildirishnomalar yuklanmadi";
        page.innerHTML = `<div class="nfc-empty error"><span>!</span><h2>${title}</h2><p>${status === 401 ? "MiniApp’ni Telegram ichidan qayta oching." : status === 403 ? "Bu bildirishnomani ko‘rishga ruxsat yo‘q." : "Internet yoki server holatini tekshiring."}</p><button type="button" data-notifications-retry>Qayta urinish</button></div>`;
        bindNotificationsPage(); return;
    }
    const visible = NotificationsCore.visible(notificationsState.items, notificationsState);
    page.innerHTML = `<div id="notificationPull" class="nfc-pull">↓ Yangilash uchun torting</div><header class="nfc-page-head"><div><small>LEVEL_GROUP • INBOX</small><h2>Bildirishnomalar</h2><p>${notificationsState.offline ? "Offline cache ko‘rsatilmoqda" : "Muhim yangiliklar bir joyda"}</p></div><button type="button" id="notificationsReadAll" ${NotificationsCore.unreadCount(notificationsState.items) ? "" : "disabled"}>✓ Barchasini o‘qish</button></header>
        <section class="nfc-toolbar"><label><span>⌕</span><input id="notificationsSearch" type="search" value="${notificationEscape(notificationsState.search)}" placeholder="Title yoki message..."></label><div>${NotificationsCore.STATUSES.map((status) => `<button type="button" data-notification-filter="${status}" class="${notificationsState.filter === status ? "is-active" : ""}">${status}</button>`).join("")}</div></section>
        <section id="notificationsList" class="nfc-list">${visible.length ? visible.map(notificationCard).join("") : `<div class="nfc-empty"><span>◇</span><h2>Hozircha bildirishnomalar yo‘q.</h2><p>${notificationsState.search || notificationsState.filter !== "ALL" ? "Qidiruv yoki filter shartlarini o‘zgartiring." : "Yangi xabarlar kelganda shu yerda ko‘rinadi."}</p></div>`}</section>`;
    bindNotificationsPage();
}

function bindNotificationsPage() {
    document.querySelector("[data-notifications-retry]")?.addEventListener("click", () => refreshNotifications(true));
    document.getElementById("notificationsSearch")?.addEventListener("input", (event) => { notificationsState.search = event.target.value; renderNotificationsPage(); document.getElementById("notificationsSearch")?.focus(); });
    document.querySelectorAll("[data-notification-filter]").forEach((button) => button.onclick = () => { notificationsState.filter = button.dataset.notificationFilter; renderNotificationsPage(); });
    document.getElementById("notificationsReadAll")?.addEventListener("click", markAllNotificationsRead);
    document.querySelectorAll("[data-notification-open]").forEach((button) => button.onclick = () => markNotificationRead(Number(button.dataset.notificationOpen)));
    document.querySelectorAll("[data-notification-action]").forEach((button) => button.onclick = () => activateNotification(Number(button.dataset.notificationAction)));
    document.querySelectorAll("[data-notification-dismiss]").forEach((button) => button.onclick = () => dismissNotification(Number(button.dataset.notificationDismiss)));
    bindNotificationSwipes(); bindNotificationPull();
}

function bindNotificationSwipes() {
    document.querySelectorAll(".nfc-card").forEach((card) => {
        const surface = card.querySelector(".nfc-card-surface"); let startX = 0; let delta = 0;
        card.addEventListener("touchstart", (event) => { startX = event.touches[0].clientX; delta = 0; }, { passive: true });
        card.addEventListener("touchmove", (event) => { delta = Math.min(0, event.touches[0].clientX - startX); surface.style.transform = `translateX(${Math.max(-105, delta)}px)`; }, { passive: true });
        card.addEventListener("touchend", () => { if (delta < -85) dismissNotification(Number(card.dataset.notificationId)); else surface.style.transform = ""; }, { passive: true });
    });
}

function bindNotificationPull() {
    const page = document.getElementById("notificationsPage"); const pull = document.getElementById("notificationPull"); if (!page || !pull) return;
    let startY = 0; let distance = 0;
    page.addEventListener("touchstart", (event) => { if (document.getElementById("pageContent")?.scrollTop <= 0) startY = event.touches[0].clientY; }, { passive: true });
    page.addEventListener("touchmove", (event) => { if (!startY) return; distance = Math.max(0, Math.min(80, event.touches[0].clientY - startY)); pull.style.height = `${distance}px`; pull.classList.toggle("is-ready", distance > 55); }, { passive: true });
    page.addEventListener("touchend", () => { pull.style.height = "0"; if (distance > 55) refreshNotifications(true); startY = distance = 0; }, { passive: true });
}

function replaceNotification(updated) {
    notificationsState.items = notificationsState.items.map((item) => item.id === Number(updated.id) ? updated : item);
    NotificationsCore.save(localStorage, notificationsState.items); renderNotificationBadge(); renderNotificationsPage();
}

async function markNotificationRead(id) { try { replaceNotification(await notificationsApi.read(id)); } catch (error) { notificationToast(error.message, "error"); } }
async function markAllNotificationsRead() { try { await notificationsApi.readAll(); await refreshNotifications(true); notificationToast("Barcha bildirishnomalar o‘qildi."); } catch (error) { notificationToast(error.message, "error"); } }
async function dismissNotification(id) { try { await notificationsApi.dismiss(id); notificationsState.items = notificationsState.items.filter((item) => item.id !== id); NotificationsCore.save(localStorage, notificationsState.items); renderNotificationBadge(); renderNotificationsPage(); } catch (error) { notificationToast(error.message, "error"); } }

async function activateNotification(id) {
    const item = notificationsState.items.find((value) => value.id === id); if (!item) return;
    try { replaceNotification(await notificationsApi.click(id)); } catch (error) { notificationToast(error.message, "error"); return; }
    if (item.promotion_id) { await openPage("promotions"); const card = document.querySelector(`.pux-card[data-promotion-id="${item.promotion_id}"]`); card?.scrollIntoView({ behavior: "smooth", block: "center" }); card?.classList.add("is-notification-target"); return; }
    const action = PromotionsUserCore.resolveAction(item);
    if (action.type === "page") await openPage(action.target);
    else if (action.type === "url") { if (globalThis.Telegram?.WebApp?.openLink) globalThis.Telegram.WebApp.openLink(action.target); else window.open(action.target, "_blank", "noopener"); }
}

async function refreshNotifications(force = false) {
    if (notificationsState.loading) return;
    notificationsState.loading = true; notificationsState.error = null;
    if (!notificationsState.items.length) notificationsState.items = NotificationsCore.load(localStorage);
    if (force || document.getElementById("notificationsPage")?.classList.contains("active-page")) renderNotificationsPage();
    try {
        const [items, count] = await Promise.all([notificationsApi.list(), notificationsApi.unreadCount()]);
        notificationsState.items = NotificationsCore.normalize(items); notificationsState.offline = false; NotificationsCore.save(localStorage, notificationsState.items); renderNotificationBadge(count.unread_count);
    } catch (error) { notificationsState.offline = true; notificationsState.error = error; renderNotificationBadge(); }
    finally { notificationsState.loading = false; if (document.getElementById("notificationsPage")?.classList.contains("active-page")) renderNotificationsPage(); }
}

async function loadNotificationsPage() { Navbar.setActive(""); showPage("notificationsPage", "Notifications"); renderNotificationsPage(); await refreshNotifications(true); }
function startNotificationsAutoRefresh() { clearInterval(notificationsState.refreshTimer); notificationsState.refreshTimer = setInterval(() => refreshNotifications(), 30000); }
function notificationToast(message, type = "success") { const toast = document.createElement("div"); toast.className = `nfc-toast ${type}`; toast.textContent = message; document.body.appendChild(toast); requestAnimationFrame(() => toast.classList.add("show")); setTimeout(() => { toast.classList.remove("show"); setTimeout(() => toast.remove(), 250); }, 2200); }
