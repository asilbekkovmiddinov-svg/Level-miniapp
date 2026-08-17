(() => {
    const controller = globalThis.penaltyDuelController;
    if (!controller || controller.__singleChoiceHotfixApplied) return;
    controller.__singleChoiceHotfixApplied = true;

    const formatDetail = (detail) => {
        if (typeof detail === "string" && detail.trim()) return detail;
        if (Array.isArray(detail)) {
            const messages = detail.map((item) => item?.msg || item?.message || item?.detail)
                .filter((item) => typeof item === "string" && item.trim());
            if (messages.length) return messages.join("\n");
        }
        if (detail && typeof detail === "object") return detail.msg || detail.message || detail.detail || "Penalty Duel so‘rovi bajarilmadi.";
        return "Penalty Duel so‘rovi bajarilmadi.";
    };

    controller.api.request = async function request(path, method = "GET", body = null) {
        const initData = telegramInitData();
        if (!initData) throw new Error("Telegram tasdiqlash ma’lumoti topilmadi.");
        const response = await fetch(this.baseUrl + path, {
            method,
            headers: { "X-Telegram-Init-Data": initData, ...(body ? { "Content-Type": "application/json" } : {}) },
            ...(body ? { body: JSON.stringify(body) } : {}),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
            const error = new Error(formatDetail(payload?.detail));
            error.status = response.status;
            throw error;
        }
        return payload;
    };

    controller.applyMatchState = function applyMatchState(match, force = false) {
        if (!match) return;
        const previous = this.match;
        const changed = force || !previous || previous.id !== match.id
            || Number(previous.version) !== Number(match.version)
            || previous.status !== match.status
            || previous.your_role !== match.your_role
            || previous.you_submitted !== match.you_submitted;
        if (!changed) return;
        const resolved = previous?.id === match.id && (match.history?.length || 0) > (previous.history?.length || 0);
        this.match = match;
        this.timeoutRequested = false;
        this.localChoice = { kick: null, keeper: null };
        if (!resolved) return this.renderOnline();

        const last = match.history.at(-1);
        const playerOneAttacked = Number(last.round) % 2 === 1;
        const youAttacked = (match.side === "PLAYER_ONE") === playerOneAttacked;
        const result = youAttacked
            ? { direction: last.your_kick, keeperDirection: last.opponent_keeper, goal: Boolean(last.you_goal) }
            : { direction: last.opponent_kick, keeperDirection: last.your_keeper, goal: Boolean(last.opponent_goal) };
        this.renderOnline({ result });
        clearTimeout(this.animationTimer);
        this.animationTimer = setTimeout(() => this.renderOnline(), 1450);
    };

    controller.renderOnline = function renderOnline(context = {}) {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
        if (!this.match) return this.renderIntro();
        if (this.match.status === "WAITING") return this.renderWaiting();
        if (this.match.status === "FINISHED") return this.renderOnlineResult();
        if (this.match.status === "CANCELLED") return this.renderCancelled();
        if (this.match.you_submitted) {
            this.renderOpponentWaiting(); this.startRoundCountdown(); return;
        }
        const attacking = this.match.your_role === "KICK";
        const instruction = attacking ? "Zarba yo‘nalishini tanlang" : "Darvozabon sakrashini tanlang";
        const subtext = attacking ? "Bir marta bosing — zarba darhol qabul qilinadi" : "Bir marta bosing — qaytarish nuqtasi darhol qabul qilinadi";
        this.root().innerHTML = `<div class="pd-shell pd-game pd-online">
            ${this.onlineScoreboardMarkup(attacking ? "SIZ TEPASIZ" : "SIZ QAYTARASIZ")}
            ${this.pitchMarkup(attacking)}
            <section class="pd-instruction ${attacking ? "attack" : "defend"}"><span>${attacking ? "⚽" : "🧤"}</span><div><strong>${instruction}</strong><small>${subtext}</small></div><b id="pdRoundTimer">30</b></section>
            ${this.recentRoundMarkup()}<div class="pd-rounds" aria-label="Raundlar">${this.onlineRoundsMarkup()}</div></div>`;
        this.startRoundCountdown();
        if (context.result) this.animate(context.result);
    };

    controller.renderOpponentWaiting = function renderOpponentWaiting() {
        const action = this.match?.your_role === "KEEPER" ? "qaytarish nuqtangiz" : "zarbangiz";
        this.root().innerHTML = `<div class="pd-shell pd-game">${this.onlineScoreboardMarkup("JAVOB KUTILMOQDA")}
            <section class="pd-wait-card pd-round-wait"><span class="pd-search-ball">✓</span><small>${this.match.round_number}-ZARBA</small><h2>Tanlov qabul qilindi</h2><p>${action} saqlandi. Endi raqib tanlovi kutilmoqda.</p><strong id="pdRoundTimer">30</strong><div class="pd-search-dots"><i></i><i></i><i></i></div></section>
            ${this.recentRoundMarkup()}<div class="pd-rounds">${this.onlineRoundsMarkup()}</div></div>`;
    };

    controller.chooseOnline = async function chooseOnline(direction) {
        if (this.busy || this.match?.status !== "ACTIVE" || this.match.you_submitted) return;
        const matchId = this.match.id;
        this.busy = true;
        window.Telegram?.WebApp?.HapticFeedback?.selectionChanged?.();
        try {
            const key = globalThis.crypto?.randomUUID?.() || `pd-${Date.now()}-${Math.random().toString(16).slice(2)}`;
            const match = await this.api.choices(matchId, { direction, idempotency_key: key });
            this.localChoice = { kick: null, keeper: null };
            this.applyMatchState(match, true);
        } catch (error) {
            if (error.status === 409) {
                try { const match = await this.api.active(); if (match) this.applyMatchState(match, true); } catch (_syncError) {}
            } else Modal.error(error.message || "Tanlovni yuborib bo‘lmadi.");
        } finally { this.busy = false; }
    };
})();
