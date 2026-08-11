const divisionState = {
    overview: null,
    wallet: null,
    standings: [],
    match: null,
    busy: false,
    pollTimer: null,
};

function divisionStopPolling() {
    if (divisionState.pollTimer) clearTimeout(divisionState.pollTimer);
    divisionState.pollTimer = null;
}

function divisionSchedulePoll() {
    divisionStopPolling();
    if (divisionState.match?.status !== "WAITING") return;
    divisionState.pollTimer = setTimeout(async () => {
        try {
            divisionState.match = await divisionApiClient.activeMatch();
            if (divisionState.match?.arenaMatchId) {
                divisionStopPolling();
                await loadArenaV3Page();
                return;
            }
            renderDivisionPage();
        } catch (error) {
            console.warn("Division polling:", error);
        }
        divisionSchedulePoll();
    }, 3000);
}

function divisionHero(season) {
    return `<section class="division-hero">
        <small>LEVEL_GROUP • GLOBAL LEAGUE</small>
        <h2>Global Division</h2>
        <p>30 kun davomida 1 vs 1 o‘ynang va ochko yig‘ing.</p>
        <div><span>🏆 G‘alaba <b>+${season?.pointsForWin || 3}</b></span>
        <span>🎟 Match <b>${season?.ticketCost || 1} ticket</b></span>
        <span>⏳ <b>${divisionEscape(divisionRemaining(season?.endsAt))}</b></span></div>
    </section>`;
}

function divisionStats(participant) {
    const gd = (participant.goalsFor || 0) - (participant.goalsAgainst || 0);
    return `<section class="division-stats" aria-label="Shaxsiy natijalar">
        <article><small>OCHKO</small><strong>${participant.points}</strong></article>
        <article><small>O‘YIN</small><strong>${participant.played}</strong></article>
        <article><small>G‘ALABA</small><strong>${participant.wins}</strong></article>
        <article><small>MAG‘LUBIYAT</small><strong>${participant.losses}</strong></article>
        <article><small>TO‘PLAR</small><strong>${gd > 0 ? "+" : ""}${gd}</strong></article>
    </section>`;
}

function divisionStandingsTable(rows) {
    if (!rows.length) return `<div class="division-empty">Reyting hali shakllanmagan.</div>`;
    return `<div class="division-table-wrap"><table class="division-table">
        <thead><tr><th>#</th><th>O‘yinchi</th><th>O‘</th><th>G‘</th><th>M</th><th>±</th><th>Ochko</th></tr></thead>
        <tbody>${rows.map((row) => `<tr class="${row.telegramId === Number(TELEGRAM_ID) ? "is-me" : ""}">
            <td><b>${row.rank}</b></td>
            <td><span>${divisionEscape(row.name)}</span>${row.username ? `<small>@${divisionEscape(row.username)}</small>` : ""}</td>
            <td>${row.played}</td><td>${row.wins}</td><td>${row.losses}</td>
            <td>${row.goalDifference > 0 ? "+" : ""}${row.goalDifference}</td><td><b>${row.points}</b></td>
        </tr>`).join("")}</tbody>
    </table></div>`;
}

function divisionWaiting(match) {
    return `<section class="division-waiting" aria-live="polite">
        <div class="division-vs">VS</div>
        <small>TICKET MATCH</small>
        <h2>Raqib qidirilmoqda</h2>
        <p>1 ta Tournament Ticket bloklandi. Raqib topilib match boshlanmaguncha sarflanmaydi.</p>
        <div class="division-dots"><i></i><i></i><i></i></div>
        <button class="division-button secondary" data-division-cancel data-match-id="${divisionEscape(match.id)}">Qidiruvni bekor qilish</button>
    </section>`;
}

function divisionRegistration(overview) {
    const participant = overview.participant;
    const status = participant?.status || "";
    let action = `<button class="division-button" data-division-apply>Ariza yuborish</button>`;
    if (status === "PENDING") action = `<button class="division-button" disabled>Ariza ko‘rib chiqilmoqda</button>`;
    if (status === "REJECTED") action = `<button class="division-button" disabled>Ariza rad etilgan</button>`;
    return `${divisionHero(overview.season)}
        <section class="division-card">
            <small>QATNASHISH</small><h3>Global Division’ga qo‘shiling</h3>
            <p>Barcha o‘yinchilar bitta reytingda. Durang yo‘q: penaltilar majburiy.</p>
            ${action}
        </section>
        <section class="division-rules">
            <article><b>🎟</b><span><strong>1 ticket</strong><small>Har bir match uchun</small></span></article>
            <article><b>⚽</b><span><strong>+3 ochko</strong><small>G‘alaba va texnik g‘alaba</small></span></article>
            <article><b>🛡</b><span><strong>Admin Review</strong><small>Screenshot va appeal saqlanadi</small></span></article>
        </section>`;
}

function divisionDashboard(overview) {
    const participant = overview.participant;
    const wallet = divisionState.wallet || { tournamentTickets: 0, lockedTournamentTickets: 0 };
    const matchAccess = divisionMatchAccess(overview.season, wallet);
    return `${divisionHero(overview.season)}
        <section class="division-wallet">
            <article><small>TOURNAMENT TICKET</small><strong>${wallet.tournamentTickets}</strong><span>Mavjud</span></article>
            <article><small>BLOKLANGAN</small><strong>${wallet.lockedTournamentTickets}</strong><span>Qidiruv yoki matchda</span></article>
        </section>
        ${divisionStats(participant)}
        <section class="division-match-card">
            <small>DIVISION MATCH</small><h3>Raqib bilan o‘ynash</h3>
            <p>Qidiruvda ticket bloklanadi. Match boshlanganda sarflanadi.</p>
            <button class="division-button" data-division-join ${matchAccess.enabled ? "" : "disabled"}>
                ${matchAccess.label}
            </button>
        </section>
        <section class="division-ranking"><header><div><small>GLOBAL STANDINGS</small><h3>Division reytingi</h3></div><span>30 KUN</span></header>
        ${divisionStandingsTable(divisionState.standings)}</section>`;
}

function renderDivisionPage() {
    const root = document.getElementById("arenaPage");
    if (!root) return;
    if (!divisionState.overview?.season) {
        divisionErrorView({
            status: 404,
            message: "Yangi Global Division season tez orada ochiladi.",
        });
        return;
    }
    if (divisionState.match?.status === "WAITING") {
        root.innerHTML = `<div class="division-page">${divisionWaiting(divisionState.match)}</div>`;
    } else if (divisionState.overview?.participant?.status === "APPROVED") {
        root.innerHTML = `<div class="division-page">${divisionDashboard(divisionState.overview)}</div>`;
    } else {
        root.innerHTML = `<div class="division-page">${divisionRegistration(divisionState.overview)}</div>`;
    }
    bindDivisionActions(root);
}

function divisionErrorView(error) {
    const root = document.getElementById("arenaPage");
    if (!root) return;
    const soon = error?.status === 404 || error?.status === 503;
    root.innerHTML = `<div class="division-page"><section class="division-card division-error">
        <b>${soon ? "⚔️" : "⚠️"}</b><small>GLOBAL DIVISION</small>
        <h2>${soon ? "Tez orada" : "Ma’lumot yuklanmadi"}</h2>
        <p>${divisionEscape(error?.message || "Keyinroq qayta urinib ko‘ring.")}</p>
        <button class="division-button secondary" data-division-retry>Qayta urinish</button>
    </section></div>`;
    bindDivisionActions(root);
}

function bindDivisionActions(root) {
    root.querySelector("[data-division-retry]")?.addEventListener("click", loadDivisionPage);
    root.querySelector("[data-division-apply]")?.addEventListener("click", divisionApply);
    root.querySelector("[data-division-join]")?.addEventListener("click", divisionJoin);
    root.querySelector("[data-division-cancel]")?.addEventListener("click", (event) =>
        divisionCancel(event.currentTarget.dataset.matchId));
}

async function divisionRun(action) {
    if (divisionState.busy) return;
    divisionState.busy = true;
    Loader.show();
    try {
        await action();
    } catch (error) {
        console.error(error);
        Modal.error(error?.message || "Amal bajarilmadi.");
    } finally {
        divisionState.busy = false;
        Loader.hide();
    }
}

async function divisionApply() {
    await divisionRun(async () => {
        divisionState.overview.participant = await divisionApiClient.apply();
        renderDivisionPage();
    });
}

async function divisionJoin() {
    await divisionRun(async () => {
        divisionState.match = await divisionApiClient.joinMatchmaking();
        if (divisionState.match?.arenaMatchId) await loadArenaV3Page();
        else {
            renderDivisionPage();
            divisionSchedulePoll();
        }
    });
}

async function divisionCancel(matchId) {
    await divisionRun(async () => {
        await divisionApiClient.cancelWaiting(matchId);
        divisionState.match = null;
        divisionStopPolling();
        [divisionState.wallet, divisionState.standings] = await Promise.all([
            divisionApiClient.wallet(), divisionApiClient.standings(),
        ]);
        renderDivisionPage();
    });
}

async function loadDivisionPage() {
    divisionStopPolling();
    Navbar.setActive("arena");
    showPage("arenaPage", "Global Division");
    const root = document.getElementById("arenaPage");
    root.innerHTML = `<div class="division-page"><div class="division-loading">Division yuklanmoqda…</div></div>`;
    try {
        const [overview, wallet, standings, match] = await Promise.all([
            divisionApiClient.overview(),
            divisionApiClient.wallet().catch(() => null),
            divisionApiClient.standings().catch(() => []),
            divisionApiClient.activeMatch().catch(() => null),
        ]);
        divisionState.overview = overview;
        divisionState.wallet = wallet;
        divisionState.standings = standings;
        divisionState.match = match;
        if (match?.arenaMatchId) {
            await loadArenaV3Page();
            return;
        }
        renderDivisionPage();
        divisionSchedulePoll();
    } catch (error) {
        console.error(error);
        divisionErrorView(error);
    }
}

window.divisionController = {
    load: loadDivisionPage,
    stop: divisionStopPolling,
};
