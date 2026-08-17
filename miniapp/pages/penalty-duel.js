const PENALTY_DIRECTIONS = ["top-left", "top-right", "center", "bottom-left", "bottom-right"];
const PENALTY_FALLBACK_SYNC_MS = 500;
const PENALTY_RECONNECT_MS = 750;

class PenaltyDuelEngine {
    constructor(options = {}) {
        this.totalRounds = Number(options.totalRounds || 5);
        this.rng = options.rng || Math.random;
        this.reset();
    }

    reset() {
        this.round = 1;
        this.playerScore = 0;
        this.opponentScore = 0;
        this.phase = "PLAYER_SHOT";
        this.history = [];
    }

    randomDirection() {
        const index = Math.min(
            PENALTY_DIRECTIONS.length - 1,
            Math.floor(this.rng() * PENALTY_DIRECTIONS.length),
        );
        return PENALTY_DIRECTIONS[index];
    }

    validateDirection(direction) {
        if (!PENALTY_DIRECTIONS.includes(direction)) {
            throw new Error("Noto‘g‘ri zarba yo‘nalishi.");
        }
    }

    playerShot(direction, keeperDirection = this.randomDirection()) {
        if (this.phase !== "PLAYER_SHOT") throw new Error("Hozir darvozabon navbati.");
        this.validateDirection(direction);
        this.validateDirection(keeperDirection);
        const goal = direction !== keeperDirection;
        if (goal) this.playerScore += 1;
        const result = { role: "PLAYER", direction, keeperDirection, goal, round: this.round };
        this.history.push(result);
        this.phase = "PLAYER_KEEPER";
        return result;
    }

    defend(keeperDirection, shotDirection = this.randomDirection()) {
        if (this.phase !== "PLAYER_KEEPER") throw new Error("Hozir zarba berish navbati.");
        this.validateDirection(keeperDirection);
        this.validateDirection(shotDirection);
        const goal = shotDirection !== keeperDirection;
        if (goal) this.opponentScore += 1;
        const result = {
            role: "OPPONENT",
            direction: shotDirection,
            keeperDirection,
            goal,
            round: this.round,
        };
        this.history.push(result);
        if (this.round >= this.totalRounds) this.phase = "FINISHED";
        else {
            this.round += 1;
            this.phase = "PLAYER_SHOT";
        }
        return result;
    }

    outcome() {
        if (this.playerScore > this.opponentScore) return "WIN";
        if (this.playerScore < this.opponentScore) return "LOSS";
        return "DRAW";
    }
}

class PenaltyDuelClient {
    constructor(baseUrl = (typeof API_URL !== "undefined" ? API_URL : "")) {
        this.baseUrl = String(baseUrl).replace(/\/$/, "");
    }

    async request(path, method = "GET", body = null) {
        const initData = telegramInitData();
        if (!initData) throw new Error("Telegram tasdiqlash ma’lumoti topilmadi.");
        const response = await fetch(this.baseUrl + path, {
            method,
            headers: {
                "X-Telegram-Init-Data": initData,
                ...(body ? { "Content-Type": "application/json" } : {}),
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
            const error = new Error(payload?.detail || "Penalty Duel so‘rovi bajarilmadi.");
            error.status = response.status;
            throw error;
        }
        return payload;
    }

    wallet() { return this.request("/wall-rush/wallet"); }
    active() { return this.request("/penalty-duel/matches/active"); }
    join(mode) { return this.request("/penalty-duel/matchmaking/join", "POST", { mode }); }
    choices(matchId, body) {
        return this.request(`/penalty-duel/matches/${matchId}/choices`, "POST", body);
    }
    cancelWaiting(matchId) {
        return this.request(`/penalty-duel/matches/${matchId}/cancel-waiting`, "POST");
    }
    timeout(matchId) {
        return this.request(`/penalty-duel/matches/${matchId}/timeout`, "POST");
    }
    socketUrl() {
        const protocol = this.baseUrl.startsWith("https:") ? "wss:" : "ws:";
        const host = this.baseUrl.replace(/^https?:/, "");
        return `${protocol}${host}/penalty-duel/ws?init_data=${encodeURIComponent(telegramInitData())}`;
    }
}

const penaltyDuelController = {
    api: new PenaltyDuelClient(),
    engine: new PenaltyDuelEngine(),
    match: null,
    wallet: null,
    socket: null,
    syncTimer: null,
    countdownTimer: null,
    animationTimer: null,
    stopped: false,
    syncBusy: false,
    timeoutRequested: false,
    screenMode: "ONLINE",
    localStep: "KICK",
    localChoice: { kick: null, keeper: null },
    busy: false,

    async open() {
        this.stop();
        this.stopped = false;
        Navbar.setActive("penalty-duel");
        showPage("penaltyDuelPage", "Penalty Duel");
        this.renderLoading();
        try {
            const [wallet, match] = await Promise.all([this.api.wallet(), this.api.active()]);
            this.wallet = wallet;
            this.match = match;
            this.screenMode = "ONLINE";
            if (match) this.renderOnline();
            else this.renderIntro();
            this.connect();
            this.startSync();
        } catch (error) {
            this.renderError(error.message);
        }
    },

    stop() {
        clearTimeout(this.animationTimer);
        clearInterval(this.syncTimer);
        clearInterval(this.countdownTimer);
        this.animationTimer = null;
        this.syncTimer = null;
        this.countdownTimer = null;
        this.stopped = true;
        this.syncBusy = false;
        if (this.socket) {
            this.socket.onclose = null;
            this.socket.close();
        }
        this.socket = null;
        this.busy = false;
    },

    startTraining() {
        clearInterval(this.countdownTimer);
        if (this.socket) {
            this.socket.onclose = null;
            this.socket.close();
            this.socket = null;
        }
        this.screenMode = "TRAINING";
        this.busy = false;
        this.engine.reset();
        this.renderPlay();
    },

    renderLoading() {
        this.root().innerHTML = '<div class="pd-state"><span>⚽</span><h2>Penalty Duel</h2><p>O‘yin yuklanmoqda…</p></div>';
    },

    renderError(message) {
        this.root().innerHTML = `<div class="pd-state pd-error"><span>!</span><h2>Ulanmadi</h2><p>${this.escape(message)}</p><button onclick="loadPenaltyDuelPage()">Qayta urinish</button></div>`;
    },

    async join(mode) {
        if (this.busy) return;
        this.busy = true;
        try {
            const match = await this.api.join(mode);
            this.screenMode = "ONLINE";
            this.localStep = "KICK";
            this.localChoice = { kick: null, keeper: null };
            this.timeoutRequested = false;
            this.applyMatchState(match, true);
            this.connect();
        } catch (error) {
            Modal.error(error.message);
        } finally {
            this.busy = false;
        }
    },

    async cancelSearch() {
        if (!this.match || this.match.status !== "WAITING" || this.busy) return;
        this.busy = true;
        try {
            await this.api.cancelWaiting(this.match.id);
            this.match = null;
            this.renderIntro();
        } catch (error) {
            Modal.error(error.message);
        } finally {
            this.busy = false;
        }
    },

    async leave() {
        if (this.match?.status === "WAITING") await this.cancelSearch();
        this.stop();
    },

    applyMatchState(match, force = false) {
        if (!match) return;
        const previous = this.match;
        const changed = force || !previous || previous.id !== match.id
            || Number(previous.version) !== Number(match.version)
            || previous.status !== match.status;
        if (!changed) return;
        const newResolvedRound = previous?.id === match.id
            && (match.history?.length || 0) > (previous.history?.length || 0);
        this.match = match;
        this.timeoutRequested = false;
        if (newResolvedRound) {
            this.localStep = "KICK";
            this.localChoice = { kick: null, keeper: null };
            const last = match.history.at(-1);
            this.renderOnline({
                result: {
                    direction: last.your_kick,
                    keeperDirection: last.opponent_keeper,
                    goal: last.you_goal,
                },
            });
            this.animationTimer = setTimeout(() => this.renderOnline(), 1450);
        } else this.renderOnline();
    },

    async syncState() {
        if (this.syncBusy || this.stopped || this.screenMode !== "ONLINE") return;
        if (this.socket && this.socket.readyState === WebSocket.OPEN) return;
        this.syncBusy = true;
        try {
            const match = await this.api.active();
            if (match) this.applyMatchState(match);
        } catch (error) {
            console.warn("Penalty Duel state sync failed:", error);
        } finally {
            this.syncBusy = false;
        }
    },

    startSync() {
        clearInterval(this.syncTimer);
        this.syncTimer = setInterval(() => this.syncState(), PENALTY_FALLBACK_SYNC_MS);
    },

    connect() {
        if (!telegramInitData() || typeof WebSocket === "undefined") return;
        if (this.socket) {
            this.socket.onclose = null;
            this.socket.close();
        }
        this.socket = new WebSocket(this.api.socketUrl());
        this.socket.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                if (message.type === "PENALTY_MATCH_STATE" && message.match) {
                    this.applyMatchState(message.match);
                }
            } catch (error) {
                console.warn("Penalty Duel realtime message failed:", error);
            }
        };
        this.socket.onclose = () => {
            this.socket = null;
            if (!this.stopped && this.screenMode === "ONLINE"
                && document.getElementById("penaltyDuelPage")?.classList.contains("active-page")) {
                setTimeout(() => { if (!this.stopped) this.connect(); }, PENALTY_RECONNECT_MS);
            }
        };
    },

    root() {
        return document.getElementById("penaltyDuelPage");
    },

    playerName() {
        if (typeof USERNAME !== "undefined" && USERNAME) return `@${USERNAME}`;
        if (typeof FIRST_NAME !== "undefined" && FIRST_NAME) return FIRST_NAME;
        return "Siz";
    },

    renderIntro() {
        this.screenMode = "ONLINE";
        this.match = null;
        const gameTickets = Number(this.wallet?.game_tickets || 0);
        const tournamentTickets = Number(this.wallet?.tournament_tickets || 0);
        this.root().innerHTML = `
            <div class="pd-shell pd-intro">
                <section class="pd-hero">
                    <div class="pd-stadium-lights" aria-hidden="true"></div>
                    <span class="pd-kicker-mark" aria-hidden="true">⚽</span>
                    <small>LEVEL_GROUP • 1VS1</small>
                    <h2>Penalty Duel</h2>
                    <p>5 ta zarba. Eng ko‘p gol urgan o‘yinchi g‘olib.</p>
                </section>

                <section class="pd-how" aria-label="O‘yin qoidalari">
                    <article><b>1</b><span><strong>Zarba bering</strong><small>Darvozadagi yo‘nalishni bosing</small></span></article>
                    <article><b>2</b><span><strong>To‘pni qaytaring</strong><small>Darvozabon sakraydigan joyni bosing</small></span></article>
                    <article><b>3</b><span><strong>Hisob avtomatik</strong><small>Har bir gol darhol hisoblanadi</small></span></article>
                </section>

                <section class="pd-ticket-strip">
                    <article><span>🎫</span><small>GAME TICKET</small><strong>${gameTickets}</strong></article>
                    <article><span>🏆</span><small>TOURNAMENT</small><strong>${tournamentTickets}</strong></article>
                </section>

                <button class="pd-primary" type="button" onclick="penaltyDuelController.join('TICKET')">
                    <span>Ticket Match</span><small>1 Game Ticket • G‘olib +1 🏆</small>
                </button>
                <button class="pd-secondary pd-free-play" type="button" onclick="penaltyDuelController.join('FREE')">
                    Bepul 1vs1 <small>Ticket sarflanmaydi, mukofot yo‘q</small>
                </button>
                <button class="pd-training-link" type="button" onclick="penaltyDuelController.startTraining()">🤖 Avval mashg‘ulot qilib ko‘rish</button>
                <p class="pd-development-note">Tanlovlar raqibdan yashirin. Hisob va ticket server tomonidan avtomatik hisoblanadi.</p>
            </div>`;
    },

    renderOnline(context = {}) {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
        if (!this.match) {
            this.renderIntro();
            return;
        }
        if (this.match.status === "WAITING") {
            this.renderWaiting();
            return;
        }
        if (this.match.status === "FINISHED") {
            this.renderOnlineResult();
            return;
        }
        if (this.match.status === "CANCELLED") {
            this.renderCancelled();
            return;
        }
        if (this.match.you_submitted) {
            this.renderOpponentWaiting();
            this.startRoundCountdown();
            return;
        }

        const attacking = this.localStep === "KICK";
        const instruction = attacking
            ? "Zarba yo‘nalishini tanlang"
            : "Darvozabon sakrashini tanlang";
        const subtext = attacking
            ? "Bu tanlov raqibga ko‘rinmaydi"
            : "Raqib zarbasini qayerdan kutasiz?";
        this.root().innerHTML = `
            <div class="pd-shell pd-game pd-online">
                ${this.onlineScoreboardMarkup(attacking ? "SIZ TEPASIZ" : "SIZ QAYTARASIZ")}
                ${this.pitchMarkup(attacking)}
                <section class="pd-instruction ${attacking ? "attack" : "defend"}">
                    <span>${attacking ? "⚽" : "🧤"}</span>
                    <div><strong>${instruction}</strong><small>${subtext}</small></div>
                    <b id="pdRoundTimer">30</b>
                </section>
                ${this.recentRoundMarkup()}
                <div class="pd-rounds" aria-label="Raundlar">${this.onlineRoundsMarkup()}</div>
            </div>`;
        this.startRoundCountdown();
        if (context.result) this.animate(context.result);
    },

    pitchMarkup(attacking) {
        return `
            <section class="pd-pitch ${attacking ? "is-attacking" : "is-defending"}" id="pdPitch">
                <div class="pd-crowd" aria-hidden="true"></div>
                <div class="pd-floodlights" aria-hidden="true"></div>
                <div class="pd-goal" aria-label="Penalti yo‘nalishini tanlash">
                    <div class="pd-net" aria-hidden="true"></div>
                    <div class="pd-keeper" id="pdKeeper" aria-hidden="true">
                        <i class="pd-head"></i><i class="pd-body"></i><i class="pd-arm left"></i>
                        <i class="pd-arm right"></i><i class="pd-leg left"></i><i class="pd-leg right"></i>
                    </div>
                    <div class="pd-targets">
                        ${this.onlineTargetMarkup("top-left", "↖")}
                        ${this.onlineTargetMarkup("top-right", "↗")}
                        ${this.onlineTargetMarkup("center", "●")}
                        ${this.onlineTargetMarkup("bottom-left", "↙")}
                        ${this.onlineTargetMarkup("bottom-right", "↘")}
                    </div>
                </div>
                <div class="pd-callout" id="pdCallout" aria-live="assertive"></div>
                <div class="pd-ball" id="pdBall" aria-hidden="true">⚽</div>
                <div class="pd-kicker" id="pdKicker" aria-hidden="true">
                    <i class="pd-player-head"></i><i class="pd-player-shirt"></i>
                    <i class="pd-player-arm left"></i><i class="pd-player-arm right"></i>
                    <i class="pd-player-leg left"></i><i class="pd-player-leg right"></i>
                </div>
                <div class="pd-grass-lines" aria-hidden="true"></div>
            </section>`;
    },

    onlineTargetMarkup(direction, icon) {
        const selected = this.localChoice.kick === direction || this.localChoice.keeper === direction;
        return `<button class="pd-target ${direction} ${selected ? "selected" : ""}" type="button"
            aria-label="${this.directionLabel(direction)}" onclick="penaltyDuelController.chooseOnline('${direction}')"
            ${this.busy ? "disabled" : ""}><span>${icon}</span></button>`;
    },

    onlineScoreboardMarkup(phaseLabel) {
        const match = this.match;
        const roundLabel = match.sudden_death ? "SD" : `${match.round_number}/5`;
        return `
            <section class="pd-scoreboard">
                <article class="is-player"><small>${this.escape(match.you?.display_name || this.playerName())}</small><strong>${match.your_score}</strong></article>
                <div><span>RAUND</span><b>${roundLabel}</b><small>${phaseLabel}</small></div>
                <article><strong>${match.opponent_score}</strong><small>${this.escape(match.opponent?.display_name || "Raqib")}</small></article>
            </section>`;
    },

    onlineRoundsMarkup() {
        const match = this.match;
        const visibleRounds = Math.max(5, Math.min(7, Number(match.round_number || 1)));
        return Array.from({ length: visibleRounds }, (_, index) => {
            const round = index + 1;
            const result = match.history?.find((item) => item.round === round);
            const active = round === match.round_number && match.status === "ACTIVE";
            const yourState = result ? (result.you_goal ? "goal" : "miss") : "empty";
            const opponentState = result ? (result.opponent_goal ? "goal" : "miss") : "empty";
            return `<span class="${active ? "active" : ""}"><small>${round > 5 ? `SD${round - 5}` : round}</small><i class="${yourState}"></i><i class="${opponentState}"></i></span>`;
        }).join("");
    },

    recentRoundMarkup() {
        const last = this.match.history?.at(-1);
        if (!last) return "";
        return `
            <section class="pd-round-summary">
                <small>${last.round > 5 ? `SUDDEN DEATH ${last.round - 5}` : `${last.round}-RAUND`} NATIJASI</small>
                <span><b>Siz: ${last.you_goal ? "GOL ⚽" : "SEYV 🧤"}</b><b>Raqib: ${last.opponent_goal ? "GOL ⚽" : "SEYV 🧤"}</b></span>
            </section>`;
    },

    renderWaiting() {
        this.root().innerHTML = `
            <div class="pd-shell">
                <section class="pd-wait-card">
                    <span class="pd-search-ball">⚽</span>
                    <small>${this.match.mode === "TICKET" ? "TICKET MATCH" : "BEPUL 1VS1"}</small>
                    <h2>Raqib qidirilmoqda</h2>
                    <p>Ikkinchi o‘yinchi kirishi bilan o‘yin avtomatik boshlanadi.</p>
                    <div class="pd-search-dots"><i></i><i></i><i></i></div>
                    <button type="button" onclick="penaltyDuelController.cancelSearch()">Qidirishni to‘xtatish</button>
                </section>
            </div>`;
    },

    renderOpponentWaiting() {
        this.root().innerHTML = `
            <div class="pd-shell pd-game">
                ${this.onlineScoreboardMarkup("JAVOB KUTILMOQDA")}
                <section class="pd-wait-card pd-round-wait">
                    <span class="pd-search-ball">✓</span>
                    <small>${this.match.round_number}-RAUND</small>
                    <h2>Tanlovlar qabul qilindi</h2>
                    <p>Raqib zarba va darvozabon yo‘nalishini tanlamoqda.</p>
                    <strong id="pdRoundTimer">30</strong>
                    <div class="pd-search-dots"><i></i><i></i><i></i></div>
                </section>
                ${this.recentRoundMarkup()}
                <div class="pd-rounds">${this.onlineRoundsMarkup()}</div>
            </div>`;
    },

    async chooseOnline(direction) {
        if (this.busy || this.match?.status !== "ACTIVE" || this.match.you_submitted) return;
        if (this.localStep === "KICK") {
            this.localChoice.kick = direction;
            this.localStep = "KEEPER";
            window.Telegram?.WebApp?.HapticFeedback?.selectionChanged?.();
            this.renderOnline();
            return;
        }
        this.localChoice.keeper = direction;
        this.busy = true;
        this.renderOnline();
        try {
            const key = globalThis.crypto?.randomUUID?.()
                || `pd-${Date.now()}-${Math.random().toString(16).slice(2)}`;
            const match = await this.api.choices(this.match.id, {
                kick_direction: this.localChoice.kick,
                keeper_direction: this.localChoice.keeper,
                expected_version: this.match.version,
                idempotency_key: key,
            });
            this.applyMatchState(match, true);
        } catch (error) {
            if (error.status === 409) await this.syncState();
            Modal.error(error.message);
        } finally {
            this.busy = false;
        }
    },

    startRoundCountdown() {
        clearInterval(this.countdownTimer);
        const update = () => {
            const node = document.getElementById("pdRoundTimer");
            if (!node || !this.match?.round_deadline_at) return;
            const seconds = Math.max(0, Math.ceil((new Date(this.match.round_deadline_at).getTime() - Date.now()) / 1000));
            node.textContent = String(seconds);
            node.classList.toggle("urgent", seconds <= 10);
            if (seconds <= 0 && !this.timeoutRequested) this.requestTimeout();
        };
        update();
        this.countdownTimer = setInterval(update, 250);
    },

    async requestTimeout() {
        if (!this.match || this.timeoutRequested) return;
        this.timeoutRequested = true;
        try {
            const match = await this.api.timeout(this.match.id);
            this.applyMatchState(match, true);
        } catch (error) {
            if (error.status !== 409) console.warn("Penalty Duel timeout failed:", error);
        }
    },

    renderOnlineResult() {
        clearInterval(this.countdownTimer);
        const won = Number(this.match.winner_id) === Number(this.match.you?.telegram_id);
        const content = won
            ? ["🏆", "G‘alaba!", "Siz Penalty Duel’da g‘olib bo‘ldingiz."]
            : ["💪", "Bu safar bo‘lmadi", "Keyingi o‘yinda yana urinib ko‘ring."];
        const reward = won && this.match.mode === "TICKET" && this.match.reward_granted;
        this.root().innerHTML = `
            <div class="pd-shell pd-finish">
                <section class="pd-result-card ${won ? "win" : "loss"}">
                    <span class="pd-result-icon">${content[0]}</span>
                    <small>HISOB AVTOMATIK TASDIQLANDI</small>
                    <h2>${content[1]}</h2>
                    <div class="pd-final-score"><strong>${this.match.your_score}</strong><span>:</span><strong>${this.match.opponent_score}</strong></div>
                    <p>${content[2]}</p>
                </section>
                ${reward ? '<section class="pd-ticket-win"><span>🏆</span><div><strong>+1 Tournament Ticket</strong><small>Balansingizga avtomatik qo‘shildi</small></div></section>' : ""}
                <section class="pd-auto-score"><span>✓</span><div><strong>Server natijani saqladi</strong><small>Qo‘lda natija yozish talab qilinmaydi</small></div></section>
                <button class="pd-primary" type="button" onclick="penaltyDuelController.join('${this.match.mode}')"><span>Yana o‘ynash</span><small>${this.match.mode === "TICKET" ? "1 Game Ticket" : "Bepul 1vs1"}</small></button>
                <button class="pd-secondary" type="button" onclick="penaltyDuelController.backToLobby()">O‘yin sahifasiga qaytish</button>
            </div>`;
    },

    renderCancelled() {
        this.root().innerHTML = `
            <div class="pd-shell"><section class="pd-wait-card"><span class="pd-search-ball">↩</span><h2>O‘yin bekor qilindi</h2><p>Hech kim javob bermagan bo‘lsa, sarflangan Game Ticketlar avtomatik qaytariladi.</p><button onclick="penaltyDuelController.backToLobby()">O‘yin sahifasiga qaytish</button></section></div>`;
    },

    async backToLobby() {
        try { this.wallet = await this.api.wallet(); } catch (error) { console.warn(error); }
        this.screenMode = "ONLINE";
        this.match = null;
        this.localStep = "KICK";
        this.localChoice = { kick: null, keeper: null };
        this.renderIntro();
        this.connect();
        this.startSync();
    },

    renderPlay(context = {}) {
        const displayPhase = context.displayPhase || this.engine.phase;
        const attacking = displayPhase === "PLAYER_SHOT";
        const instruction = attacking
            ? "To‘pni qayerga tepishni tanlang"
            : "Darvozabon qayerga sakrashini tanlang";
        const subtext = attacking
            ? "Darvozadagi bitta nishonni bosing"
            : "Raqib zarbasini oldindan toping";
        const root = this.root();
        root.innerHTML = `
            <div class="pd-shell pd-game">
                ${this.scoreboardMarkup(displayPhase)}
                <section class="pd-pitch ${attacking ? "is-attacking" : "is-defending"}" id="pdPitch">
                    <div class="pd-crowd" aria-hidden="true"></div>
                    <div class="pd-floodlights" aria-hidden="true"></div>
                    <div class="pd-goal" aria-label="Penalti yo‘nalishini tanlash">
                        <div class="pd-net" aria-hidden="true"></div>
                        <div class="pd-keeper" id="pdKeeper" aria-hidden="true">
                            <i class="pd-head"></i><i class="pd-body"></i><i class="pd-arm left"></i>
                            <i class="pd-arm right"></i><i class="pd-leg left"></i><i class="pd-leg right"></i>
                        </div>
                        <div class="pd-targets">
                            ${this.targetMarkup("top-left", "↖")}
                            ${this.targetMarkup("top-right", "↗")}
                            ${this.targetMarkup("center", "●")}
                            ${this.targetMarkup("bottom-left", "↙")}
                            ${this.targetMarkup("bottom-right", "↘")}
                        </div>
                    </div>
                    <div class="pd-callout" id="pdCallout" aria-live="assertive"></div>
                    <div class="pd-ball" id="pdBall" aria-hidden="true">⚽</div>
                    <div class="pd-kicker" id="pdKicker" aria-hidden="true">
                        <i class="pd-player-head"></i><i class="pd-player-shirt"></i>
                        <i class="pd-player-arm left"></i><i class="pd-player-arm right"></i>
                        <i class="pd-player-leg left"></i><i class="pd-player-leg right"></i>
                    </div>
                    <div class="pd-grass-lines" aria-hidden="true"></div>
                </section>
                <section class="pd-instruction ${attacking ? "attack" : "defend"}">
                    <span>${attacking ? "⚽" : "🧤"}</span>
                    <div><strong>${instruction}</strong><small>${subtext}</small></div>
                </section>
                <div class="pd-rounds" aria-label="Raundlar">${this.roundsMarkup()}</div>
            </div>`;
        if (context.result) this.animate(context.result);
    },

    scoreboardMarkup(displayPhase) {
        const round = Math.min(this.engine.round, this.engine.totalRounds);
        return `
            <section class="pd-scoreboard">
                <article class="is-player"><small>${this.escape(this.playerName())}</small><strong>${this.engine.playerScore}</strong></article>
                <div><span>RAUND</span><b>${round}/${this.engine.totalRounds}</b><small>${displayPhase === "PLAYER_SHOT" ? "SIZ TEPASIZ" : "SIZ QAYTARASIZ"}</small></div>
                <article><strong>${this.engine.opponentScore}</strong><small>🤖 Mashg‘ulot bot</small></article>
            </section>`;
    },

    targetMarkup(direction, icon) {
        return `<button class="pd-target ${direction}" type="button" aria-label="${this.directionLabel(direction)}"
            onclick="penaltyDuelController.choose('${direction}')" ${this.busy ? "disabled" : ""}><span>${icon}</span></button>`;
    },

    roundsMarkup() {
        return Array.from({ length: this.engine.totalRounds }, (_, index) => {
            const round = index + 1;
            const player = this.engine.history.find((item) => item.round === round && item.role === "PLAYER");
            const opponent = this.engine.history.find((item) => item.round === round && item.role === "OPPONENT");
            const active = round === this.engine.round && this.engine.phase !== "FINISHED";
            const playerState = player ? (player.goal ? "goal" : "miss") : "empty";
            const opponentState = opponent ? (opponent.goal ? "goal" : "miss") : "empty";
            return `<span class="${active ? "active" : ""}"><small>${round}</small><i class="${playerState}"></i><i class="${opponentState}"></i></span>`;
        }).join("");
    },

    choose(direction) {
        if (this.busy || this.engine.phase === "FINISHED") return;
        this.busy = true;
        const displayPhase = this.engine.phase;
        let result;
        try {
            result = displayPhase === "PLAYER_SHOT"
                ? this.engine.playerShot(direction)
                : this.engine.defend(direction);
        } catch (error) {
            this.busy = false;
            Modal.error(error.message);
            return;
        }
        this.renderPlay({ displayPhase, result });
        this.animationTimer = setTimeout(() => {
            this.busy = false;
            if (this.engine.phase === "FINISHED") this.renderResult();
            else this.renderPlay();
        }, 1450);
    },

    animate(result) {
        const pitch = document.getElementById("pdPitch");
        const ball = document.getElementById("pdBall");
        const keeper = document.getElementById("pdKeeper");
        const kicker = document.getElementById("pdKicker");
        const callout = document.getElementById("pdCallout");
        if (!pitch || !ball || !keeper || !kicker || !callout) return;
        pitch.classList.add("is-animating");
        kicker.classList.add("is-kicking");
        ball.classList.add(`to-${result.direction}`);
        keeper.classList.add(`dive-${result.keeperDirection}`);
        callout.textContent = result.goal ? "GOL!" : "QAYTARDI!";
        callout.classList.add(result.goal ? "is-goal" : "is-save");
        window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.(result.goal ? "success" : "warning");
    },

    renderResult() {
        const outcome = this.engine.outcome();
        const content = {
            WIN: ["🏆", "G‘alaba!", "Siz mashg‘ulot botini yutdingiz."],
            LOSS: ["💪", "Bu safar bo‘lmadi", "Yana urinib hisobni yaxshilang."],
            DRAW: ["🤝", "Durrang", "Hisoblar teng yakunlandi."],
        }[outcome];
        this.root().innerHTML = `
            <div class="pd-shell pd-finish">
                <section class="pd-result-card ${outcome.toLowerCase()}">
                    <span class="pd-result-icon">${content[0]}</span>
                    <small>5 RAUND YAKUNLANDI</small>
                    <h2>${content[1]}</h2>
                    <div class="pd-final-score"><strong>${this.engine.playerScore}</strong><span>:</span><strong>${this.engine.opponentScore}</strong></div>
                    <p>${content[2]}</p>
                </section>
                <section class="pd-auto-score"><span>✓</span><div><strong>Hisob avtomatik saqlandi</strong><small>Har bir gol tizim tomonidan hisoblandi</small></div></section>
                <button class="pd-primary" type="button" onclick="penaltyDuelController.startTraining()"><span>Yana o‘ynash</span><small>Yangi 5 raund</small></button>
                <button class="pd-secondary" type="button" onclick="penaltyDuelController.backToLobby()">O‘yin sahifasiga qaytish</button>
                <p class="pd-development-note">Mashg‘ulot rejimida ticket berilmaydi.</p>
            </div>`;
    },

    directionLabel(direction) {
        return ({
            "top-left": "Yuqori chap",
            "top-right": "Yuqori o‘ng",
            center: "Markaz",
            "bottom-left": "Pastki chap",
            "bottom-right": "Pastki o‘ng",
        })[direction];
    },

    escape(value) {
        const element = document.createElement("div");
        element.textContent = String(value || "");
        return element.innerHTML;
    },
};

if (typeof window !== "undefined") window.penaltyDuelController = penaltyDuelController;
async function loadPenaltyDuelPage() { await penaltyDuelController.open(); }

if (typeof module !== "undefined") module.exports = { PenaltyDuelEngine, PENALTY_DIRECTIONS };
