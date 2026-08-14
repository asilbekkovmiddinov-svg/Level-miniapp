const tournamentAdminState = {
    tournament: null,
    applications: [],
    matches: [],
    filter: "PENDING",
    busy: false,
};

function tournamentAdminDate(value) {
    if (!value) return "—";
    return new Intl.DateTimeFormat("uz-UZ", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
    }).format(new Date(value));
}

function tournamentAdminInputDate(date) {
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function tournamentAdminMenu() {
    return `<nav class="cpa-admin-menu" aria-label="Musobaqa turi">
        <button onclick="openPage('division-admin')">Division</button>
        <button class="active">Turnir</button>
    </nav>`;
}

function tournamentAdminCreateMarkup() {
    const now = new Date();
    const closes = new Date(now.getTime() + 2 * 86400000);
    const starts = new Date(now.getTime() + 3 * 86400000);
    const ends = new Date(now.getTime() + 10 * 86400000);
    return `<div class="division-admin-shell">
        ${tournamentAdminMenu()}
        <section class="division-admin-hero"><div>
            <small>LEVEL_GROUP • ADMIN</small><h2>Yangi turnir</h2>
            <p>Formatni tanlang va turnir jadvalini yarating.</p>
        </div></section>
        <form id="tournamentCreateForm" class="division-admin-form">
            <label><span>Turnir nomi</span>
                <input name="name" maxlength="100" required value="LEVEL Cup"></label>
            <label><span>Format</span><select name="format" id="tournamentFormat" required>
                <option value="SINGLE_ELIMINATION">Olimpik</option>
                <option value="GROUP_PLAYOFF">Guruh + pley-off</option>
            </select></label>
            <label><span>Ishtirokchilar soni</span>
                <input name="max_participants" type="number" min="2" max="128" value="16" required></label>
            <div id="tournamentGroupFields" hidden>
                <label><span>Guruhlar soni</span>
                    <input name="group_count" type="number" min="2" max="32" value="4"></label>
                <label><span>Har guruhdan chiqadi</span>
                    <input name="qualifiers_per_group" type="number" min="1" max="16" value="2"></label>
            </div>
            <label><span>Ro‘yxat yopiladi</span>
                <input name="registration_closes_at" type="datetime-local" required
                    value="${tournamentAdminInputDate(closes)}"></label>
            <label><span>Turnir boshlanadi</span>
                <input name="starts_at" type="datetime-local" required
                    value="${tournamentAdminInputDate(starts)}"></label>
            <label><span>Turnir tugaydi</span>
                <input name="ends_at" type="datetime-local" required
                    value="${tournamentAdminInputDate(ends)}"></label>
            <article><b>10 ticket</b><span>Har match uchun · penalti majburiy · durang yo‘q</span></article>
            <button class="division-admin-primary" type="submit">Turnir yaratish</button>
        </form>
    </div>`;
}

function tournamentAdminApplications() {
    if (!tournamentAdminState.applications.length) {
        return '<div class="division-admin-empty">Bu statusda ishtirokchi yo‘q.</div>';
    }
    return tournamentAdminState.applications.map((item) => {
        const name = [item.first_name, item.last_name].filter(Boolean).join(" ")
            || item.username || "O‘yinchi";
        return `<article class="division-admin-app">
            <div class="division-admin-avatar">${divisionEscape(name).slice(0, 1).toUpperCase()}</div>
            <section><strong>${divisionEscape(name)}</strong>
                <small>${item.username ? "@" + divisionEscape(item.username) : item.telegram_id}</small>
                <em>${item.group_name ? "Guruh " + divisionEscape(item.group_name) : "Seed: " + (item.seed || "—")}</em>
            </section><b class="status-${String(item.status).toLowerCase()}">${divisionAdminStatusLabel(item.status)}</b>
            ${item.status === "PENDING" ? `<footer>
                <button data-tournament-decision="REJECTED" data-id="${item.id}">Rad etish</button>
                <button class="approve" data-tournament-decision="APPROVED" data-id="${item.id}">Tasdiqlash</button>
            </footer>` : ""}
        </article>`;
    }).join("");
}

function tournamentAdminSchedule() {
    const players = tournamentAdminState.applications
        .filter((item) => item.status === "APPROVED");
    if (players.length < 2) return "";
    const options = players.map((item) =>
        `<option value="${item.telegram_id}">${divisionEscape(item.username || item.first_name || item.telegram_id)}</option>`
    ).join("");
    return `<form id="tournamentMatchForm" class="division-admin-form">
        <h3>Match vaqtini belgilash</h3>
        <label><span>Player A</span><select name="player_a_id">${options}</select></label>
        <label><span>Player B</span><select name="player_b_id">${options}</select></label>
        <label><span>Bosqich raqami</span><input name="round_number" type="number" min="1" value="1"></label>
        <label><span>Bosqich nomi</span><input name="round_name" value="1-bosqich" required></label>
        ${tournamentAdminState.tournament.format === "GROUP_PLAYOFF"
            ? '<label><span>Guruh</span><input name="group_name" maxlength="16" value="A" required></label>' : ""}
        <label><span>Match vaqti</span><input name="scheduled_at" type="datetime-local" required></label>
        <button class="division-admin-primary" type="submit">Match qo‘shish</button>
    </form>`;
}

function tournamentAdminMatches() {
    if (!tournamentAdminState.matches.length) {
        return '<div class="division-admin-empty">Match jadvali hali yaratilmagan.</div>';
    }
    return tournamentAdminState.matches.map((match) => `<article class="division-admin-app">
        <div class="division-admin-avatar">⚔</div>
        <section><strong>${divisionEscape(match.round_name)}</strong>
            <small>${match.player_a_id} vs ${match.player_b_id}</small>
            <em>${tournamentAdminDate(match.scheduled_at)}</em></section>
        <b>${divisionAdminStatusLabel(match.status)}</b>
        ${match.status === "SCHEDULED" ? `<footer>
            <button class="approve" data-tournament-open="${divisionEscape(match.id)}">Arena’da ochish</button>
        </footer>` : ""}
    </article>`).join("");
}

function tournamentAdminDashboardMarkup() {
    const item = tournamentAdminState.tournament;
    return `<div class="division-admin-shell">
        ${tournamentAdminMenu()}
        <section class="division-admin-hero"><div>
            <small>LEVEL_GROUP • ADMIN</small><h2>${divisionEscape(item.name)}</h2>
            <p>${item.format === "SINGLE_ELIMINATION" ? "Olimpik" : "Guruh + pley-off"} turniri.</p>
        </div><b class="division-admin-season-status">${divisionAdminStatusLabel(item.status)}</b></section>
        <section class="division-admin-summary">
            <article><small>BOSHLANISH</small><strong>${tournamentAdminDate(item.starts_at)}</strong></article>
            <article><small>YAKUNLANISH</small><strong>${tournamentAdminDate(item.ends_at)}</strong></article>
            <article><small>LIMIT</small><strong>${item.max_participants} ishtirokchi · 10 ticket</strong></article>
        </section>
        ${item.status === "REGISTRATION"
            ? '<button class="division-admin-primary tournament-start" data-tournament-start>Turnirni boshlash</button>' : ""}
        <section class="division-admin-applications"><header><div>
            <small>APPLICATIONS</small><h3>Ishtirokchilar</h3></div></header>
            <nav>${["PENDING", "APPROVED", "REJECTED"].map((status) =>
                `<button class="${tournamentAdminState.filter === status ? "active" : ""}"
                    data-tournament-filter="${status}">${divisionAdminStatusLabel(status)}</button>`
            ).join("")}</nav>
            <div>${tournamentAdminApplications()}</div>
        </section>
        ${tournamentAdminState.filter === "APPROVED" ? tournamentAdminSchedule() : ""}
        <section class="division-admin-applications"><header><div>
            <small>SCHEDULE</small><h3>Matchlar</h3></div></header>
            <div>${tournamentAdminMatches()}</div>
        </section>
    </div>`;
}

function tournamentAdminRender() {
    const page = document.getElementById("tournamentAdminPage");
    page.innerHTML = tournamentAdminState.tournament
        ? tournamentAdminDashboardMarkup() : tournamentAdminCreateMarkup();
    bindTournamentAdmin();
}

async function tournamentAdminRun(action) {
    if (tournamentAdminState.busy) return;
    tournamentAdminState.busy = true;
    Loader.show();
    try { await action(); }
    catch (error) { Modal.error(error?.message || "Amal bajarilmadi."); }
    finally { tournamentAdminState.busy = false; Loader.hide(); }
}

async function tournamentAdminLoadApplications() {
    tournamentAdminState.applications = await tournamentAdminApi.applications(
        tournamentAdminState.tournament.id, tournamentAdminState.filter,
    );
}

function bindTournamentAdmin() {
    document.getElementById("tournamentFormat")?.addEventListener("change", (event) => {
        document.getElementById("tournamentGroupFields").hidden =
            event.target.value !== "GROUP_PLAYOFF";
    });
    document.getElementById("tournamentCreateForm")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        await tournamentAdminRun(async () => {
            const format = data.get("format");
            tournamentAdminState.tournament = await tournamentAdminApi.create({
                name: String(data.get("name")).trim(), format,
                max_participants: Number(data.get("max_participants")),
                ticket_cost: 10,
                group_count: format === "GROUP_PLAYOFF" ? Number(data.get("group_count")) : null,
                qualifiers_per_group: format === "GROUP_PLAYOFF"
                    ? Number(data.get("qualifiers_per_group")) : null,
                registration_opens_at: new Date().toISOString(),
                registration_closes_at: new Date(data.get("registration_closes_at")).toISOString(),
                starts_at: new Date(data.get("starts_at")).toISOString(),
                ends_at: new Date(data.get("ends_at")).toISOString(),
            });
            tournamentAdminRender();
        });
    });
    document.querySelectorAll("[data-tournament-filter]").forEach((button) =>
        button.addEventListener("click", () => tournamentAdminRun(async () => {
            tournamentAdminState.filter = button.dataset.tournamentFilter;
            await tournamentAdminLoadApplications();
            tournamentAdminRender();
        })));
    document.querySelectorAll("[data-tournament-decision]").forEach((button) =>
        button.addEventListener("click", () => tournamentAdminRun(async () => {
            const approved = button.dataset.tournamentDecision === "APPROVED";
            const input = { decision: button.dataset.tournamentDecision };
            if (approved && tournamentAdminState.tournament.format === "GROUP_PLAYOFF") {
                input.group_name = globalThis.prompt("Guruh nomi (A, B...):", "A");
                if (!input.group_name) return;
            }
            if (approved && tournamentAdminState.tournament.format === "SINGLE_ELIMINATION") {
                const seed = Number(globalThis.prompt("Seed raqami:", "1"));
                if (!seed) return;
                input.seed = seed;
            }
            await tournamentAdminApi.decide(
                tournamentAdminState.tournament.id, button.dataset.id, input,
            );
            await tournamentAdminLoadApplications();
            tournamentAdminRender();
        })));
    document.getElementById("tournamentMatchForm")?.addEventListener("submit", (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        tournamentAdminRun(async () => {
            await tournamentAdminApi.schedule(tournamentAdminState.tournament.id, {
                player_a_id: Number(data.get("player_a_id")),
                player_b_id: Number(data.get("player_b_id")),
                round_number: Number(data.get("round_number")),
                round_name: String(data.get("round_name")).trim(),
                group_name: data.get("group_name") || null,
                scheduled_at: new Date(data.get("scheduled_at")).toISOString(),
            });
            await loadTournamentAdminPage();
        });
    });
    document.querySelectorAll("[data-tournament-open]").forEach((button) =>
        button.addEventListener("click", () => tournamentAdminRun(async () => {
            await tournamentAdminApi.openMatch(
                tournamentAdminState.tournament.id, button.dataset.tournamentOpen,
            );
            await loadTournamentAdminPage();
        })));
    document.querySelector("[data-tournament-start]")?.addEventListener("click", () =>
        tournamentAdminRun(async () => {
            tournamentAdminState.tournament = await tournamentAdminApi.start(
                tournamentAdminState.tournament.id,
            );
            tournamentAdminRender();
        }));
}

async function loadTournamentAdminPage() {
    Navbar.setActive("");
    showPage("tournamentAdminPage", "Turnir Admin");
    const page = document.getElementById("tournamentAdminPage");
    page.innerHTML = '<div class="division-admin-loading">Turnir yuklanmoqda…</div>';
    try {
        const overview = await tournamentAdminApi.current();
        tournamentAdminState.tournament = overview?.tournament || null;
        tournamentAdminState.matches = overview?.matches || [];
        tournamentAdminState.filter = "PENDING";
        tournamentAdminState.applications = [];
        if (tournamentAdminState.tournament) {
            await tournamentAdminLoadApplications();
        }
        tournamentAdminRender();
    } catch (error) {
        page.innerHTML = `<div class="division-admin-shell"><section class="division-admin-error">
            <span>⚠</span><h2>Turnir yuklanmadi</h2><p>${divisionEscape(error.message)}</p>
        </section></div>`;
    }
}
