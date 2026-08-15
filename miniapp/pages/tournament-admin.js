const tournamentAdminState = {
    tournament: null,
    overview: null,
    participants: [],
    matches: [],
    offset: 0,
    limit: 100,
    search: "",
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
    const ends = new Date(now.getTime() + 14 * 86400000);
    return `<div class="division-admin-shell">
        ${tournamentAdminMenu()}
        <section class="division-admin-hero"><div>
            <small>LEVEL_GROUP • ADMIN</small><h2>Yangi guruh turniri</h2>
            <p>Qatnashish ticketi, guruh turi va guruh hajmini belgilang.</p>
        </div></section>
        <form id="tournamentCreateForm" class="division-admin-form">
            <label><span>Turnir nomi</span>
                <input name="name" maxlength="100" required value="LEVEL Cup"></label>
            <label><span>Qatnashish ticketi</span>
                <input name="ticket_cost" type="number" min="0" max="1000000" value="10" required>
                <small>Har matchda emas, turnirga kirishda bir marta olinadi.</small></label>
            <label><span>Ishtirokchilar soni</span>
                <input name="max_participants" type="number" min="4" max="8192" value="64" required></label>
            <label><span>Guruh turi</span><select name="group_mode" required>
                <option value="ELIMINATION">Yutqazgan chiqadi</option>
                <option value="POINTS">Ochkolik</option>
            </select></label>
            <label><span>Guruhdagi o‘yinchilar</span><select name="group_size" required>
                <option value="4">4 kishilik</option>
                <option value="8" selected>8 kishilik</option>
            </select></label>
            <label><span>Har guruhdan chiqadi</span><select name="qualifiers_per_group" required>
                <option value="1">1 o‘yinchi</option>
                <option value="2" selected>2 o‘yinchi</option>
                <option value="4">4 o‘yinchi</option>
            </select></label>
            <label><span>Ro‘yxat yopiladi</span>
                <input name="registration_closes_at" type="datetime-local" required
                    value="${tournamentAdminInputDate(closes)}"></label>
            <label><span>Turnir boshlanadi</span>
                <input name="starts_at" type="datetime-local" required
                    value="${tournamentAdminInputDate(starts)}"></label>
            <label><span>Turnir tugaydi</span>
                <input name="ends_at" type="datetime-local" required
                    value="${tournamentAdminInputDate(ends)}"></label>
            <article><b>Oddiy boshqaruv</b><span>Admin match vaqtini va natijasini kiritadi.</span></article>
            <button class="division-admin-primary" type="submit">Turnir yaratish</button>
        </form>
    </div>`;
}

function tournamentAdminParticipants() {
    if (!tournamentAdminState.participants.length) {
        return '<div class="division-admin-empty">Hozircha qatnashuvchi yo‘q.</div>';
    }
    return tournamentAdminState.participants.map((item) => {
        const name = [item.first_name, item.last_name].filter(Boolean).join(" ")
            || item.username || "O‘yinchi";
        return `<article class="division-admin-app">
            <div class="division-admin-avatar">${divisionEscape(name).slice(0, 1).toUpperCase()}</div>
            <section><strong>${divisionEscape(name)}</strong>
                <small>${item.username ? "@" + divisionEscape(item.username) : item.telegram_id}</small>
                <em>${item.group_name ? "Guruh " + divisionEscape(item.group_name) : "Guruh kutilmoqda"}</em>
            </section><b class="status-${String(item.status).toLowerCase()}">${divisionAdminStatusLabel(item.status)}</b>
        </article>`;
    }).join("");
}

function tournamentAdminSchedule() {
    const players = tournamentAdminState.participants
        .filter((item) => item.status === "APPROVED");
    if (tournamentAdminState.tournament.status !== "ACTIVE" || players.length < 2) return "";
    const options = players.map((item) =>
        `<option value="${item.telegram_id}">${divisionEscape(
            (item.group_name ? "Guruh " + item.group_name + " · " : "")
            + (item.username || item.first_name || item.telegram_id)
        )}</option>`
    ).join("");
    return `<form id="tournamentMatchForm" class="division-admin-form">
        <h3>Match vaqtini belgilash</h3>
        <label><span>Guruh</span><input name="group_name" maxlength="16" placeholder="A"></label>
        <label><span>Player A</span><select name="player_a_id">${options}</select></label>
        <label><span>Player B</span><select name="player_b_id">${options}</select></label>
        <label><span>Bosqich raqami</span><input name="round_number" type="number" min="1" value="1"></label>
        <label><span>Bosqich nomi</span><input name="round_name" value="Guruh bosqichi" required></label>
        <label><span>Match vaqti</span><input name="scheduled_at" type="datetime-local" required></label>
        <button class="division-admin-primary" type="submit">Match qo‘shish</button>
    </form>`;
}

function tournamentAdminMatches() {
    if (!tournamentAdminState.matches.length) {
        return '<div class="division-admin-empty">Admin hali match yaratmagan.</div>';
    }
    return tournamentAdminState.matches.map((match) => `<article class="division-admin-app tournament-admin-match">
        <div class="division-admin-avatar">⚔</div>
        <section><strong>${divisionEscape(match.round_name)}</strong>
            <small>${match.player_a_id} vs ${match.player_b_id}${match.group_name
                ? " · Guruh " + divisionEscape(match.group_name) : ""}</small>
            <em>${tournamentAdminDate(match.scheduled_at)}</em></section>
        <b>${divisionAdminStatusLabel(match.status)}</b>
        <form data-tournament-result="${divisionEscape(match.id)}">
            <input name="player_a_score" type="number" min="0" max="99"
                value="${match.player_a_score ?? ""}" placeholder="A" required>
            <span>:</span>
            <input name="player_b_score" type="number" min="0" max="99"
                value="${match.player_b_score ?? ""}" placeholder="B" required>
            <button type="submit">${match.status === "FINISHED" ? "Natijani tahrirlash" : "Natijani yozish"}</button>
        </form>
    </article>`).join("");
}

function tournamentAdminDashboardMarkup() {
    const item = tournamentAdminState.tournament;
    const overview = tournamentAdminState.overview || {};
    const mode = item.group_mode === "POINTS" ? "Ochkolik" : "Yutqazgan chiqadi";
    return `<div class="division-admin-shell">
        ${tournamentAdminMenu()}
        <section class="division-admin-hero"><div>
            <small>LEVEL_GROUP • ADMIN</small><h2>${divisionEscape(item.name)}</h2>
            <p>${mode} · ${item.group_size} kishilik guruhlar.</p>
        </div><b class="division-admin-season-status">${divisionAdminStatusLabel(item.status)}</b></section>
        <section class="division-admin-summary">
            <article><small>QATNASHUVCHI</small><strong>${Number(overview.participant_count) || 0}/${item.max_participants}</strong></article>
            <article><small>GURUH</small><strong>${item.group_count} × ${item.group_size}</strong></article>
            <article><small>CHIQADI</small><strong>Har guruhdan ${item.qualifiers_per_group}</strong></article>
            <article><small>TICKET</small><strong>${item.ticket_cost} · bir marta</strong></article>
        </section>
        ${item.status === "REGISTRATION"
            ? '<button class="division-admin-primary tournament-start" data-tournament-start>Turnirni boshlash va guruhlarni tuzish</button>' : ""}
        <section class="division-admin-applications"><header><div>
            <small>PARTICIPANTS</small><h3>Qatnashuvchilar</h3></div></header>
            <form class="tournament-admin-search" id="tournamentParticipantSearch">
                <input name="search" maxlength="64" value="${divisionEscape(tournamentAdminState.search)}"
                    placeholder="Username yoki ism bo‘yicha qidirish">
                <button type="submit">Qidirish</button></form>
            <div>${tournamentAdminParticipants()}</div>
            <footer class="tournament-admin-pagination">
                <button data-tournament-page="prev" ${tournamentAdminState.offset ? "" : "disabled"}>Oldingi</button>
                <span>${tournamentAdminState.offset + 1}–${tournamentAdminState.offset + tournamentAdminState.participants.length}</span>
                <button data-tournament-page="next" ${tournamentAdminState.participants.length === tournamentAdminState.limit ? "" : "disabled"}>Keyingi</button>
            </footer>
        </section>
        ${tournamentAdminSchedule()}
        ${item.status === "ACTIVE" ? `<section class="division-admin-applications tournament-finalize-groups">
            <header><div><small>GROUP FINISH</small><h3>Guruhlarni yakunlash</h3></div></header>
            <p>Barcha guruh natijalari yozilgach, belgilangan miqdordagi o‘yinchilar keyingi bosqichga qoladi.</p>
            <button class="division-admin-primary" data-tournament-finalize>Guruhdan chiquvchilarni tasdiqlash</button>
        </section>` : ""}
        <section class="division-admin-applications"><header><div>
            <small>MATCHES</small><h3>O‘yinlar va natijalar</h3></div></header>
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

async function tournamentAdminLoadParticipants() {
    tournamentAdminState.participants = await tournamentAdminApi.applications(
        tournamentAdminState.tournament.id,
        "APPROVED",
        {
            limit: tournamentAdminState.limit,
            offset: tournamentAdminState.offset,
            search: tournamentAdminState.search,
        },
    );
}

function bindTournamentAdmin() {
    const groupSizeSelect = document.querySelector('[name="group_size"]');
    const qualifierSelect = document.querySelector('[name="qualifiers_per_group"]');
    const syncQualifierOptions = () => {
        if (!groupSizeSelect || !qualifierSelect) return;
        const size = Number(groupSizeSelect.value);
        [...qualifierSelect.options].forEach((option) => {
            option.disabled = Number(option.value) >= size;
        });
        if (Number(qualifierSelect.value) >= size) {
            qualifierSelect.value = String(size === 4 ? 2 : 4);
        }
    };
    groupSizeSelect?.addEventListener("change", syncQualifierOptions);
    syncQualifierOptions();
    document.getElementById("tournamentCreateForm")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const maxParticipants = Number(data.get("max_participants"));
        const groupSize = Number(data.get("group_size"));
        const qualifiers = Number(data.get("qualifiers_per_group"));
        if (maxParticipants % groupSize) {
            Modal.error("Ishtirokchilar soni guruh hajmiga to‘liq bo‘linishi kerak.");
            return;
        }
        if (qualifiers >= groupSize) {
            Modal.error("Guruhdan chiqadiganlar soni guruh hajmidan kam bo‘lishi kerak.");
            return;
        }
        await tournamentAdminRun(async () => {
            tournamentAdminState.tournament = await tournamentAdminApi.create({
                name: String(data.get("name")).trim(),
                format: "GROUP_PLAYOFF",
                max_participants: maxParticipants,
                ticket_cost: Number(data.get("ticket_cost")),
                group_count: null,
                group_size: groupSize,
                group_mode: String(data.get("group_mode")),
                qualifiers_per_group: qualifiers,
                registration_opens_at: new Date().toISOString(),
                registration_closes_at: new Date(data.get("registration_closes_at")).toISOString(),
                starts_at: new Date(data.get("starts_at")).toISOString(),
                ends_at: new Date(data.get("ends_at")).toISOString(),
            });
            await loadTournamentAdminPage();
        });
    });
    document.getElementById("tournamentParticipantSearch")?.addEventListener("submit", (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        tournamentAdminRun(async () => {
            tournamentAdminState.search = String(data.get("search") || "").trim();
            tournamentAdminState.offset = 0;
            await tournamentAdminLoadParticipants();
            tournamentAdminRender();
        });
    });
    document.querySelectorAll("[data-tournament-page]").forEach((button) =>
        button.addEventListener("click", () => tournamentAdminRun(async () => {
            const direction = button.dataset.tournamentPage === "next" ? 1 : -1;
            tournamentAdminState.offset = Math.max(
                0, tournamentAdminState.offset + direction * tournamentAdminState.limit,
            );
            await tournamentAdminLoadParticipants();
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
                group_name: String(data.get("group_name") || "").trim() || null,
                scheduled_at: new Date(data.get("scheduled_at")).toISOString(),
            });
            await loadTournamentAdminPage();
        });
    });
    document.querySelectorAll("[data-tournament-result]").forEach((form) =>
        form.addEventListener("submit", (event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            tournamentAdminRun(async () => {
                await tournamentAdminApi.result(
                    tournamentAdminState.tournament.id,
                    event.currentTarget.dataset.tournamentResult,
                    {
                        player_a_score: Number(data.get("player_a_score")),
                        player_b_score: Number(data.get("player_b_score")),
                    },
                );
                await loadTournamentAdminPage();
            });
        }));
    document.querySelector("[data-tournament-start]")?.addEventListener("click", () =>
        tournamentAdminRun(async () => {
            await tournamentAdminApi.start(tournamentAdminState.tournament.id);
            await loadTournamentAdminPage();
        }));
    document.querySelector("[data-tournament-finalize]")?.addEventListener("click", () =>
        tournamentAdminRun(async () => {
            const result = await tournamentAdminApi.finalizeGroups(
                tournamentAdminState.tournament.id,
            );
            Modal.success(
                `${result.qualified_players} o‘yinchi keyingi bosqichga chiqdi.`,
            );
            await loadTournamentAdminPage();
        }));
}

async function loadTournamentAdminPage() {
    Navbar.setActive("");
    showPage("tournamentAdminPage", "Turnir Admin");
    const page = document.getElementById("tournamentAdminPage");
    page.innerHTML = '<div class="division-admin-loading">Turnir yuklanmoqda…</div>';
    try {
        const overview = await tournamentAdminApi.current();
        tournamentAdminState.overview = overview || null;
        tournamentAdminState.tournament = overview?.tournament || null;
        tournamentAdminState.matches = overview?.matches || [];
        tournamentAdminState.participants = [];
        if (tournamentAdminState.tournament) await tournamentAdminLoadParticipants();
        tournamentAdminRender();
    } catch (error) {
        page.innerHTML = `<div class="division-admin-shell"><section class="division-admin-error">
            <span>⚠</span><h2>Turnir yuklanmadi</h2><p>${divisionEscape(error.message)}</p>
        </section></div>`;
    }
}
