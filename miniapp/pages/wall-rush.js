const WALL_RUSH_AD_WATERFALL = globalThis.WallRushAdWaterfall;
const WALL_RUSH_AD_COOLDOWN_MS = 30 * 60 * 1000;

class WallRushClient {
    constructor(baseUrl = API_URL) {
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
            const error = new Error(payload?.detail || "Wall Rush so‘rovi bajarilmadi.");
            error.status = response.status;
            throw error;
        }
        return payload;
    }

    wallet() { return this.request("/wall-rush/wallet"); }
    leaderboard(mode) {
        return this.request(`/wall-rush/leaderboard?mode=${encodeURIComponent(mode)}&limit=20`);
    }
    active() { return this.request("/wall-rush/matches/active"); }
    join(mode) {
        return this.request("/wall-rush/matchmaking/join", "POST", { mode });
    }
    action(matchId, payload) {
        return this.request(`/wall-rush/matches/${matchId}/actions`, "POST", payload);
    }
    cancelWaiting(matchId) {
        return this.request(`/wall-rush/matches/${matchId}/cancel-waiting`, "POST");
    }
    timeout(matchId) {
        return this.request(`/wall-rush/matches/${matchId}/timeout`, "POST");
    }
    createAdsgramSession() {
        return this.request("/wall-rush/rewards/adsgram/session", "POST");
    }
    claimAdsgramReward(token) {
        return this.request("/wall-rush/rewards/adsgram/claim", "POST", { token });
    }
    cancelAdsgramSession(token) {
        return this.request("/wall-rush/rewards/adsgram/cancel", "POST", { token });
    }
    socketUrl() {
        const protocol = this.baseUrl.startsWith("https:") ? "wss:" : "ws:";
        const host = this.baseUrl.replace(/^https?:/, "");
        return `${protocol}${host}/wall-rush/ws?init_data=${encodeURIComponent(telegramInitData())}`;
    }
}

const wallRushController = {
    api: new WallRushClient(),
    match: null,
    wallet: null,
    socket: null,
    timer: null,
    adTimer: null,
    syncTimer: null,
    syncBusy: false,
    stopped: false,
    timeoutRequestedVersion: null,
    actionMode: "MOVE",
    adsgramController: null,
    tadsController: null,
    adPending: false,
    adState: "",
    ratingMode: "FREE",
    leaderboards: { FREE: [], TICKET: [] },

    async open() {
        Navbar.setActive("wall-rush");
        showPage("wallRushPage", "Wall Rush");
        this.renderLoading();
        try {
            const [wallet, match, freeRating, ticketRating] = await Promise.all([
                this.api.wallet(),
                this.api.active(),
                this.api.leaderboard("FREE"),
                this.api.leaderboard("TICKET"),
            ]);
            this.wallet = wallet;
            this.match = match;
            this.leaderboards = {
                FREE: freeRating?.rows || [],
                TICKET: ticketRating?.rows || [],
            };
            this.render();
            this.connect();
        } catch (error) {
            this.renderError(error.message);
        }
    },

    stop() {
        this.stopped = true;
        clearInterval(this.timer);
        clearInterval(this.adTimer);
        clearInterval(this.syncTimer);
        this.timer = null;
        this.adTimer = null;
        this.syncTimer = null;
        this.syncBusy = false;
        if (this.socket) {
            this.socket.onclose = null;
            this.socket.close();
        }
        this.socket = null;
    },

    applyMatchState(match) {
        if (!match) return;
        const changed = !this.match
            || Number(match.version) !== Number(this.match.version)
            || match.status !== this.match.status;
        if (!changed) return;
        this.match = match;
        this.timeoutRequestedVersion = null;
        this.render();
    },

    async syncMatchState() {
        if (this.syncBusy || this.stopped || !this.match) return;
        if (!["WAITING", "ACTIVE"].includes(this.match.status)) return;
        this.syncBusy = true;
        try {
            const match = await this.api.active();
            if (match) this.applyMatchState(match);
        } catch (error) {
            console.warn("Wall Rush state sync failed:", error);
        } finally {
            this.syncBusy = false;
        }
    },

    startStateSync() {
        clearInterval(this.syncTimer);
        this.syncTimer = setInterval(() => this.syncMatchState(), 1000);
    },

    connect() {
        this.stopped = false;
        this.startStateSync();
        if (!telegramInitData() || typeof WebSocket === "undefined") return;
        if (this.socket) {
            this.socket.onclose = null;
            this.socket.close();
        }
        this.socket = new WebSocket(this.api.socketUrl());
        this.socket.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                if (message.type === "MATCH_STATE" && message.match) {
                    this.applyMatchState(message.match);
                }
            } catch (error) {
                console.warn("Wall Rush realtime message failed:", error);
            }
        };
        this.socket.onclose = () => {
            this.socket = null;
            if (!this.stopped
                && document.getElementById("wallRushPage")?.classList.contains("active-page")) {
                setTimeout(() => {
                    if (!this.stopped) this.connect();
                }, 1500);
            }
        };
    },

    renderLoading() {
        document.getElementById("wallRushPage").innerHTML =
            '<div class="wr-state"><span>⚡</span><h2>Wall Rush</h2><p>Maydon yuklanmoqda…</p></div>';
    },

    renderError(message) {
        document.getElementById("wallRushPage").innerHTML =
            `<div class="wr-state wr-error"><span>!</span><h2>Ulanmadi</h2><p>${this.escape(message)}</p><button onclick="loadWallRushPage()">Qayta urinish</button></div>`;
    },

    render() {
        clearInterval(this.timer);
        clearInterval(this.adTimer);
        this.timer = null;
        this.adTimer = null;
        const root = document.getElementById("wallRushPage");
        if (!this.match) {
            root.innerHTML = this.lobbyMarkup();
            return;
        }
        if (this.match.status === "WAITING") {
            root.innerHTML = this.waitingMarkup();
            return;
        }
        root.innerHTML = this.matchMarkup();
        this.renderBoard();
        this.updateTimer();
        this.timer = setInterval(() => this.updateTimer(), 250);
    },

    lobbyMarkup() {
        const game = this.wallet?.game_tickets || 0;
        const tournament = this.wallet?.tournament_tickets || 0;
        return `
            <div class="wr-shell">
                <section class="wr-hero">
                    <small>LEVEL_GROUP • REAL-TIME</small>
                    <h2>Wall Rush</h2>
                    <p>Sharni finishga yetkazing. Har navbatda yurish yoki devor — faqat bittasi.</p>
                </section>
                <section class="wr-ticket-strip">
                    <article><span>🎟</span><small>GAME TICKET</small><b>${game}</b></article>
                    <article><span>🏆</span><small>TOURNAMENT</small><b>${tournament}</b></article>
                </section>
                <section class="wr-modes">
                    <button onclick="wallRushController.join('FREE')">
                        <span>∞</span><strong>Bepul o‘yin</strong><small>Cheksiz • yutuqsiz</small>
                    </button>
                    <button class="wr-primary" onclick="wallRushController.join('TICKET')">
                        <span>🎟</span><strong>Ticket Match</strong><small>1 ticket • g‘olibga turnir ticketi</small>
                    </button>
                </section>
                ${this.ratingMarkup()}
            </div>`;
    },

    setRatingMode(mode) {
        this.ratingMode = mode;
        this.render();
    },

    ratingMarkup() {
        const rows = this.leaderboards[this.ratingMode] || [];
        const list = rows.length
            ? rows.map((row) => {
                const username = row.username ? `@${this.escape(row.username)}` : "Telegram o‘yinchi";
                return `
                    <article class="wr-rating-row">
                        <b class="wr-rating-rank">#${row.rank}</b>
                        <div class="wr-rating-player">
                            <strong>${this.escape(row.display_name)}</strong>
                            <small>${username}</small>
                        </div>
                        <span><b>${row.played}</b><small>O‘ynagan</small></span>
                        <span><b>${row.wins}</b><small>Yutgan</small></span>
                        <span><b>${row.losses}</b><small>Yutqazgan</small></span>
                    </article>`;
            }).join("")
            : '<p class="wr-rating-empty">Bu rejimda hali yakunlangan o‘yin yo‘q.</p>';
        return `
            <section class="wr-rating">
                <div class="wr-rating-title">
                    <div><small>REYTING</small><h3>Wall Rush natijalari</h3></div>
                    <span>🏅</span>
                </div>
                <div class="wr-rating-tabs" role="tablist">
                    <button class="${this.ratingMode === "FREE" ? "active" : ""}" onclick="wallRushController.setRatingMode('FREE')">Bepul o‘yin</button>
                    <button class="${this.ratingMode === "TICKET" ? "active" : ""}" onclick="wallRushController.setRatingMode('TICKET')">Ticket Match</button>
                </div>
                <div class="wr-rating-list">${list}</div>
            </section>`;
    },

    waitingMarkup() {
        return `
            <div class="wr-shell">
                <section class="wr-state wr-waiting">
                    <span class="wr-pulse">VS</span>
                    <small>${this.match.mode === "TICKET" ? "TICKET MATCH" : "FREE PLAY"}</small>
                    <h2>Raqib qidirilmoqda</h2>
                    <p>Ticket raqib topilmaguncha sarflanmaydi.</p>
                    <div class="wr-search"><i></i><i></i><i></i></div>
                    <button class="wr-cancel-search" onclick="wallRushController.cancelSearch()">Qidirishni to‘xtatish</button>
                </section>
            </div>`;
    },

    matchMarkup() {
        const mine = this.match.current_turn_player_id === TELEGRAM_ID;
        const finished = this.match.status === "FINISHED";
        const redName = this.match.red_username
            ? "@" + this.match.red_username
            : this.match.red_display_name || "O‘yinchi";
        const blueName = this.match.blue_username
            ? "@" + this.match.blue_username
            : this.match.blue_display_name || "O‘yinchi";
        return `
            <div class="wr-game">
                <header class="wr-score">
                    <article class="${this.match.red_player_id === TELEGRAM_ID ? "is-me" : ""}">
                        <i class="red"></i><span>QIZIL<small>${this.escape(redName)}</small></span><b>${this.match.red_walls_remaining} devor</b>
                    </article>
                    <div><small>NAVBAT</small><strong id="wrTimer">30.0</strong></div>
                    <article class="${this.match.blue_player_id === TELEGRAM_ID ? "is-me" : ""}">
                        <i class="blue"></i><span>KO‘K<small>${this.escape(blueName)}</small></span><b>${this.match.blue_walls_remaining} devor</b>
                    </article>
                </header>
                <div class="wr-finish">🏁 FINISH</div>
                <div id="wrBoard" class="wr-board" aria-label="Wall Rush maydoni"></div>
                ${finished ? this.resultMarkup() : `
                <section class="wr-controls">
                    <p class="${mine ? "is-turn" : ""}">${mine ? "Sizning navbatingiz" : "Raqib yurishi kutilmoqda"}</p>
                    <div>
                        <button class="${this.actionMode === "MOVE" ? "active" : ""}" onclick="wallRushController.setMode('MOVE')">⚪ Sharni yurish</button>
                        <button class="${this.actionMode === "WALL" ? "active" : ""}" onclick="wallRushController.setMode('WALL')">━ Devor qo‘yish</button>
                    </div>
                    ${this.actionMode === "WALL" ? '<small class="wr-wall-hint">Maydondagi chiziqlar orasiga bosing</small>' : ""}
                </section>`}
            </div>`;
    },

    resultMarkup() {
        const won = this.match.winner_id === TELEGRAM_ID;
        return `<section class="wr-result ${won ? "win" : "lose"}">
            <span>${won ? "🏆" : "🤝"}</span>
            <h2>${won ? "G‘alaba!" : "Match tugadi"}</h2>
            <p>${won && this.match.mode === "TICKET" ? "+1 Tournament Ticket" : "Yaxshi o‘yin!"}</p>
            <button onclick="wallRushController.reset()">Yana o‘ynash</button>
        </section>`;
    },

    wallClass(wall) {
        const orientation = String(wall?.orientation || "").toUpperCase();
        const direction = orientation === "VERTICAL" ? "vertical" : "horizontal";
        const owner = Number(wall?.owner_id) === Number(this.match?.red_player_id)
            ? "owner-red"
            : Number(wall?.owner_id) === Number(this.match?.blue_player_id)
                ? "owner-blue" : "owner-neutral";
        return `wr-wall ${direction} ${owner}`;
    },

    renderBoard() {
        const board = document.getElementById("wrBoard");
        if (!board) return;
        board.classList.toggle("wall-mode", this.actionMode === "WALL");
        for (let row = 0; row < 13; row += 1) {
            for (let column = 0; column < 9; column += 1) {
                const cell = document.createElement("button");
                cell.className = "wr-cell";
                cell.style.gridRow = String(row * 2 + 1);
                cell.style.gridColumn = String(column * 2 + 1);
                cell.onclick = () => {
                    if (this.actionMode === "MOVE") this.play(row, column);
                };
                if (this.match.red[0] === row && this.match.red[1] === column) {
                    cell.innerHTML = '<i class="wr-ball red"></i>';
                }
                if (this.match.blue[0] === row && this.match.blue[1] === column) {
                    cell.innerHTML = '<i class="wr-ball blue"></i>';
                }
                board.appendChild(cell);
            }
        }
        if (this.actionMode === "WALL") this.renderWallTargets(board);
        (this.match.walls || []).forEach((wall) => {
            const item = document.createElement("i");
            item.className = this.wallClass(wall);
            item.style.left = `${((wall.column + 1) / 9) * 100}%`;
            item.style.top = `${((wall.row + 1) / 13) * 100}%`;
            board.appendChild(item);
        });
    },

    renderWallTargets(board) {
        for (let row = 0; row < 12; row += 1) {
            for (let column = 0; column < 8; column += 1) {
                ["HORIZONTAL", "VERTICAL"].forEach((orientation) => {
                    const target = document.createElement("button");
                    target.className = `wr-wall-target ${orientation.toLowerCase()}`;
                    target.setAttribute("aria-label", orientation === "HORIZONTAL"
                        ? "Gorizontal devor qo‘yish"
                        : "Vertikal devor qo‘yish");
                    target.style.gridRow = String(row * 2 + (orientation === "HORIZONTAL" ? 2 : 1));
                    target.style.gridColumn = String(column * 2 + (orientation === "VERTICAL" ? 2 : 1));
                    if (orientation === "HORIZONTAL") target.style.gridColumnEnd = "span 3";
                    else target.style.gridRowEnd = "span 3";
                    target.onclick = () => this.play(row, column, orientation);
                    board.appendChild(target);
                });
            }
        }
    },

    adCooldownRemainingMs() {
        const last = this.wallet?.last_rewarded_ad_at;
        if (!last) return 0;
        return Math.max(
            0,
            new Date(last).getTime() + WALL_RUSH_AD_COOLDOWN_MS - Date.now(),
        );
    },

    adAvailable() {
        return this.adCooldownRemainingMs() === 0 && !this.adPending;
    },

    adStatusText() {
        if (this.adState) return this.adState;
        const remaining = this.adCooldownRemainingMs();
        if (remaining === 0) return "Har 30 daqiqada bir marta";
        const seconds = Math.ceil(remaining / 1000);
        const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
        const rest = String(seconds % 60).padStart(2, "0");
        return `Keyingi reklamagacha ${minutes}:${rest}`;
    },

    startAdCountdown() {
        this.updateAdCountdown();
        if (!this.adAvailable()) {
            this.adTimer = setInterval(() => this.updateAdCountdown(), 1000);
        }
    },

    updateAdCountdown() {
        const status = document.getElementById("wrAdStatus");
        const button = document.getElementById("wrTadsButton");
        if (!status || !button) return;
        status.textContent = this.adStatusText();
        button.disabled = !this.adAvailable();
        if (this.adAvailable() && this.adTimer) {
            clearInterval(this.adTimer);
            this.adTimer = null;
        }
    },

    async waitForTads(timeout = 5000) {
        if (window.tads?.init) return;
        const started = performance.now();
        while (!window.tads?.init && performance.now() - started < timeout) {
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
        if (!window.tads?.init) throw new Error("TADS SDK yuklanmadi");
    },

    getAdsgramController() {
        if (this.adsgramController) return this.adsgramController;
        if (!globalThis.Adsgram?.init) {
            const error = new Error("Adsgram SDK yuklanmadi.");
            error.code = "ADSGRAM_SDK_UNAVAILABLE";
            throw error;
        }
        this.adsgramController = globalThis.Adsgram.init({
            blockId: "39763",
            debug: false,
        });
        return this.adsgramController;
    },

    showAdsgramAd(controller) {
        if (!controller?.show) {
            const error = new Error("Adsgram SDK yuklanmadi.");
            error.code = "ADSGRAM_SDK_UNAVAILABLE";
            return Promise.reject(error);
        }
        return new Promise((resolve, reject) => {
            let settled = false;
            const finish = (callback, value) => {
                if (settled) return;
                settled = true;
                controller.removeEventListener?.("onBannerNotFound", onNoFill);
                callback(value);
            };
            const onNoFill = () => {
                const error = new Error("Adsgram reklamasi topilmadi.");
                error.code = "ADSGRAM_NO_FILL";
                finish(reject, error);
            };
            controller.addEventListener?.("onBannerNotFound", onNoFill);
            Promise.resolve()
                .then(() => controller.show())
                .then(
                    (result) => finish(resolve, result),
                    (error) => finish(reject, error),
                );
        });
    },

    async claimAdsgramReward(token, attempts = 10) {
        let lastError;
        for (let attempt = 0; attempt < attempts; attempt += 1) {
            try {
                return await this.api.claimAdsgramReward(token);
            } catch (error) {
                lastError = error;
                if (Number(error?.status) !== 425 || attempt === attempts - 1) throw error;
                await new Promise((resolve) => setTimeout(resolve, 700));
            }
        }
        throw lastError;
    },

    async cancelAdsgramSession(token) {
        if (!token) return;
        try {
            await this.api.cancelAdsgramSession(token);
        } catch (error) {
            console.warn("Adsgram session cleanup failed", error);
        }
    },

    resetAdsgramController() {
        this.adsgramController?.destroy?.();
        this.adsgramController = null;
    },

    async runAdsgramPrimary() {
        const session = await this.api.createAdsgramSession();
        if (!session?.token) throw new Error("Adsgram reward sessiyasi yaratilmadi.");
        let timeoutId;
        let result;
        try {
            result = await Promise.race([
                this.showAdsgramAd(this.getAdsgramController()),
                new Promise((_, reject) => {
                    timeoutId = setTimeout(() => {
                        const error = new Error("Adsgram javobi kutilgan vaqtda kelmadi.");
                        error.code = "ADSGRAM_TIMEOUT";
                        reject(error);
                    }, 90000);
                }),
            ]);
        } catch (error) {
            await this.cancelAdsgramSession(session.token);
            this.resetAdsgramController();
            if (!error.code) error.code = "ADSGRAM_SHOW_FAILED";
            throw error;
        } finally {
            clearTimeout(timeoutId);
        }
        if (result?.done !== true || result?.error === true) {
            await this.cancelAdsgramSession(session.token);
            const error = new Error("Ticket uchun reklamani oxirigacha ko‘ring.");
            error.code = "ADSGRAM_NOT_REWARDED";
            throw error;
        }
        try {
            return await this.claimAdsgramReward(session.token);
        } catch (error) {
            error.code = "ADSGRAM_CLAIM_FAILED";
            throw error;
        }
    },

    finishAdUnavailable() {
        this.adPending = false;
        this.adState = "Hozir reklama topilmadi. Bepul o‘yin ochiq.";
        this.render();
    },

    async runTadsFallback() {
        this.adState = "Boshqa reklama tekshirilmoqda…";
        this.render();
        try {
            await this.waitForTads();
            if (!this.tadsController) {
                this.tadsController = window.tads.controllers?.["11416"]
                    || window.tads.init({
                        widgetId: "11416",
                        type: "fullscreen",
                        debug: false,
                        onShowReward: () => this.confirmTadsReward(),
                        onAdsNotFound: () => this.finishAdUnavailable(),
                    });
            }
            const controller = await Promise.resolve(this.tadsController);
            if (typeof controller.loadAd === "function") await controller.loadAd();
            await controller.showAd();
        } catch (error) {
            console.error("TADS fallback failed", error);
            this.finishAdUnavailable();
        }
    },

    async watchAd() {
        if (!this.adAvailable()) return;
        this.adPending = true;
        this.adState = "Adsgram reklamasi ochilmoqda…";
        this.render();
        try {
            const outcome = await WALL_RUSH_AD_WATERFALL.run({
                showAdsgram: () => this.runAdsgramPrimary(),
                showTads: () => this.runTadsFallback(),
            });
            if (outcome.provider === "ADSGRAM" && outcome.reward?.wallet) {
                this.wallet = outcome.reward.wallet;
                this.adPending = false;
                this.adState = "";
                this.render();
            }
        } catch (error) {
            console.warn("Adsgram primary failed", error);
            if (error?.code === "ADSGRAM_NOT_REWARDED") {
                this.adPending = false;
                this.adState = error.message;
                this.render();
                return;
            }
            this.adPending = false;
            this.adState = error?.message || "Reward tasdiqlanmadi.";
            try {
                this.wallet = await this.api.wallet();
            } catch (_walletError) {
                // Keep the current wallet snapshot if refresh is unavailable.
            }
            this.render();
        }
    },

    async confirmTadsReward() {
        const before = Number(this.wallet?.game_tickets || 0);
        this.adState = "Ticket tasdiqlanmoqda…";
        this.render();
        for (let attempt = 0; attempt < 10; attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            try {
                const wallet = await this.api.wallet();
                if (Number(wallet.game_tickets || 0) > before) {
                    this.wallet = wallet;
                    this.adPending = false;
                    this.adState = "";
                    this.render();
                    return;
                }
            } catch (_error) {
                // Webhook processing can be briefly delayed; keep polling.
            }
        }
        this.adPending = false;
        this.adState = "Tasdiq kechikmoqda. Birozdan keyin yangilang.";
        this.render();
    },

    async cancelSearch() {
        if (!this.match || this.match.status !== "WAITING") return;
        try {
            await this.api.cancelWaiting(this.match.id);
            this.stop();
            this.match = null;
            this.wallet = await this.api.wallet();
            this.render();
        } catch (error) {
            Modal.error(error.message);
        }
    },

    async leave() {
        if (this.match?.status === "WAITING") {
            try { await this.api.cancelWaiting(this.match.id); } catch (_error) {}
        }
        this.stop();
        this.match = null;
    },

    async join(mode) {
        try {
            this.match = await this.api.join(mode);
            this.render();
            this.connect();
        } catch (error) {
            Modal.error(error.message);
        }
    },

    setMode(mode) {
        this.actionMode = mode;
        this.render();
    },

    async play(row, column, orientation = null) {
        if (!this.match || this.match.status !== "ACTIVE") return;
        if (this.match.current_turn_player_id !== TELEGRAM_ID) return;
        try {
            const body = {
                action: this.actionMode,
                row,
                column,
                orientation: this.actionMode === "WALL" ? orientation : null,
                expected_version: this.match.version,
                idempotency_key: crypto.randomUUID?.() || `wr-${Date.now()}-${Math.random()}`,
            };
            const match = await this.api.action(this.match.id, body);
            this.applyMatchState(match);
        } catch (error) {
            Modal.error(error.message);
        }
    },

    updateTimer() {
        const output = document.getElementById("wrTimer");
        if (!output || !this.match?.turn_deadline_at) return;
        const left = Math.max(0, new Date(this.match.turn_deadline_at).getTime() - Date.now());
        output.textContent = (left / 1000).toFixed(1);
        output.classList.toggle("urgent", left <= 5000);
        if (left === 0 && this.timeoutRequestedVersion !== this.match.version) {
            this.timeoutRequestedVersion = this.match.version;
            this.api.timeout(this.match.id)
                .then((match) => this.applyMatchState(match))
                .catch(() => this.syncMatchState());
        }
    },

    async reset() {
        this.stop();
        this.match = null;
        this.wallet = await this.api.wallet();
        this.render();
    },

    escape(value) {
        const node = document.createElement("div");
        node.textContent = String(value || "");
        return node.innerHTML;
    },
};

window.wallRushController = wallRushController;

async function loadWallRushPage() {
    await wallRushController.open();
}
