function tournamentFormatLabel(value) {
    return value === "GROUP_PLAYOFF" ? "Guruh + pley-off" : "Olimpik";
}

function tournamentStatusLabel(value) {
    return ({
        REGISTRATION: "Ro‘yxatdan o‘tish",
        ACTIVE: "Davom etmoqda",
        FINISHED: "Yakunlangan",
        CANCELLED: "Bekor qilingan",
        PENDING: "Ko‘rib chiqilmoqda",
        APPROVED: "Tasdiqlangan",
        REJECTED: "Rad etilgan",
        ELIMINATED: "Musobaqani yakunladi",
        WITHDRAWN: "Chiqib ketgan",
        SCHEDULED: "Rejalashtirilgan",
        READY: "Arena tayyor",
        PLAYING: "O‘yin davom etmoqda",
    })[value] || String(value || "—");
}

function normalizeTournamentParticipant(value) {
    if (!value) return null;
    return {
        id: Number(value.id) || 0,
        telegramId: Number(value.telegram_id) || 0,
        status: String(value.status || ""),
        seed: value.seed == null ? null : Number(value.seed),
        groupName: value.group_name || null,
        played: Number(value.played) || 0,
        wins: Number(value.wins) || 0,
        losses: Number(value.losses) || 0,
        points: Number(value.points) || 0,
        advancedRound: Number(value.advanced_round) || 0,
        username: value.username || null,
        name: [value.first_name, value.last_name].filter(Boolean).join(" ")
            || value.username || "O‘yinchi",
    };
}

function normalizeTournamentMatch(value) {
    return {
        id: String(value?.id || ""),
        playerAId: Number(value?.player_a_id) || 0,
        playerBId: Number(value?.player_b_id) || 0,
        roundNumber: Number(value?.round_number) || 1,
        roundName: String(value?.round_name || "Bosqich"),
        groupName: value?.group_name || null,
        scheduledAt: value?.scheduled_at || null,
        status: String(value?.status || "SCHEDULED"),
        arenaMatchId: value?.arena_match_id == null
            ? null : Number(value.arena_match_id),
        winnerId: value?.winner_id == null ? null : Number(value.winner_id),
        playerAScore: value?.player_a_score == null
            ? null : Number(value.player_a_score),
        playerBScore: value?.player_b_score == null
            ? null : Number(value.player_b_score),
    };
}

function normalizeTournamentOverview(value) {
    const item = value?.tournament;
    return {
        tournament: item ? {
            id: Number(item.id),
            name: String(item.name || "LEVEL Cup"),
            format: String(item.format || "SINGLE_ELIMINATION"),
            status: String(item.status || ""),
            maxParticipants: Number(item.max_participants) || 0,
            ticketCost: Number(item.ticket_cost) || 10,
            groupCount: item.group_count == null ? null : Number(item.group_count),
            qualifiersPerGroup: item.qualifiers_per_group == null
                ? null : Number(item.qualifiers_per_group),
            registrationOpensAt: item.registration_opens_at || null,
            registrationClosesAt: item.registration_closes_at || null,
            startsAt: item.starts_at || null,
            endsAt: item.ends_at || null,
        } : null,
        participant: normalizeTournamentParticipant(value?.participant),
        ticketBalance: Math.max(0, Number(value?.tournament_tickets) || 0),
        participants: Array.isArray(value?.participants)
            ? value.participants.map(normalizeTournamentParticipant) : [],
        matches: Array.isArray(value?.matches)
            ? value.matches.map(normalizeTournamentMatch) : [],
    };
}

function tournamentParticipantMap(participants) {
    return new Map((participants || []).map((item) => [item.telegramId, item]));
}

function tournamentPlayerName(participants, telegramId) {
    const player = tournamentParticipantMap(participants).get(Number(telegramId));
    return player?.name || player?.username || `Player ${telegramId}`;
}

function tournamentRegistrationState(overview, now = Date.now()) {
    const item = overview?.tournament;
    const participant = overview?.participant;
    if (!item) return { enabled: false, label: "Hozircha turnir yo‘q" };
    if (participant) {
        return {
            enabled: false,
            label: tournamentStatusLabel(participant.status),
        };
    }
    const opens = new Date(item.registrationOpensAt).getTime();
    const closes = new Date(item.registrationClosesAt).getTime();
    if (item.status !== "REGISTRATION" || now > closes) {
        return { enabled: false, label: "Arizalar yopilgan" };
    }
    if (Number.isFinite(opens) && now < opens) {
        return { enabled: false, label: "Ro‘yxat hali ochilmagan" };
    }
    if ((Number(overview?.ticketBalance) || 0) < item.ticketCost) {
        return {
            enabled: false,
            label: `Kamida ${item.ticketCost} ticket kerak`,
        };
    }
    return { enabled: true, label: "Turnirga ariza yuborish" };
}

function tournamentGroupStandings(participants) {
    const groups = {};
    (participants || []).filter((item) => item.groupName).forEach((item) => {
        if (!groups[item.groupName]) groups[item.groupName] = [];
        groups[item.groupName].push(item);
    });
    Object.values(groups).forEach((rows) => rows.sort((a, b) =>
        b.points - a.points || b.wins - a.wins || a.losses - b.losses
        || a.played - b.played || a.name.localeCompare(b.name)));
    return groups;
}

function tournamentBracketRounds(matches) {
    const rounds = {};
    (matches || []).filter((match) => !match.groupName).forEach((match) => {
        if (!rounds[match.roundNumber]) rounds[match.roundNumber] = [];
        rounds[match.roundNumber].push(match);
    });
    return Object.keys(rounds).sort((a, b) => Number(a) - Number(b)).map((key) => ({
        roundNumber: Number(key),
        name: rounds[key][0]?.roundName || `${key}-bosqich`,
        matches: rounds[key].sort((a, b) =>
            new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()),
    }));
}

function tournamentMyMatch(overview, telegramId, now = Date.now()) {
    const mine = (overview?.matches || []).filter((match) =>
        [match.playerAId, match.playerBId].includes(Number(telegramId)));
    const priority = { READY: 0, PLAYING: 1, SCHEDULED: 2, FINISHED: 3, CANCELLED: 4 };
    return mine.sort((a, b) => {
        const status = (priority[a.status] ?? 9) - (priority[b.status] ?? 9);
        if (status) return status;
        const aTime = new Date(a.scheduledAt).getTime();
        const bTime = new Date(b.scheduledAt).getTime();
        if (a.status === "FINISHED") return bTime - aTime;
        const aFuture = aTime >= now ? 0 : 1;
        const bFuture = bTime >= now ? 0 : 1;
        return aFuture - bFuture || Math.abs(aTime - now) - Math.abs(bTime - now);
    })[0] || null;
}

function tournamentCanOpenArena(match, telegramId) {
    return Boolean(match?.status === "READY" && match.arenaMatchId
        && [match.playerAId, match.playerBId].includes(Number(telegramId)));
}

function tournamentCountdown(value, now = Date.now()) {
    let seconds = Math.floor((new Date(value).getTime() - now) / 1000);
    if (!Number.isFinite(seconds)) return "Vaqt belgilanmagan";
    if (seconds <= 0) return "Boshlanish vaqti keldi";
    const days = Math.floor(seconds / 86400);
    seconds %= 86400;
    const hours = Math.floor(seconds / 3600);
    seconds %= 3600;
    const minutes = Math.floor(seconds / 60);
    seconds %= 60;
    return days > 0
        ? `${days} kun ${hours} soat ${minutes} daqiqa`
        : `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
