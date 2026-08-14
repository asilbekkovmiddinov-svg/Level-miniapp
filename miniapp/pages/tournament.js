const tournamentState = {
    overview: null,
    busy: false,
    refreshing: false,
    countdownTimer: null,
    refreshTimer: null,
};

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
        <p>${tournamentFormatLabel(item.format)} formatida. Har matchda penalti majburiy, durang yo‘q.</p>
        <div class="tournament-facts">
            <article><small>FORMAT</small><strong>${tournamentFormatLabel(item.format)}</strong></article>
            <article><small>ISHTIROKCHI</small><strong>${overview.participants.length}/${item.maxParticipants}</strong></article>
            <article><small>MATCH</small><strong>${overview.matches.length}</strong></article>
            <article><small>KIRISH</small><strong>${item.ticketCost} ticket</strong></article>
        </div>
        <footer><span>Ro‘yxat yopiladi</span><b>${tournamentDate(item.registrationClosesAt)}</b></footer>
    </section>`;
}

function tournamentApplication(overview) {
    const participant = overview.participant;
    const action = tournamentRegistrationState(overview);
    const assignment = participant?.groupName
        ? `Guruh ${divisionEscape(participant.groupName)}`
        : participant?.seed ? `Seed #${participant.seed}` : "Taqsimot kutilmoqda";
    return `<section class="tournament-card tournament-application">
        <header><div><small>QATNASHISH</small><h3>Turnir arizasi</h3></div>
            ${participant ? `<b class="participant-${divisionEscape(participant.status.toLowerCase())}">
                ${tournamentStatusLabel(participant.status)}</b>` : ""}
        </header>
        <p>${participant
            ? `Sizning joylashuvingiz: <strong>${assignment}</strong>. Admin qarori va jadval shu sahifada yangilanadi.`
            : `Ariza yuboring. Admin tasdiqlagach seed yoki guruhingiz va raqibingiz ko‘rinadi.`}</p>
        <div class="tournament-ticket-balance"><span>Sizdagi Tournament Ticket</span>
            <strong>${overview.ticketBalance}/${overview.tournament.ticketCost}</strong></div>
        <button class="tournament-primary" data-tournament-apply
            ${action.enabled ? "" : "disabled"}>${divisionEscape(action.label)}</button>
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
        <p>Admin raqib va vaqtni biriktirgach shu yerda ko‘rinadi.</p>
    </section>`;
    const isMine = [match.playerAId, match.playerBId].includes(Number(TELEGRAM_ID));
    const opponentId = match.playerAId === Number(TELEGRAM_ID)
        ? match.playerBId : match.playerAId;
    const opponent = tournamentPlayerName(overview.participants, opponentId);
    const canEnter = isMine && match.arenaMatchId
        && ["READY", "PLAYING"].includes(match.status);
    return `<section class="tournament-card tournament-my-match">
        <header><div><small>SIZNING MATCHINGIZ</small><h3>${divisionEscape(match.roundName)}</h3></div>
            <b class="match-${divisionEscape(match.status.toLowerCase())}">${tournamentStatusLabel(match.status)}</b></header>
        <div class="tournament-opponent"><span>Raqib</span><strong>${divisionEscape(opponent)}</strong></div>
        ${tournamentMatchPlayers(match, overview.participants, TELEGRAM_ID)}
        <div class="tournament-match-time"><span>📅 ${tournamentDate(match.scheduledAt)}</span>
            <b data-tournament-countdown="${divisionEscape(match.scheduledAt)}">
                ${tournamentCountdown(match.scheduledAt)}</b></div>
        ${canEnter ? `<button class="tournament-primary arena-ready" data-tournament-arena>
            ${match.status === "PLAYING" ? "Matchni davom ettirish" : "Arena matchini ochish"}</button>`
            : `<button class="tournament-primary" disabled>${match.status === "SCHEDULED"
                ? "Admin Arena’da ochishini kuting" : tournamentStatusLabel(match.status)}</button>`}
    </section>`;
}

function tournamentPersonal(overview) {
    const participant = overview.participant;
    if (!participant || !["APPROVED", "ELIMINATED", "WITHDRAWN"].includes(participant.status)) {
        return "";
    }
    const assignment = participant.groupName
        ? `<span>GURUH<strong>${divisionEscape(participant.groupName)}</strong></span>`
        : `<span>SEED<strong>#${participant.seed || "—"}</strong></span>`;
    return `<section class="tournament-personal">
        ${assignment}<span>O‘YIN<strong>${participant.played}</strong></span>
        <span>G‘ALABA<strong>${participant.wins}</strong></span>
        <span>OCHKO<strong>${participant.points}</strong></span>
    </section>${tournamentMyMatchCard(overview)}`;
}

function tournamentGroupTables(overview) {
    if (overview.tournament.format !== "GROUP_PLAYOFF") return "";
    const groups = tournamentGroupStandings(overview.participants);
    const names = Object.keys(groups).sort();
    return `<section class="tournament-section"><header><div><small>GROUP STAGE</small><h3>Guruh reytingi</h3></div>
        <b>${overview.tournament.qualifiersPerGroup} ta yo‘llanma</b></header>
        ${names.length ? `<div class="tournament-groups">${names.map((name) => `
            <article class="tournament-group"><h4>Guruh ${divisionEscape(name)}</h4>
                <div class="tournament-standing-head"><span>#</span><span>O‘yinchi</span><span>O‘</span><span>G‘</span><span>Ochko</span></div>
                ${groups[name].map((row, index) => `<div class="tournament-standing-row
                    ${row.telegramId === Number(TELEGRAM_ID) ? "is-me" : ""}
                    ${index < overview.tournament.qualifiersPerGroup ? "is-qualified" : ""}">
                    <span>${index + 1}</span><b>${divisionEscape(row.name)}</b>
                    <span>${row.played}</span><span>${row.wins}</span><strong>${row.points}</strong>
                </div>`).join("")}
            </article>`).join("")}</div>`
            : '<div class="tournament-empty">Guruhlar hali shakllanmagan.</div>'}
    </section>`;
}

function tournamentBracket(overview) {
    const rounds = tournamentBracketRounds(overview.matches);
    const title = overview.tournament.format === "GROUP_PLAYOFF"
        ? "Pley-off bracket" : "Olimpik bracket";
    return `<section class="tournament-section tournament-bracket"><header><div>
        <small>KNOCKOUT</small><h3>${title}</h3></div><b>Durang yo‘q</b></header>
        ${rounds.length ? `<div class="tournament-rounds">${rounds.map((round) => `
            <article class="tournament-round"><h4><span>${round.roundNumber}</span>${divisionEscape(round.name)}</h4>
                ${round.matches.map((match) => `<div class="tournament-bracket-match">
                    ${tournamentMatchPlayers(match, overview.participants, TELEGRAM_ID)}
                    <footer><span>${tournamentDate(match.scheduledAt)}</span>
                        <b>${tournamentStatusLabel(match.status)}</b></footer>
                </div>`).join("")}</article>`).join("")}</div>`
            : '<div class="tournament-empty">Bracket matchlari hali kiritilmagan.</div>'}
    </section>`;
}

function tournamentSchedule(overview) {
    const matches = [...overview.matches].sort((a, b) =>
        new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
    return `<section class="tournament-section tournament-schedule"><header><div>
        <small>FULL SCHEDULE</small><h3>O‘yinlar va natijalar</h3></div><b>${matches.length} match</b></header>
        ${matches.length ? `<div>${matches.map((match) => `<article>
            <header><span>${divisionEscape(match.roundName)}${match.groupName
                ? ` · Guruh ${divisionEscape(match.groupName)}` : ""}</span>
                <b>${tournamentStatusLabel(match.status)}</b></header>
            ${tournamentMatchPlayers(match, overview.participants, TELEGRAM_ID)}
            <footer>${tournamentDate(match.scheduledAt)}</footer>
        </article>`).join("")}</div>`
            : '<div class="tournament-empty">Match jadvali hali e’lon qilinmagan.</div>'}
    </section>`;
}

function tournamentRender() {
    const root = document.getElementById("arenaPage");
    const overview = tournamentState.overview;
    if (!root) return;
    if (!overview?.tournament) {
        root.innerHTML = tournamentPageMarkup(`<section class="tournament-card tournament-empty-state">
            <span>🏆</span><small>LEVEL_GROUP TURNIRLARI</small><h2>Yangi turnir tez orada</h2>
            <p>Admin yangi kubok e’lon qilganda ariza shu sahifada ochiladi.</p>
            <button class="tournament-secondary" data-tournament-retry>Yangilash</button>
        </section>`);
    } else {
        root.innerHTML = tournamentPageMarkup(`${tournamentHero(overview)}
            ${tournamentApplication(overview)}${tournamentPersonal(overview)}
            ${tournamentGroupTables(overview)}${tournamentBracket(overview)}
            ${tournamentSchedule(overview)}`);
    }
    tournamentBind(root);
    tournamentStartCountdown();
}

function tournamentBind(root) {
    bindCompetitionTabs(root);
    root.querySelector("[data-tournament-retry]")?.addEventListener("click", loadTournamentPage);
    root.querySelector("[data-tournament-apply]")?.addEventListener("click", tournamentApply);
    root.querySelector("[data-tournament-arena]")?.addEventListener("click", async () => {
        tournamentStopTimers();
        await loadArenaV3Page();
    });
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
            tournamentState.overview = await tournamentApiClient.overview();
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
        tournamentState.overview.participant = await tournamentApiClient.apply(
            tournamentState.overview.tournament.id,
        );
        tournamentRender();
        Modal.alert("Turnir", "Arizangiz adminga yuborildi.");
    } catch (error) {
        Modal.error(error?.message || "Ariza yuborilmadi.");
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
        tournamentState.overview = await tournamentApiClient.overview();
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
