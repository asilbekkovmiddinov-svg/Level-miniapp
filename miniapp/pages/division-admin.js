const divisionAdminState = {
    season: null,
    applications: [],
    filter: "PENDING",
    busy: false,
};

function divisionAdminDate(value) {
    if (!value) return "—";
    return new Intl.DateTimeFormat("uz-UZ", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
    }).format(new Date(value));
}

function divisionAdminInputDate(date) {
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function divisionAdminMenu() {
    return `<nav class="cpa-admin-menu" aria-label="Admin bo‘limlari">
        <button onclick="openPage('promotions-admin')">Promotions</button>
        <button onclick="openPage('coin-promotions-admin')">Coin Promotions</button>
        <button onclick="openPage('wheel-orders-admin')">Wheel Coin Orders</button>
        <button class="active">Division</button>
        <button onclick="openPage('tournament-admin')">Turnir</button>
    </nav>`;
}

function divisionAdminCreateMarkup() {
    const now = new Date();
    const closes = new Date(now.getTime() + 2 * 86400000);
    const starts = new Date(now.getTime() + 3 * 86400000);
    const ends = new Date(now.getTime() + 17 * 86400000);
    return `<div class="division-admin-shell">
        ${divisionAdminMenu()}
        <section class="division-admin-hero">
            <small>LEVEL_GROUP • ADMIN</small><h2>Global Division</h2>
            <p>Season muddatini o‘zingiz belgilang.</p>
        </section>
        <form id="divisionSeasonForm" class="division-admin-form">
            <label><span>Season nomi</span>
                <input name="name" maxlength="80" required value="Global Division S1"></label>
            <label><span>Ro‘yxatdan o‘tish yopiladi</span>
                <input name="registration_closes_at" type="datetime-local"
                    required value="${divisionAdminInputDate(closes)}"></label>
            <label><span>Season boshlanadi</span>
                <input name="starts_at" type="datetime-local"
                    required value="${divisionAdminInputDate(starts)}"></label>
            <label><span>Season tugaydi</span>
                <input name="ends_at" type="datetime-local"
                    required value="${divisionAdminInputDate(ends)}"></label>
            <article><b>1–365 kun</b><span>Har match 1 Tournament Ticket · g‘alaba +3 · mag‘lubiyat 0</span></article>
            <button class="division-admin-primary" type="submit">Season yaratish</button>
        </form>
    </div>`;
}

function divisionAdminStatusLabel(status) {
    return {
        REGISTRATION: "Ro‘yxatdan o‘tish",
        ACTIVE: "Faol season",
        FINISHED: "Yakunlangan",
        PENDING: "Kutilmoqda",
        APPROVED: "Tasdiqlangan",
        REJECTED: "Rad etilgan",
    }[status] || status;
}

function divisionAdminApplications() {
    if (!divisionAdminState.applications.length) {
        return `<div class="division-admin-empty">Bu statusda ariza yo‘q.</div>`;
    }
    return divisionAdminState.applications.map((item) => {
        const name = [item.first_name, item.last_name].filter(Boolean).join(" ")
            || item.username || "O‘yinchi";
        return `<article class="division-admin-app">
            <div class="division-admin-avatar">${divisionEscape(name).slice(0, 1).toUpperCase()}</div>
            <section><strong>${divisionEscape(name)}</strong>
                <small>${item.username ? "@" + divisionEscape(item.username) : "Telegram ID: " + item.telegram_id}</small>
                <em>${divisionAdminDate(item.applied_at)}</em></section>
            <b class="status-${String(item.status).toLowerCase()}">${divisionAdminStatusLabel(item.status)}</b>
            ${item.status === "PENDING" ? `<footer>
                <button data-division-decision="REJECTED" data-id="${item.id}">Rad etish</button>
                <button class="approve" data-division-decision="APPROVED" data-id="${item.id}">Tasdiqlash</button>
            </footer>` : ""}
        </article>`;
    }).join("");
}

function divisionAdminDashboardMarkup() {
    const season = divisionAdminState.season;
    return `<div class="division-admin-shell">
        ${divisionAdminMenu()}
        <section class="division-admin-hero">
            <div><small>LEVEL_GROUP • ADMIN</small><h2>${divisionEscape(season.name)}</h2>
                <p>Global Division season boshqaruvi.</p></div>
            <b class="division-admin-season-status">${divisionAdminStatusLabel(season.status)}</b>
        </section>
        <section class="division-admin-summary">
            <article><small>BOSHLANISH</small><strong>${divisionAdminDate(season.starts_at)}</strong></article>
            <article><small>YAKUNLANISH</small><strong>${divisionAdminDate(season.ends_at)}</strong></article>
            <article><small>QOIDA</small><strong>1 ticket · +3 ochko</strong></article>
        </section>
        <section class="division-admin-actions">
            ${season.status === "REGISTRATION"
                ? `<button class="division-admin-primary" data-division-season-action="start">Seasonni boshlash</button>`
                : ""}
            ${season.status === "ACTIVE"
                ? `<button class="division-admin-danger" data-division-season-action="finish">Seasonni yakunlash</button>`
                : ""}
        </section>
        <section class="division-admin-applications">
            <header><div><small>APPLICATIONS</small><h3>Ishtirokchilar</h3></div>
                <button data-division-refresh aria-label="Yangilash">↻</button></header>
            <nav>
                ${["PENDING", "APPROVED", "REJECTED"].map((status) =>
                    `<button class="${divisionAdminState.filter === status ? "active" : ""}"
                        data-division-filter="${status}">${divisionAdminStatusLabel(status)}</button>`
                ).join("")}
            </nav>
            <div id="divisionAdminApplicationList">${divisionAdminApplications()}</div>
        </section>
    </div>`;
}

function divisionAdminRender() {
    const page = document.getElementById("divisionAdminPage");
    if (!page) return;
    page.innerHTML = divisionAdminState.season
        ? divisionAdminDashboardMarkup() : divisionAdminCreateMarkup();
    bindDivisionAdmin();
}

function divisionAdminError(error) {
    const page = document.getElementById("divisionAdminPage");
    const title = error?.status === 403 ? "Admin ruxsati yo‘q" : "Division yuklanmadi";
    page.innerHTML = `<div class="division-admin-shell"><section class="division-admin-error">
        <span>⚠</span><h2>${title}</h2><p>${divisionEscape(error?.message || "Qayta urinib ko‘ring.")}</p>
        <button onclick="loadDivisionAdminPage()">Qayta urinish</button>
    </section></div>`;
}

function divisionAdminConfirm(message) {
    return new Promise((resolve) => {
        if (typeof tg?.showConfirm === "function") tg.showConfirm(message, resolve);
        else resolve(globalThis.confirm(message));
    });
}

async function divisionAdminRun(action) {
    if (divisionAdminState.busy) return;
    divisionAdminState.busy = true;
    Loader.show();
    try {
        await action();
    } catch (error) {
        console.error(error);
        Modal.error(error?.message || "Amal bajarilmadi.");
    } finally {
        divisionAdminState.busy = false;
        Loader.hide();
    }
}

async function divisionAdminLoadApplications() {
    if (!divisionAdminState.season) return;
    const payload = await divisionAdminApi.applications(
        divisionAdminState.season.id, divisionAdminState.filter,
    );
    divisionAdminState.applications = Array.isArray(payload?.items)
        ? payload.items : [];
}

function bindDivisionAdmin() {
    document.getElementById("divisionSeasonForm")?.addEventListener(
        "submit", async (event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            await divisionAdminRun(async () => {
                const now = new Date();
                divisionAdminState.season = await divisionAdminApi.createSeason({
                    name: String(data.get("name") || "").trim(),
                    registration_opens_at: now.toISOString(),
                    registration_closes_at: new Date(
                        data.get("registration_closes_at"),
                    ).toISOString(),
                    starts_at: new Date(data.get("starts_at")).toISOString(),
                    ends_at: new Date(data.get("ends_at")).toISOString(),
                });
                await divisionAdminLoadApplications();
                divisionAdminRender();
            });
        },
    );
    document.querySelectorAll("[data-division-filter]").forEach((button) =>
        button.addEventListener("click", async () => {
            divisionAdminState.filter = button.dataset.divisionFilter;
            await divisionAdminRun(async () => {
                await divisionAdminLoadApplications();
                divisionAdminRender();
            });
        }));
    document.querySelector("[data-division-refresh]")?.addEventListener(
        "click", async () => divisionAdminRun(async () => {
            await divisionAdminLoadApplications();
            divisionAdminRender();
        }),
    );
    document.querySelectorAll("[data-division-decision]").forEach((button) =>
        button.addEventListener("click", async () => divisionAdminRun(async () => {
            await divisionAdminApi.decide(
                divisionAdminState.season.id,
                button.dataset.id,
                button.dataset.divisionDecision,
            );
            await divisionAdminLoadApplications();
            divisionAdminRender();
        })));
    document.querySelector("[data-division-season-action]")?.addEventListener(
        "click", async (event) => {
            const action = event.currentTarget.dataset.divisionSeasonAction;
            const accepted = await divisionAdminConfirm(
                action === "start"
                    ? "Seasonni boshlaysizmi? Keyin yangi ariza qabul qilinmaydi."
                    : "Seasonni yakunlaysizmi?",
            );
            if (!accepted) return;
            await divisionAdminRun(async () => {
                divisionAdminState.season = action === "start"
                    ? await divisionAdminApi.startSeason(divisionAdminState.season.id)
                    : await divisionAdminApi.finishSeason(divisionAdminState.season.id);
                divisionAdminRender();
            });
        },
    );
}

async function loadDivisionAdminPage() {
    Navbar.setActive("");
    showPage("divisionAdminPage", "Division Admin");
    const page = document.getElementById("divisionAdminPage");
    page.innerHTML = `<div class="division-admin-loading">Division admin yuklanmoqda…</div>`;
    try {
        const overview = await divisionAdminApi.overview();
        divisionAdminState.season = overview?.season || null;
        divisionAdminState.filter = "PENDING";
        divisionAdminState.applications = [];
        if (divisionAdminState.season) await divisionAdminLoadApplications();
        divisionAdminRender();
    } catch (error) {
        console.error(error);
        divisionAdminError(error);
    }
}
