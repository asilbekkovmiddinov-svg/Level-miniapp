const tournamentState = {
    overview: null,
    tournaments: [],
    selectedId: null,
    busy: false,
    refreshing: false,
    countdownTimer: null,
    refreshTimer: null,
};

function tournamentPicker() {
    if (!tournamentState.tournaments.length) return "";
    const sections = [
        ["Faol turnirlar", tournamentState.tournaments.filter((item) =>
            ["REGISTRATION", "ACTIVE"].includes(item.status))],
        ["Tugagan turnirlar", tournamentState.tournaments.filter((item) =>
            ["FINISHED", "CANCELLED"].includes(item.status))],
    ];
    return `<section class="tournament-picker">${sections.map(([title, items]) => `
        <div><small>${title}</small>${items.length ? items.map((item) => `
            <button type="button" data-tournament-select="${item.id}"
                class="${Number(tournamentState.selectedId) === item.id ? "active" : ""}">
                <b>${divisionEscape(item.name)}</b>
                <span>${tournamentStatusLabel(item.status)}</span>
            </button>`).join("") : "<em>Hozircha yo‘q</em>"}</div>`).join("")}</section>`;
}

function tournamentDate(value) {
    if (!value) return "—";
    return new Intl.DateTimeFormat("uz-UZ", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
    }).format(new Date(value));
}

function tournamentPageMarkup(content) {
    return `<div class="division-page tournament-page">
        ${competitionTabsMarkup("tournament")}${content}
    </div>`;
}

function tournamentHero(overview) {
    const item = overview.tournament;
    return `<section class="tournament-hero">
        <span class="tournament-hero-glow" aria-hidden="true"></span>
        <header><small>LEVEL_GROUP • OFFICIAL CUP</small>
            <b class="status-${divisionEscape(item.status.toLowerCase())}">${tournamentStatusLabel(item.status)}</b>
        </header>
        <h2>${divisionEscape(item.name)}</h2>
        <p>${tournamentGroupModeLabel(item.groupMode)} · ${item.groupSize} kishilik guruhlar · natijani admin yozadi.</p>
        <div class="tournament-facts">
            <article><small>QATNASHUVCHI</small><strong>${overview.participantCount}/${item.maxParticipants}</strong></article>
            <article><small>GURUH</small><strong>${item.groupCount} × ${item.groupSize}</strong></article>
            <article><small>CHIQADI</small><strong>${item.qualifiersPerGroup} o‘yinchi</strong></article>
            <article><small>DAVOMIYLIGI</small><strong>${item.durationDays} kun</strong></article>
        </div>
        <footer><span>${item.status === "ACTIVE" ? "Turnir tugaydi" : "Ro‘yxat yopiladi"}</span>
            <b>${tournamentDate(item.status === "ACTIVE" ? item.endsAt : item.registrationClosesAt)}</b></footer>
    </section>`;
}

function tournamentApplication(overview) {
    const participant = overview.participant;
    const action = tournamentRegistrationState(overview);
    const assignment = participant?.groupName
        ? `Guruh ${divisionEscape(participant.groupName)}`
        : "Turnir boshlanganda guruh beriladi";
    const purchaseEntry = overview.tournament.entryMode === "COIN_PURCHASE";
    return `<section class="tournament-card tournament-application">
        <header><div><small>QATNASHISH</small><h3>Turnir joyi</h3></div>
            ${participant ? `<b class="participant-${divisionEscape(participant.status.toLowerCase())}">
                ${tournamentStatusLabel(participant.status)}</b>` : ""}
        </header>
        <p>${participant
            ? `Joyingiz band qilindi. ${assignment}.`
            : purchaseEntry
                ? `Bitta xaridda botdan kamida ${overview.tournament.minimumCoinPurchase} coin oling. Siz avtomatik ro‘yxatga qo‘shilasiz va coin miqdorining 10%icha Arena Ticket olasiz.`
                : `Qatnashish ticketi bir marta olinadi: ${overview.tournament.ticketCost} ticket. Har matchda ticket olinmaydi.`}</p>
        <div class="tournament-ticket-balance"><span>Sizdagi Tournament Ticket</span>
            <strong>${overview.ticketBalance}</strong></div>
        ${purchaseEntry ? `<button class="tournament-primary" type="button" onclick="openPage('shop')"
            ${participant ? "disabled" : ""}>${participant ? "Ro‘yxatga qo‘shilgansiz" : "300+ coin olish"}</button>`
            : `<button class="tournament-primary" data-tournament-apply
                ${action.enabled ? "" : "disabled"}>${divisionEscape(action.label)}</button>`}
    </section>`;
}

function tournamentMatchPlayers(match, participants, telegramId = 0) {
    const a = tournamentPlayerName(participants, match.playerAId);
    const b = tournamentPlayerName(participants, match.playerBId);
    const score = match.playerAScore == null || match.playerBScore == null
        ? "VS" : `${match.playerAScore}:${match.playerBScore}`;
    return `<div class="tournament-versus">
        <span class="${match.playerAId === Number(telegramId) ? "is-me" : ""}">
            <i>${divisionEscape(a).slice(0, 1).toUpperCase()}</i><b>${divisionEscape(a)}</b>
        </span><strong>${score}</strong>
        <span class="${match.playerBId === Number(telegramId) ? "is-me" : ""}">
            <i>${divisionEscape(b).slice(0, 1).toUpperCase()}</i><b>${divisionEscape(b)}</b>
        </span>
    </div>`;
}

function tournamentMyMatchCard(overview) {
    const match = tournamentMyMatch(overview, TELEGRAM_ID);
    if (!match) return `<section class="tournament-card tournament-my-match">
        <small>NAVBATDAGI MATCH</small><h3>Jadval kutilmoqda</h3>
        <p>Admin raqibingiz va match vaqtini belgilaydi.</p>
    </section>`;
    return `<section class="tournament-card tournament-my-match">
        <header><div><small>SIZNING MATCHINGIZ</small><h3>${divisionEscape(match.roundName)}</h3></div>
            <b class="match-${divisionEscape(match.status.toLowerCase())}">${tournamentStatusLabel(match.status)}</b></header>
        ${tournamentMatchPlayers(match, overview.participants, TELEGRAM_ID)}
        <div class="tournament-match-time"><span>📅 ${tournamentDate(match.scheduledAt)}</span>
            <b data-tournament-countdown="${divisionEscape(match.scheduledAt)}">
                ${tournamentCountdown(match.scheduledAt)}</b></div>
        <p class="tournament-manual-note">${match.status === "FINISHED"
            ? "Natija admin tomonidan kiritildi."
            : "Belgilangan vaqtda eFootball’da o‘ynang. Natijani admin kiritadi."}</p>
    </section>`;
}

function tournamentPersonal(overview) {
    const participant = overview.participant;
    if (!participant || !["APPROVED", "ELIMINATED", "WITHDRAWN"].includes(participant.status)) {
        return "";
    }
    return `<section class="tournament-personal">
        <span>GURUH<strong>${divisionEscape(participant.groupName || "—")}</strong></span>
        <span>O‘YIN<strong>${participant.played}</strong></span>
        <span>G‘ALABA<strong>${participant.wins}</strong></span>
        <span>OCHKO<strong>${participant.points}</strong></span>
    </section>${tournamentMyMatchCard(overview)}`;
}

function tournamentGroupTables(overview) {
    const groups = tournamentGroupStandings(overview.participants);
    const names = Object.keys(groups).sort();
    const isPoints = overview.tournament.groupMode === "POINTS";
    return `<section class="tournament-section"><header><div>
        <small>GROUPS · ${divisionEscape(tournamentGroupModeLabel(overview.tournament.groupMode))}</small>
        <h3>Guruhlar</h3></div>
        <b>Top ${overview.tournament.qualifiersPerGroup} chiqadi</b></header>
        ${names.length ? `<div class="tournament-groups">${names.map((name) => `
            <article class="tournament-group"><h4>Guruh ${divisionEscape(name)}</h4>
                <div class="tournament-standing-head"><span>#</span><span>O‘yinchi</span><span>O‘</span><span>G‘</span><span>${isPoints ? "Ochko" : "Holat"}</span></div>
                ${groups[name].map((row, index) => `<div class="tournament-standing-row
                    ${row.telegramId === Number(TELEGRAM_ID) ? "is-me" : ""}
                    ${index < overview.tournament.qualifiersPerGroup ? "is-qualified" : ""}">
                    <span>${index + 1}</span><b>${divisionEscape(row.name)}</b>
                    <span>${row.played}</span><span>${row.wins}</span>
                    <strong>${isPoints ? row.points : row.status === "ELIMINATED" ? "OUT" : "IN"}</strong>
                </div>`).join("")}
            </article>`).join("")}</div>`
            : '<div class="tournament-empty">Turnir boshlanganda guruhlar ko‘rinadi.</div>'}
    </section>`;
}

function tournamentOverallStandings(overview) {
    const rows = [...overview.participants].sort((a, b) =>
        b.points - a.points || b.wins - a.wins
        || (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst)
        || b.goalsFor - a.goalsFor || a.played - b.played);
    return `<section class="tournament-section"><header><div>
        <small>${overview.tournament.status === "FINISHED" ? "ARCHIVE" : "LIVE"}</small>
        <h3>${overview.tournament.status === "FINISHED" ? "Yakuniy reyting" : "Umumiy reyting"}</h3>
        </div><b>${rows.length} o‘yinchi</b></header>
        ${rows.length ? `<div class="tournament-group"><div class="tournament-standing-head">
            <span>#</span><span>O‘yinchi</span><span>O‘</span><span>G‘</span><span>Ochko</span></div>
            ${rows.map((row, index) => `<div class="tournament-standing-row
                ${row.telegramId === Number(TELEGRAM_ID) ? "is-me" : ""}">
                <span>${index + 1}</span><b>${divisionEscape(row.name)}</b>
                <span>${row.played}</span><span>${row.wins}</span><strong>${row.points}</strong>
            </div>`).join("")}</div>`
            : '<div class="tournament-empty">Reyting hali shakllanmagan.</div>'}
    </section>`;
}

function tournamentSchedule(overview) {
    const matches = [...overview.matches].sort((a, b) =>
        new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
    return `<section class="tournament-section tournament-schedule"><header><div>
        <small>ADMIN SCHEDULE</small><h3>O‘yinlar va natijalar</h3></div><b>${overview.matchCount} match</b></header>
        ${matches.length ? `<div>${matches.map((match) => `<article>
            <header><span>${divisionEscape(match.roundName)}${match.groupName
                ? ` · Guruh ${divisionEscape(match.groupName)}` : ""}</span>
                <b>${tournamentStatusLabel(match.status)}</b></header>
            ${tournamentMatchPlayers(match, overview.participants, TELEGRAM_ID)}
            <footer>${tournamentDate(match.scheduledAt)}</footer>
        </article>`).join("")}</div>`
            : '<div class="tournament-empty">Admin hali match vaqtlarini belgilamagan.</div>'}
    </section>`;
}

function tournamentRender() {
    const root = document.getElementById("arenaPage");
    const overview = tournamentState.overview;
    if (!root) return;
    if (!overview?.tournament) {
        root.innerHTML = tournamentPageMarkup(`<section class="tournament-card tournament-empty-state">
            <span>🏆</span><small>LEVEL_GROUP TURNIRLARI</small><h2>Yangi turnir tez orada</h2>
            <p>Admin turnir yaratganda qatnashish shu sahifada ochiladi.</p>
            <button class="tournament-secondary" data-tournament-retry>Yangilash</button>
        </section>`);
    } else {
        root.innerHTML = tournamentPageMarkup(`${tournamentPicker()}${tournamentHero(overview)}
            ${tournamentApplication(overview)}${tournamentPersonal(overview)}
            ${tournamentOverallStandings(overview)}${tournamentGroupTables(overview)}
            ${tournamentSchedule(overview)}`);
    }
    tournamentBind(root);
    tournamentStartCountdown();
}

function tournamentBind(root) {
    bindCompetitionTabs(root);
    root.querySelector("[data-tournament-retry]")?.addEventListener("click", loadTournamentPage);
    root.querySelector("[data-tournament-apply]")?.addEventListener("click", tournamentApply);
    root.querySelectorAll("[data-tournament-select]").forEach((button) =>
        button.addEventListener("click", () => tournamentSelect(Number(button.dataset.tournamentSelect))));
}

function tournamentStartCountdown() {
    if (tournamentState.countdownTimer) clearInterval(tournamentState.countdownTimer);
    const update = () => document.querySelectorAll("[data-tournament-countdown]")
        .forEach((node) => { node.textContent = tournamentCountdown(node.dataset.tournamentCountdown); });
    update();
    tournamentState.countdownTimer = setInterval(update, 1000);
}

function tournamentScheduleRefresh() {
    if (tournamentState.refreshTimer) clearInterval(tournamentState.refreshTimer);
    tournamentState.refreshTimer = setInterval(async () => {
        const root = document.getElementById("arenaPage");
        if (!root?.classList.contains("active-page") || !root.querySelector(".tournament-page")) return;
        if (tournamentState.refreshing || tournamentState.busy) return;
        tournamentState.refreshing = true;
        try {
            tournamentState.overview = await tournamentApiClient.overview(
                tournamentState.selectedId,
            );
            tournamentRender();
        } catch (error) {
            console.warn("Tournament refresh:", error);
        } finally {
            tournamentState.refreshing = false;
        }
    }, 5000);
}

function tournamentStopTimers() {
    if (tournamentState.countdownTimer) clearInterval(tournamentState.countdownTimer);
    if (tournamentState.refreshTimer) clearInterval(tournamentState.refreshTimer);
    tournamentState.countdownTimer = null;
    tournamentState.refreshTimer = null;
}

async function tournamentApply() {
    if (tournamentState.busy || !tournamentState.overview?.tournament) return;
    tournamentState.busy = true;
    Loader.show();
    try {
        await tournamentApiClient.apply(tournamentState.overview.tournament.id);
        tournamentState.overview = await tournamentApiClient.overview(
            tournamentState.selectedId,
        );
        tournamentRender();
        Modal.alert("Turnir", "Joyingiz band qilindi. Qatnashish ticketi bir marta olindi.");
    } catch (error) {
        Modal.error(error?.message || "Turnirga qo‘shilib bo‘lmadi.");
    } finally {
        tournamentState.busy = false;
        Loader.hide();
    }
}

async function tournamentSelect(tournamentId) {
    if (tournamentState.busy || tournamentId === tournamentState.selectedId) return;
    tournamentState.busy = true;
    Loader.show();
    try {
        tournamentState.selectedId = tournamentId;
        tournamentState.overview = await tournamentApiClient.overview(tournamentId);
        tournamentRender();
    } catch (error) {
        Modal.error(error?.message || "Turnir yuklanmadi.");
    } finally {
        tournamentState.busy = false;
        Loader.hide();
    }
}

async function loadTournamentPage() {
    window.divisionController?.stop?.();
    tournamentStopTimers();
    Navbar.setActive("arena");
    showPage("arenaPage", "Arena");
    const root = document.getElementById("arenaPage");
    root.innerHTML = tournamentPageMarkup('<div class="tournament-loading">Turnir yuklanmoqda…</div>');
    bindCompetitionTabs(root);
    try {
        tournamentState.tournaments = await tournamentApiClient.list();
        const current = tournamentState.tournaments.find((item) => item.status === "ACTIVE")
            || tournamentState.tournaments.find((item) => item.status === "REGISTRATION")
            || tournamentState.tournaments[0];
        tournamentState.selectedId = current?.id || null;
        tournamentState.overview = await tournamentApiClient.overview(
            tournamentState.selectedId,
        );
        tournamentRender();
        tournamentScheduleRefresh();
    } catch (error) {
        root.innerHTML = tournamentPageMarkup(`<section class="tournament-card tournament-empty-state">
            <span>⚠️</span><small>TURNIR</small><h2>Ma’lumot yuklanmadi</h2>
            <p>${divisionEscape(error?.message || "Keyinroq qayta urinib ko‘ring.")}</p>
            <button class="tournament-secondary" data-tournament-retry>Qayta urinish</button>
        </section>`);
        tournamentBind(root);
    }
}

window.tournamentController = {
    load: loadTournamentPage,
    stop: tournamentStopTimers,
};
