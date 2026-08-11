function divisionUiEnabled() {
    const preview = new URLSearchParams(globalThis.location?.search || "")
        .get("division_preview");
    return preview === "1"
        || (typeof GLOBAL_DIVISION_UI_ENABLED !== "undefined"
            && GLOBAL_DIVISION_UI_ENABLED === true);
}

function divisionEscape(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function normalizeDivisionOverview(value) {
    return {
        season: value?.season ? normalizeDivisionSeason(value.season) : null,
        participant: value?.participant
            ? normalizeDivisionParticipant(value.participant) : null,
    };
}

function normalizeDivisionSeason(value) {
    return {
        id: Number(value.id),
        name: String(value.name || "Global Division"),
        status: String(value.status || ""),
        durationDays: Number(value.duration_days) || 30,
        ticketCost: Number(value.ticket_cost) || 1,
        pointsForWin: Number(value.points_for_win) || 3,
        pointsForLoss: Number(value.points_for_loss) || 0,
        registrationClosesAt: value.registration_closes_at || null,
        startsAt: value.starts_at || null,
        endsAt: value.ends_at || null,
    };
}

function normalizeDivisionParticipant(value) {
    return {
        id: Number(value.id),
        status: String(value.status || ""),
        played: Number(value.matches_played) || 0,
        wins: Number(value.wins) || 0,
        losses: Number(value.losses) || 0,
        points: Number(value.points) || 0,
        goalsFor: Number(value.goals_for) || 0,
        goalsAgainst: Number(value.goals_against) || 0,
    };
}

function normalizeDivisionMatch(value) {
    if (!value) return null;
    return {
        id: String(value.id || ""),
        status: String(value.status || ""),
        playerAId: Number(value.player_a_id) || 0,
        playerBId: value.player_b_id == null ? null : Number(value.player_b_id),
        playerATicketState: String(value.player_a_ticket_state || ""),
        playerBTicketState: value.player_b_ticket_state || null,
        arenaMatchId: value.arena_match_id == null
            ? null : Number(value.arena_match_id),
        matchedAt: value.matched_at || null,
    };
}

function normalizeDivisionStandings(value) {
    return Array.isArray(value?.items) ? value.items.map((item) => ({
        rank: Number(item.rank) || 0,
        telegramId: Number(item.telegram_id) || 0,
        username: item.username || null,
        name: [item.first_name, item.last_name].filter(Boolean).join(" ")
            || item.username || "O‘yinchi",
        played: Number(item.matches_played) || 0,
        wins: Number(item.wins) || 0,
        losses: Number(item.losses) || 0,
        points: Number(item.points) || 0,
        goalDifference: Number(item.goal_difference) || 0,
    })) : [];
}

function divisionRemaining(endAt) {
    const milliseconds = new Date(endAt).getTime() - Date.now();
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) return "Yakunlangan";
    const days = Math.ceil(milliseconds / 86400000);
    return days + " kun qoldi";
}
