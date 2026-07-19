const promotionsAdminState = {
    items: [], filter: "ALL", search: "", sort: "PRIORITY", loading: false, analytics: null, period: "7D",
};

const promotionsAdminApi = new PromotionsAdminApi({
    baseUrl: API_URL,
    initDataProvider: () => telegramInitData(),
});

function promotionsAdminDate(value, compact = false) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("uz-UZ", {
        day: "2-digit", month: "2-digit", year: compact ? "2-digit" : "numeric",
        hour: "2-digit", minute: "2-digit",
    }).format(date);
}

function promotionsAdminInputDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
}

function promotionsAdminBanner(item) {
    const safeUrl = /^(https?:\/\/|blob:)/i.test(item.banner_url || "")
        ? PromotionsAdminCore.escapeHtml(item.banner_url)
        : "";
    return safeUrl
        ? `<img src="${safeUrl}" alt="" loading="lazy" onerror="this.parentElement.classList.add('is-placeholder');this.remove()">`
        : `<span>LEVEL<br><b>GROUP</b></span>`;
}

function promotionsAdminStats() {
    const counts = PromotionsAdminCore.dashboardCounts(promotionsAdminState.items);
    const cards = [
        ["ALL", "TOTAL", "Jami", "◆"], ["ACTIVE", "ACTIVE", "Active", "●"],
        ["SCHEDULED", "SCHEDULED", "Scheduled", "◷"], ["PAUSED", "PAUSED", "Paused", "Ⅱ"],
        ["EXPIRED", "EXPIRED", "Expired", "⌛"], ["DELETED", "DELETED", "Deleted", "♲"],
    ];
    return cards.map(([filter, key, label, icon]) => `
        <button class="pac-stat ${promotionsAdminState.filter === filter ? "is-active" : ""}"
            type="button" data-filter="${filter}">
            <span>${icon}</span><strong>${counts[key]}</strong><small>${label}</small>
        </button>`).join("");
}

function promotionsAdminActions(item) {
    if (item.status === "DELETED") {
        return `<button class="pac-action restore" data-action="restore" data-id="${item.id}" type="button">♻ Restore</button>`;
    }
    return `
        <button class="pac-action" data-action="edit" data-id="${item.id}" type="button">✎ Edit</button>
        ${item.status !== "ACTIVE" ? `<button class="pac-action activate" data-action="activate" data-id="${item.id}" type="button">▶ Activate</button>` : ""}
        ${["ACTIVE", "SCHEDULED"].includes(item.status) ? `<button class="pac-action pause" data-action="pause" data-id="${item.id}" type="button">Ⅱ Pause</button>` : ""}
        ${item.status !== "DRAFT" ? `<button class="pac-action" data-action="deactivate" data-id="${item.id}" type="button">⊘ Deactivate</button>` : ""}
        <button class="pac-action delete" data-action="delete" data-id="${item.id}" type="button">⌫ Delete</button>`;
}

function promotionsAdminCard(item) {
    const e = PromotionsAdminCore.escapeHtml;
    const metric = PromotionsAnalyticsCore.metricMap(promotionsAdminState.analytics).get(item.id) || {};
    return `<article class="pac-card status-${e(item.status.toLowerCase())}">
        <div class="pac-banner ${item.banner_url ? "" : "is-placeholder"}">
            ${promotionsAdminBanner(item)}
            ${item.badge ? `<em>${e(item.badge)}</em>` : ""}
            <i>${e(item.status)}</i>
        </div>
        <div class="pac-card-body">
            <header><div><h3>${e(item.title)}</h3><p>${e(item.subtitle || "Subtitle kiritilmagan")}</p></div><b>#${item.priority}</b></header>
            <div class="pac-meta">
                <span><small>START</small><b>${promotionsAdminDate(item.start_at, true)}</b></span>
                <span><small>END</small><b>${promotionsAdminDate(item.end_at, true)}</b></span>
                <span><small>VIEWS</small><b>${item.view_count}${item.max_views ? ` / ${item.max_views}` : ""}</b></span>
                <span><small>CLICKS</small><b>${item.click_count}${item.max_clicks ? ` / ${item.max_clicks}` : ""}</b></span>
            </div>
            <div class="pac-analytics-strip">
                <span><small>📈 VIEWS</small><b>${metric.views || 0}</b></span><span><small>👆 CLICKS</small><b>${metric.clicks || 0}</b></span>
                <span><small>🎯 CTR</small><b>${metric.ctr || 0}%</b></span><span><small>👥 UNIQUE</small><b>${metric.unique_users || 0}</b></span>
                <span><small>⏱ LAST VIEW</small><b>${promotionsAdminDate(metric.last_viewed_at, true)}</b></span><span><small>⚡ LAST CLICK</small><b>${promotionsAdminDate(metric.last_clicked_at, true)}</b></span>
            </div>
            <footer>${promotionsAdminActions(item)}</footer>
        </div>
    </article>`;
}

function promotionsAnalyticsChart(title, key, color) {
    const rows = promotionsAdminState.analytics?.daily || [];
    const points = PromotionsAnalyticsCore.chartPoints(rows, key);
    return `<article class="pac-chart"><header><h4>${title}</h4><b>${rows.length ? rows[rows.length - 1][key] : 0}</b></header>
        <svg viewBox="0 0 300 90" role="img" aria-label="${title}"><polyline points="${points}" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <footer><span>${rows[0]?.date || "—"}</span><span>${rows[rows.length - 1]?.date || "—"}</span></footer></article>`;
}

function promotionsAnalyticsRank(title, key) {
    const values = promotionsAdminState.analytics?.rankings?.[key] || [];
    return `<article class="pac-ranking"><h4>${title}</h4>${values.length ? values.map((item, index) => `<div><b>${index + 1}</b><span>${PromotionsAdminCore.escapeHtml(item.title)}</span><em>${item.clicks} click • ${item.ctr}%</em></div>`).join("") : `<p>Bu davr uchun ma’lumot yo‘q.</p>`}</article>`;
}

function promotionsAnalyticsDashboard() {
    const a = promotionsAdminState.analytics;
    if (!a) return "";
    const s = a.summary;
    const labels = { TODAY: "Today", "7D": "7 Days", "30D": "30 Days", ALL: "All Time" };
    return `<section class="pac-analytics">
        <header><div><small>PERFORMANCE</small><h3>Promotion Analytics</h3></div><div class="pac-periods">${PromotionsAnalyticsCore.PERIODS.map((p) => `<button type="button" data-period="${p}" class="${promotionsAdminState.period === p ? "is-active" : ""}">${labels[p]}</button>`).join("")}<button id="promotionsAnalyticsExport" type="button">⇩ CSV</button></div></header>
        <div class="pac-kpis"><span><small>📈 Views</small><b>${s.views}</b></span><span><small>👆 Clicks</small><b>${s.clicks}</b></span><span><small>🎯 CTR</small><b>${s.ctr}%</b></span><span><small>👥 Unique Users</small><b>${s.unique_users || 0}</b></span></div>
        <div class="pac-charts">${promotionsAnalyticsChart("Daily Views", "views", "#60a5fa")}${promotionsAnalyticsChart("Daily Clicks", "clicks", "#f87171")}${promotionsAnalyticsChart("CTR Trend", "ctr", "#34d399")}</div>
        <div class="pac-rankings">${promotionsAnalyticsRank("Top Performing", "top_performing")}${promotionsAnalyticsRank("Worst Performing", "worst_performing")}${promotionsAnalyticsRank("Most Clicked", "most_clicked")}${promotionsAnalyticsRank("Highest CTR", "highest_ctr")}</div>
    </section>`;
}

function renderPromotionsAdminList() {
    const list = document.getElementById("promotionsAdminList");
    if (!list) return;
    const visible = PromotionsAdminCore.visiblePromotions(promotionsAdminState.items, promotionsAdminState);
    list.innerHTML = visible.length
        ? visible.map(promotionsAdminCard).join("")
        : `<div class="pac-empty"><span>◇</span><h3>Aksiya topilmadi</h3><p>Filter yoki qidiruvni o‘zgartiring, yoxud yangi promotion yarating.</p></div>`;
    const summary = document.getElementById("promotionsAdminResultCount");
    if (summary) summary.textContent = `${visible.length} ta natija`;
    document.getElementById("promotionsAdminStats").innerHTML = promotionsAdminStats();
}

function promotionsAdminShell() {
    return `<div class="pac-shell">
        <nav class="cpa-admin-menu" aria-label="Admin bo‘limlari"><button class="active">Promotions</button><button onclick="openPage('coin-promotions-admin')">Coin Promotions</button></nav>
        <section class="pac-hero">
            <div><small>LEVEL_GROUP • ADMIN</small><h2>Marketing CMS</h2><p>Aksiyalarni telefoningizdan boshqaring.</p></div>
            <button id="promotionsAdminCreate" type="button"><span>＋</span> Yangi aksiya</button>
        </section>
        <section id="promotionsAdminStats" class="pac-stats">${promotionsAdminStats()}</section>
        ${promotionsAnalyticsDashboard()}
        <section class="pac-toolbar">
            <label class="pac-search"><span>⌕</span><input id="promotionsAdminSearch" type="search" placeholder="Title yoki subtitle..." autocomplete="off"></label>
            <select id="promotionsAdminFilter" aria-label="Status filter">
                ${PromotionsAdminCore.STATUSES.map((status) => `<option value="${status}">${status}</option>`).join("")}
            </select>
            <select id="promotionsAdminSort" aria-label="Sort">
                <option value="PRIORITY">Priority</option><option value="CREATED">Created</option><option value="UPDATED">Updated</option>
            </select>
        </section>
        <div class="pac-list-head"><h3>Promotions</h3><span id="promotionsAdminResultCount"></span></div>
        <section id="promotionsAdminList" class="pac-list"></section>
    </div>`;
}

function promotionsAdminSkeleton() {
    return `<div class="pac-shell"><div class="pac-skeleton hero"></div><div class="pac-skeleton-grid">${"<i></i>".repeat(6)}</div>${"<div class=\"pac-skeleton card\"></div>".repeat(3)}</div>`;
}

function promotionsAdminError(error) {
    const status = Number(error?.status || 0);
    const title = status === 401 ? "Admin login required." : status === 403 ? "Admin permission required." : "Dashboard yuklanmadi";
    const message = status === 401
        ? "MiniApp’ni Telegram ichidan qayta oching."
        : status === 403 ? "Siz Marketing CMS admin allowlistida emassiz." : "Internet yoki server holatini tekshirib, qayta urinib ko‘ring.";
    return `<div class="pac-access-error"><span>${status === 403 ? "⊘" : "!"}</span><h2>${title}</h2><p>${message}</p><button type="button" onclick="loadPromotionsAdminPage(true)">Qayta urinish</button></div>`;
}

function bindPromotionsAdmin() {
    const page = document.getElementById("promotionsAdminPage");
    document.getElementById("promotionsAdminCreate")?.addEventListener("click", () => openPromotionAdminForm());
    document.getElementById("promotionsAdminSearch")?.addEventListener("input", (event) => {
        promotionsAdminState.search = event.target.value; renderPromotionsAdminList();
    });
    document.getElementById("promotionsAdminFilter")?.addEventListener("change", (event) => {
        promotionsAdminState.filter = event.target.value; renderPromotionsAdminList();
    });
    document.getElementById("promotionsAdminSort")?.addEventListener("change", (event) => {
        promotionsAdminState.sort = event.target.value; renderPromotionsAdminList();
    });
    document.getElementById("promotionsAnalyticsExport")?.addEventListener("click", exportPromotionsAnalytics);
    if (page) page.onclick = (event) => {
        const filter = event.target.closest("[data-filter]");
        if (filter) {
            promotionsAdminState.filter = filter.dataset.filter;
            const select = document.getElementById("promotionsAdminFilter");
            if (select) select.value = promotionsAdminState.filter;
            renderPromotionsAdminList(); return;
        }
        const period = event.target.closest("[data-period]");
        if (period) { loadPromotionsAnalytics(period.dataset.period); return; }
        const action = event.target.closest("[data-action]");
        if (action) handlePromotionAdminAction(action.dataset.action, Number(action.dataset.id));
    };
}

async function loadPromotionsAdminPage(force = false) {
    Navbar.setActive("");
    showPage("promotionsAdminPage", "Marketing CMS");
    document.body.classList.add("promotions-admin-open");
    const page = document.getElementById("promotionsAdminPage");
    if (!force && promotionsAdminState.items.length && promotionsAdminState.analytics) {
        page.innerHTML = promotionsAdminShell(); bindPromotionsAdmin(); renderPromotionsAdminList(); return;
    }
    page.innerHTML = promotionsAdminSkeleton();
    try {
        const [items, analytics] = await Promise.all([promotionsAdminApi.list(), promotionsAdminApi.analytics(promotionsAdminState.period)]);
        promotionsAdminState.items = PromotionsAdminCore.normalizeList(items);
        promotionsAdminState.analytics = PromotionsAnalyticsCore.normalize(analytics);
        page.innerHTML = promotionsAdminShell(); bindPromotionsAdmin(); renderPromotionsAdminList();
    } catch (error) {
        page.innerHTML = promotionsAdminError(error);
    }
}

async function loadPromotionsAnalytics(period) {
    promotionsAdminState.period = period;
    try {
        promotionsAdminState.analytics = PromotionsAnalyticsCore.normalize(await promotionsAdminApi.analytics(period));
        const page = document.getElementById("promotionsAdminPage");
        page.innerHTML = promotionsAdminShell(); bindPromotionsAdmin(); renderPromotionsAdminList();
    } catch (error) { promotionsAdminToast(error.message || "Analytics yuklanmadi.", "error"); }
}

async function exportPromotionsAnalytics() {
    try {
        const result = await promotionsAdminApi.exportAnalytics(promotionsAdminState.period);
        const url = URL.createObjectURL(result.blob);
        const anchor = document.createElement("a"); anchor.href = url; anchor.download = result.filename; anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000); promotionsAdminToast("Analytics CSV tayyor.");
    } catch (error) { promotionsAdminToast(error.message || "CSV export failed.", "error"); }
}

function promotionsAdminToast(message, type = "success") {
    document.querySelector(".pac-toast")?.remove();
    const toast = document.createElement("div");
    toast.className = `pac-toast ${type}`;
    toast.textContent = `${type === "success" ? "✓" : "!"} ${message}`;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("show"));
    setTimeout(() => { toast.classList.remove("show"); setTimeout(() => toast.remove(), 250); }, 2600);
}

function promotionsAdminConfirm(message) {
    return new Promise((resolve) => tg.showConfirm(message, (confirmed) => resolve(Boolean(confirmed))));
}

async function handlePromotionAdminAction(action, id) {
    const item = promotionsAdminState.items.find((promotion) => promotion.id === id);
    if (!item) return;
    if (action === "edit") return openPromotionAdminForm(item);
    const labels = { delete: "o‘chirish", restore: "tiklash", activate: "faollashtirish", pause: "pauza qilish", deactivate: "faolsizlantirish" };
    if (!await promotionsAdminConfirm(`“${item.title}” aksiyasini ${labels[action]}ni tasdiqlaysizmi?`)) return;
    try {
        const method = action === "delete" ? "remove" : action;
        await promotionsAdminApi[method](id);
        promotionsAdminToast("Promotion holati yangilandi.");
        await loadPromotionsAdminPage(true);
    } catch (error) {
        promotionsAdminToast(error.message || "Amal bajarilmadi.", "error");
    }
}

function promotionAdminField(label, name, value = "", options = {}) {
    const e = PromotionsAdminCore.escapeHtml;
    if (options.type === "textarea") return `<label class="wide"><span>${label}</span><textarea name="${name}" rows="3">${e(value)}</textarea></label>`;
    if (options.type === "select") return `<label><span>${label}</span><select name="${name}" ${options.disabled ? "disabled" : ""}>${options.values.map((option) => `<option value="${option}" ${option === value ? "selected" : ""}>${option}</option>`).join("")}</select></label>`;
    return `<label class="${options.wide ? "wide" : ""}"><span>${label}</span><input name="${name}" type="${options.type || "text"}" value="${e(value)}" ${options.min !== undefined ? `min="${options.min}"` : ""}></label>`;
}

function promotionAdminPreview(values = {}, bannerOverride = "") {
    if (bannerOverride) values = { ...values, banner_url: bannerOverride };
    const item = PromotionsAdminCore.normalizePromotion({ ...values, id: 0, status: values.status || "DRAFT" });
    return `<div class="pac-preview-banner ${item.banner_url ? "" : "is-placeholder"}">${promotionsAdminBanner(item)}</div>
        <div><small>LIVE PREVIEW</small><h3>${PromotionsAdminCore.escapeHtml(item.title || "Promotion title")}</h3><p>${PromotionsAdminCore.escapeHtml(item.subtitle || "Promotion subtitle")}</p>
        <button type="button">${PromotionsAdminCore.escapeHtml(item.button_text || "Batafsil")} <b>›</b></button></div>`;
}

function openPromotionAdminForm(item = null) {
    const editing = Boolean(item);
    const value = (key) => item?.[key] ?? "";
    let selectedBannerBlob = null;
    let selectedBannerUrl = "";
    let targetId = item?.id || null;
    let contentSaved = false;
    const overlay = document.createElement("div");
    overlay.className = "pac-form-overlay";
    overlay.innerHTML = `<section class="pac-form-sheet">
        <header><div><small>${editing ? "EDIT PROMOTION" : "CREATE PROMOTION"}</small><h2>${editing ? "Aksiyani tahrirlash" : "Yangi aksiya"}</h2></div><button type="button" data-close>×</button></header>
        <div id="promotionAdminPreview" class="pac-preview">${promotionAdminPreview(item || {})}</div>
        <form id="promotionAdminForm" class="pac-form">
            ${promotionAdminField("Title *", "title", value("title"), { wide: true })}
            ${promotionAdminField("Subtitle", "subtitle", value("subtitle"), { wide: true })}
            ${promotionAdminField("Description", "description", value("description"), { type: "textarea" })}
            <section class="pac-banner-manager wide" id="promotionBannerManager">
                <div class="pac-banner-drop" tabindex="0">
                    <span>▧</span><div><b>${item?.banner_uploaded ? "Banner yuklangan" : "Banner rasmini tanlang"}</b><small>16:9 • JPG, PNG, WEBP • max 5 MB</small></div>
                </div>
                <div class="pac-banner-buttons">
                    <button type="button" data-gallery>▣ Gallery</button>
                    <button type="button" data-camera>◉ Camera</button>
                    ${item?.banner_uploaded ? `<button class="danger" type="button" data-delete-banner>⌫ Delete</button>` : ""}
                </div>
                <input data-gallery-input type="file" accept="image/jpeg,image/png,image/webp" hidden>
                <input data-camera-input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden>
                <div class="pac-upload-progress" hidden><i></i><span>0%</span></div>
                <p class="pac-banner-message">Desktopda rasmni shu maydonga drag & drop qilishingiz mumkin.</p>
            </section>
            ${promotionAdminField("Badge", "badge", value("badge"))}
            ${promotionAdminField("Priority", "priority", value("priority") || 0, { type: "number", min: 0 })}
            ${promotionAdminField("Button Text", "button_text", value("button_text"))}
            ${promotionAdminField("Button Action", "button_action", value("button_action") || "NONE", { type: "select", values: PromotionsAdminCore.ACTIONS })}
            ${promotionAdminField("Button Target", "button_target", value("button_target"), { wide: true })}
            ${promotionAdminField("Status", "status", value("status") || "DRAFT", { type: "select", values: ["DRAFT", "SCHEDULED", "ACTIVE", "PAUSED"], disabled: editing })}
            ${promotionAdminField("Start DateTime", "start_at", promotionsAdminInputDate(value("start_at")), { type: "datetime-local" })}
            ${promotionAdminField("End DateTime", "end_at", promotionsAdminInputDate(value("end_at")), { type: "datetime-local" })}
            ${promotionAdminField("Max Views", "max_views", value("max_views"), { type: "number", min: 1 })}
            ${promotionAdminField("Max Clicks", "max_clicks", value("max_clicks"), { type: "number", min: 1 })}
            <footer><button type="button" data-close>Bekor qilish</button><button class="primary" type="submit">${editing ? "Saqlash" : "Yaratish"}</button></footer>
        </form>
    </section>`;
    document.body.appendChild(overlay);
    const form = overlay.querySelector("form");
    const manager = overlay.querySelector("#promotionBannerManager");
    const drop = manager.querySelector(".pac-banner-drop");
    const galleryInput = manager.querySelector("[data-gallery-input]");
    const cameraInput = manager.querySelector("[data-camera-input]");
    const managerMessage = manager.querySelector(".pac-banner-message");
    const progress = manager.querySelector(".pac-upload-progress");
    const close = () => {
        if (selectedBannerUrl) URL.revokeObjectURL(selectedBannerUrl);
        overlay.remove();
    };
    overlay.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", close));
    overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
    const renderFormPreview = () => {
        const values = Object.fromEntries(new FormData(form));
        document.getElementById("promotionAdminPreview").innerHTML = promotionAdminPreview(values, selectedBannerUrl);
    };
    const chooseBanner = async (file) => {
        if (!file) return;
        try {
            managerMessage.textContent = "Crop studio ochilmoqda...";
            const blob = await PromotionBannerStudio.open(file);
            if (selectedBannerUrl) URL.revokeObjectURL(selectedBannerUrl);
            selectedBannerBlob = blob;
            selectedBannerUrl = URL.createObjectURL(blob);
            drop.classList.add("has-file");
            drop.querySelector("b").textContent = "Banner crop va compress qilindi";
            managerMessage.textContent = `${Math.max(1, Math.round(blob.size / 1024))} KB • Saqlanganda upload qilinadi.`;
            renderFormPreview();
        } catch (error) {
            if (!/cancelled/i.test(error.message || "")) promotionsAdminToast(error.message, "error");
            managerMessage.textContent = "Banner tanlanmadi. Qayta urinishingiz mumkin.";
        }
    };
    overlay.querySelector("[data-gallery]").addEventListener("click", () => galleryInput.click());
    overlay.querySelector("[data-camera]").addEventListener("click", () => cameraInput.click());
    galleryInput.addEventListener("change", () => chooseBanner(galleryInput.files[0]));
    cameraInput.addEventListener("change", () => chooseBanner(cameraInput.files[0]));
    ["dragenter", "dragover"].forEach((name) => drop.addEventListener(name, (event) => { event.preventDefault(); drop.classList.add("is-dragging"); }));
    ["dragleave", "drop"].forEach((name) => drop.addEventListener(name, (event) => { event.preventDefault(); drop.classList.remove("is-dragging"); }));
    drop.addEventListener("drop", (event) => chooseBanner(event.dataTransfer?.files?.[0]));
    drop.addEventListener("click", () => galleryInput.click());
    drop.addEventListener("keydown", (event) => { if (["Enter", " "].includes(event.key)) galleryInput.click(); });
    overlay.querySelector("[data-delete-banner]")?.addEventListener("click", async (event) => {
        if (!await promotionsAdminConfirm("Promotion bannerini o‘chirishni tasdiqlaysizmi?")) return;
        event.currentTarget.disabled = true;
        try {
            await promotionsAdminApi.deleteBanner(targetId);
            item.banner_uploaded = false; item.banner_url = "";
            event.currentTarget.remove();
            managerMessage.textContent = "Banner o‘chirildi.";
            document.getElementById("promotionAdminPreview").innerHTML = promotionAdminPreview(Object.fromEntries(new FormData(form)));
            promotionsAdminToast("Banner o‘chirildi.");
        } catch (error) {
            event.currentTarget.disabled = false; promotionsAdminToast(error.message, "error");
        }
    });
    form.addEventListener("input", renderFormPreview);
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const submit = form.querySelector("button[type=submit]");
        try {
            const payload = PromotionsAdminCore.formPayload(Object.fromEntries(new FormData(form)));
            if (editing) delete payload.status;
            submit.disabled = true; submit.textContent = "Saqlanmoqda...";
            if (!contentSaved) {
                const saved = editing
                    ? await promotionsAdminApi.update(item.id, payload)
                    : await promotionsAdminApi.create(payload);
                targetId = saved.id;
                contentSaved = true;
            }
            if (selectedBannerBlob) {
                progress.hidden = false;
                await promotionsAdminApi.uploadBanner(targetId, selectedBannerBlob, (percent) => {
                    progress.querySelector("i").style.width = `${percent}%`;
                    progress.querySelector("span").textContent = `${percent}%`;
                });
            }
            close(); promotionsAdminToast(editing ? "Promotion yangilandi." : "Promotion yaratildi.");
            await loadPromotionsAdminPage(true);
        } catch (error) {
            promotionsAdminToast(error.message || "Saqlab bo‘lmadi.", "error");
            managerMessage.textContent = contentSaved && selectedBannerBlob ? "Upload bajarilmadi. Retry tugmasini bosing." : managerMessage.textContent;
            submit.disabled = false; submit.textContent = contentSaved && selectedBannerBlob ? "Uploadni qayta urinish" : editing ? "Saqlash" : "Yaratish";
        }
    });
}
