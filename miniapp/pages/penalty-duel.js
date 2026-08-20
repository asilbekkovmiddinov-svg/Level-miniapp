const PENALTY_DIRECTIONS = ["top-left", "top-right", "center", "bottom-left", "bottom-right"];
const PENALTY_FALLBACK_SYNC_MS = 500;
const PENALTY_RECONNECT_MS = 750;
const PENALTY_AD_COOLDOWN_MS = 5 * 60 * 1000;
const PENALTY_AD_ROTATION = globalThis.PenaltyDuelAdRotation;
const PENALTY_TELEGA_SDK_URL = "https://inapp.telega.io/sdk/v1/sdk.js";
const PENALTY_ONCLICKA_SDK_URL = "https://js.onclckvd.com/in-stream-ad-admanager/tma.js";
const PENALTY_AD_PROVIDER_LABELS = Object.freeze({
    ADSGRAM: "AdsGram",
    TADS: "TADS",
    TELEGA: "Telega.io",
    ONCLICKA: "OnClickA",
});

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
    adConfig() { return this.request("/penalty-duel/rewards/config"); }
    leaderboard(mode) {
        return this.request(`/penalty-duel/leaderboard?mode=${encodeURIComponent(mode)}&limit=20`);
    }
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
    createAdsgramSession() {
        return this.request("/penalty-duel/rewards/adsgram/session", "POST");
    }
    claimAdsgramReward(token) {
        return this.request("/penalty-duel/rewards/adsgram/claim", "POST", { token });
    }
    cancelAdsgramSession(token) {
        return this.request("/penalty-duel/rewards/adsgram/cancel", "POST", { token });
    }
    createOnclickaSession() {
        return this.request("/penalty-duel/rewards/onclicka/session", "POST");
    }
    cancelOnclickaSession(token) {
        return this.request("/penalty-duel/rewards/onclicka/cancel", "POST", { token });
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
    adConfig: {},
    socket: null,
    syncTimer: null,
    countdownTimer: null,
    adTimer: null,
    animationTimer: null,
    stopped: false,
    syncBusy: false,
    timeoutRequested: false,
    screenMode: "ONLINE",
    localStep: "KICK",
    localChoice: { kick: null, keeper: null },
    busy: false,
    adPending: false,
    adState: "",
    adsgramController: null,
    tadsController: null,
    tadsRewardResolve: null,
    tadsRewardReject: null,
    telegaController: null,
    onclickaShow: null,
    adSdkPromises: {},
    ratingMode: "FREE",
    leaderboards: { FREE: [], TICKET: [] },

    async open() {
        this.stop();
        this.stopped = false;
        Navbar.setActive("penalty-duel");
        showPage("penaltyDuelPage", "Penalty Duel");
        this.renderLoading();
        try {
            const [wallet, adConfig, match, freeRating, ticketRating] = await Promise.all([
                this.api.wallet(),
                this.api.adConfig(),
                this.api.active(),
                this.api.leaderboard("FREE").catch(() => ({ rows: [] })),
                this.api.leaderboard("TICKET").catch(() => ({ rows: [] })),
            ]);
            this.wallet = wallet;
            this.adConfig = adConfig || {};
            this.match = match;
            this.leaderboards = {
                FREE: freeRating?.rows || [],
                TICKET: ticketRating?.rows || [],
            };
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
        clearInterval(this.adTimer);
        this.animationTimer = null;
        this.syncTimer = null;
        this.countdownTimer = null;
        this.adTimer = null;
        this.stopped = true;
        this.syncBusy = false;
        if (this.socket) {
            this.socket.onclose = null;
            this.socket.close();
        }
        this.socket = null;
        this.busy = false;
        this.adPending = false;
        this.adState = "";
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
        clearInterval(this.adTimer);
        this.adTimer = null;
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

                <section class="pd-ad-card">
                    <span>🎬</span>
                    <div><strong>Reklama ko‘rib ticket oling</strong><small id="pdAdStatus">${this.adStatusText()}</small></div>
                    <button id="pdAdButton" type="button" onclick="penaltyDuelController.watchAd()" ${this.adAvailable() ? "" : "disabled"}>+1 🎫</button>
                    <div id="tads-container-11416" hidden></div>
                </section>

                <button class="pd-primary" type="button" onclick="penaltyDuelController.join('TICKET')">
                    <span>Ticket Match</span><small>1 Game Ticket • G‘olib +1 🏆</small>
                </button>
                <button class="pd-secondary pd-free-play" type="button" onclick="penaltyDuelController.join('FREE')">
                    Bepul 1vs1 <small>Ticket sarflanmaydi, mukofot yo‘q</small>
                </button>
                <button class="pd-training-link" type="button" onclick="penaltyDuelController.startTraining()">🤖 Avval mashg‘ulot qilib ko‘rish</button>
                ${this.ratingMarkup()}
                <p class="pd-development-note">Tanlovlar raqibdan yashirin. Hisob va ticket server tomonidan avtomatik hisoblanadi.</p>
            </div>`;
        this.startAdCountdown();
    },

    setRatingMode(mode) {
        if (!Object.hasOwn(this.leaderboards, mode)) return;
        this.ratingMode = mode;
        this.renderIntro();
    },

    ratingMarkup() {
        const rows = this.leaderboards[this.ratingMode] || [];
        const list = rows.length
            ? rows.map((row) => {
                const username = row.username ? `@${this.escape(row.username)}` : "Telegram o‘yinchi";
                return `
                    <article class="pd-rating-row">
                        <b class="pd-rating-rank">#${row.rank}</b>
                        <div><strong>${this.escape(row.display_name)}</strong><small>${username}</small></div>
                        <span><b>${row.rating}</b><small>Reyting</small></span>
                        <span><b>${row.wins}</b><small>G‘alaba</small></span>
                        <span><b>${row.losses}</b><small>Mag‘lubiyat</small></span>
                    </article>`;
            }).join("")
            : '<p class="pd-rating-empty">Bu rejimda hali yakunlangan o‘yin yo‘q.</p>';
        return `
            <section class="pd-rating">
                <header><div><small>PENALTY REYTINGI</small><h3>Eng yaxshi tepuvchilar</h3></div><span>🏅</span></header>
                <nav role="tablist">
                    <button class="${this.ratingMode === "FREE" ? "active" : ""}" type="button" onclick="penaltyDuelController.setRatingMode('FREE')">Bepul 1vs1</button>
                    <button class="${this.ratingMode === "TICKET" ? "active" : ""}" type="button" onclick="penaltyDuelController.setRatingMode('TICKET')">Ticket Match</button>
                </nav>
                <div class="pd-rating-list">${list}</div>
            </section>`;
    },

    adCooldownRemainingMs() {
        const last = this.wallet?.last_penalty_duel_rewarded_ad_at;
        if (!last) return 0;
        return Math.max(0, new Date(last).getTime() + PENALTY_AD_COOLDOWN_MS - Date.now());
    },

    adAvailable() {
        return this.adCooldownRemainingMs() === 0 && !this.adPending;
    },

    adStatusText() {
        if (this.adState) return this.adState;
        const remaining = this.adCooldownRemainingMs();
        if (remaining === 0) return "Har 5 daqiqada bir marta";
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
        const status = document.getElementById("pdAdStatus");
        const button = document.getElementById("pdAdButton");
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
        if (!window.tads?.init) {
            const error = new Error("TADS SDK yuklanmadi.");
            error.code = "TADS_SDK_UNAVAILABLE";
            throw error;
        }
    },

    async loadAdSdk(name, url, ready, timeout = 8000) {
        if (ready()) return;
        if (!this.adSdkPromises[name]) {
            this.adSdkPromises[name] = new Promise((resolve, reject) => {
                const selector = `script[data-penalty-ad-sdk="${name}"]`;
                const existing = document.querySelector(selector);
                const script = existing || document.createElement("script");
                script.dataset.penaltyAdSdk = name;
                script.src = url;
                script.async = true;
                script.onload = resolve;
                script.onerror = () => reject(new Error(`${name} SDK yuklanmadi.`));
                if (!existing) document.head.appendChild(script);
            }).catch((error) => {
                document.querySelector(`script[data-penalty-ad-sdk="${name}"]`)?.remove();
                delete this.adSdkPromises[name];
                throw error;
            });
        }
        await Promise.race([
            this.adSdkPromises[name],
            new Promise((_, reject) => setTimeout(
                () => reject(new Error(`${name} SDK vaqti tugadi.`)), timeout,
            )),
        ]);
    },

    async waitForTelega() {
        try {
            await this.loadAdSdk(
                "Telega.io",
                PENALTY_TELEGA_SDK_URL,
                () => Boolean(window.TelegaIn?.AdsController),
            );
        } catch (cause) {
            const error = new Error(cause?.message || "Telega.io SDK yuklanmadi.");
            error.code = "TELEGA_SDK_UNAVAILABLE";
            throw error;
        }
    },

    async waitForOnclicka() {
        try {
            await this.loadAdSdk(
                "OnClickA",
                PENALTY_ONCLICKA_SDK_URL,
                () => typeof window.initCdTma === "function",
            );
        } catch (cause) {
            const error = new Error(cause?.message || "OnClickA SDK yuklanmadi.");
            error.code = "ONCLICKA_SDK_UNAVAILABLE";
            throw error;
        }
    },

    getAdsgramController() {
        if (this.adsgramController) return this.adsgramController;
        if (!globalThis.Adsgram?.init) {
            const error = new Error("Adsgram SDK yuklanmadi.");
            error.code = "ADSGRAM_SDK_UNAVAILABLE";
            throw error;
        }
        this.adsgramController = globalThis.Adsgram.init({ blockId: "39763", debug: false });
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
            Promise.resolve(controller.show()).then(
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
            console.warn("Penalty Adsgram session cleanup failed", error);
        }
    },

    async cancelOnclickaSession(token) {
        if (!token) return;
        try {
            await this.api.cancelOnclickaSession(token);
        } catch (error) {
            console.warn("Penalty OnClickA session cleanup failed", error);
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
            error.fallback = true;
            throw error;
        }
        try {
            return await this.claimAdsgramReward(session.token);
        } catch (error) {
            error.code = "ADSGRAM_CLAIM_FAILED";
            error.fallback = false;
            throw error;
        }
    },

    async waitForServerTicket(previousRewardAt, provider, attempts = 12) {
        this.adState = "Ticket serverda tasdiqlanmoqda…";
        this.renderIntro();
        for (let attempt = 0; attempt < attempts; attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            try {
                const wallet = await this.api.wallet();
                const rewardedAt = new Date(
                    wallet.last_penalty_duel_rewarded_ad_at || 0,
                ).getTime();
                if (rewardedAt > previousRewardAt) return { wallet };
            } catch (_error) {
                // Provider callbacks can arrive shortly after the video completes.
            }
        }
        const error = new Error("Reklama tugadi, lekin server tasdig‘i kechikmoqda.");
        error.code = `${provider}_REWARD_PENDING`;
        error.fallback = false;
        throw error;
    },

    async runTadsProvider() {
        const widgetId = String(this.adConfig?.tads_widget_id || "");
        if (!widgetId) {
            const error = new Error("TADS konfiguratsiyasi topilmadi.");
            error.code = "TADS_CONFIG_UNAVAILABLE";
            throw error;
        }
        const previousRewardAt = new Date(
            this.wallet?.last_penalty_duel_rewarded_ad_at || 0,
        ).getTime();
        await this.waitForTads();
        const completion = new Promise((resolve, reject) => {
            this.tadsRewardResolve = resolve;
            this.tadsRewardReject = reject;
        });
        try {
            if (!this.tadsController) {
                this.tadsController = window.tads.init({
                    widgetId,
                    type: "fullscreen",
                    debug: false,
                    onShowReward: () => this.tadsRewardResolve?.(),
                    onAdsNotFound: () => {
                        const error = new Error("TADS reklamasi topilmadi.");
                        error.code = "TADS_NO_FILL";
                        this.tadsRewardReject?.(error);
                    },
                });
            }
            const controller = await Promise.resolve(this.tadsController);
            if (typeof controller.loadAd === "function") await controller.loadAd();
            Promise.resolve(controller.showAd()).catch((cause) => {
                const error = new Error(cause?.message || "TADS reklamasi ochilmadi.");
                error.code = "TADS_SHOW_FAILED";
                this.tadsRewardReject?.(error);
            });
            await Promise.race([
                completion,
                new Promise((_, reject) => setTimeout(() => {
                    const error = new Error("TADS reklamasi yakunlanmadi.");
                    error.code = "TADS_CANCELLED";
                    error.fallback = true;
                    reject(error);
                }, 90000)),
            ]);
            return await this.waitForServerTicket(previousRewardAt, "TADS");
        } catch (error) {
            if (!error.code) error.code = "TADS_SHOW_FAILED";
            throw error;
        } finally {
            this.tadsRewardResolve = null;
            this.tadsRewardReject = null;
        }
    },

    async runTelegaProvider() {
        const token = String(this.adConfig?.telega_token || "");
        const adBlockUuid = String(this.adConfig?.telega_ad_block_uuid || "");
        if (!token || !adBlockUuid) {
            const error = new Error("Telega.io konfiguratsiyasi topilmadi.");
            error.code = "TELEGA_CONFIG_UNAVAILABLE";
            throw error;
        }
        const previousRewardAt = new Date(
            this.wallet?.last_penalty_duel_rewarded_ad_at || 0,
        ).getTime();
        await this.waitForTelega();
        if (!this.telegaController) {
            this.telegaController = window.TelegaIn.AdsController.create_miniapp({
                token,
            });
        }
        let result;
        try {
            result = await this.telegaController.ad_show({
                adBlockUuid,
                meta: { placement: "penalty-duel-ticket" },
            });
        } catch (error) {
            error.code = "TELEGA_SHOW_FAILED";
            throw error;
        }
        if (result?.done !== true) {
            const error = new Error("Telega.io reklamasi oxirigacha ko‘rilmadi.");
            error.code = "TELEGA_CANCELLED";
            error.fallback = true;
            throw error;
        }
        return await this.waitForServerTicket(previousRewardAt, "TELEGA");
    },

    async runOnclickaProvider() {
        if (this.adConfig?.onclicka_enabled !== true) {
            const error = new Error("OnClickA productionda o‘chirilgan.");
            error.code = "ONCLICKA_DISABLED";
            throw error;
        }
        const spotId = String(this.adConfig?.onclicka_spot_id || "");
        if (!spotId) {
            const error = new Error("OnClickA konfiguratsiyasi topilmadi.");
            error.code = "ONCLICKA_CONFIG_UNAVAILABLE";
            throw error;
        }
        const previousRewardAt = new Date(
            this.wallet?.last_penalty_duel_rewarded_ad_at || 0,
        ).getTime();
        await this.waitForOnclicka();
        if (!this.onclickaShow) {
            try {
                this.onclickaShow = await window.initCdTma({ id: spotId });
            } catch (error) {
                error.code = "ONCLICKA_INIT_FAILED";
                throw error;
            }
        }
        const session = await this.api.createOnclickaSession();
        if (!session?.token) {
            const error = new Error("OnClickA reward sessiyasi yaratilmadi.");
            error.code = "ONCLICKA_SESSION_FAILED";
            throw error;
        }
        try {
            await this.onclickaShow();
        } catch (error) {
            await this.cancelOnclickaSession(session.token);
            const cancelled = /cancel|close|skip/i.test(String(error?.message || error || ""));
            error.code = cancelled ? "ONCLICKA_CANCELLED" : "ONCLICKA_SHOW_FAILED";
            error.fallback = true;
            throw error;
        }
        return await this.waitForServerTicket(previousRewardAt, "ONCLICKA");
    },

    async watchAd() {
        if (!this.adAvailable()) return;
        this.adPending = true;
        this.adState = "Reklama tarmog‘i tekshirilmoqda…";
        this.renderIntro();
        try {
            const outcome = await PENALTY_AD_ROTATION.run({
                startProvider: this.wallet?.next_penalty_duel_rewarded_ad_provider,
                providers: this.adConfig?.providers,
                adapters: {
                    ADSGRAM: () => this.runAdsgramPrimary(),
                    TADS: () => this.runTadsProvider(),
                    TELEGA: () => this.runTelegaProvider(),
                    ONCLICKA: () => this.runOnclickaProvider(),
                },
                onAttempt: (provider) => {
                    const label = PENALTY_AD_PROVIDER_LABELS[provider] || provider;
                    this.adState = `${label} reklamasi tekshirilmoqda…`;
                    this.updateAdCountdown();
                },
            });
            if (outcome.reward?.wallet) {
                this.wallet = outcome.reward.wallet;
                this.adPending = false;
                this.adState = "";
                this.renderIntro();
            }
        } catch (error) {
            this.adPending = false;
            this.adState = error?.message || "Reward tasdiqlanmadi.";
            try {
                this.wallet = await this.api.wallet();
            } catch (_walletError) {
                // Keep the current wallet snapshot if refresh is unavailable.
            }
            this.renderIntro();
        }
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
            : "Zarba tanlandi ✓ Endi darvozabon uchun bir marta bosing";
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
                <div class="pd-stadium-rim" aria-hidden="true"><span>LEVEL GROUP</span><span>PENALTY DUEL</span><span>LEVEL GROUP</span></div>
                <div class="pd-field-depth" aria-hidden="true"></div>
                <div class="pd-goal" aria-label="Penalti yo‘nalishini tanlash">
                    <div class="pd-net" aria-hidden="true"></div>
                    <div class="pd-keeper" id="pdKeeper" aria-hidden="true">
                        <i class="pd-person-shadow"></i><i class="pd-neck"></i><i class="pd-head"></i>
                        <i class="pd-body"></i><i class="pd-keeper-shorts"></i>
                        <i class="pd-arm left"></i><i class="pd-arm right"></i>
                        <i class="pd-leg left"></i><i class="pd-leg right"></i>
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
                <div class="pd-goal-burst" aria-hidden="true"></div>
                <div class="pd-ball" id="pdBall" aria-hidden="true">⚽</div>
                <div class="pd-kicker" id="pdKicker" aria-hidden="true">
                    <i class="pd-person-shadow"></i><i class="pd-player-neck"></i>
                    <i class="pd-player-head"></i><i class="pd-player-shirt"></i><i class="pd-player-shorts"></i>
                    <i class="pd-player-arm left"></i><i class="pd-player-arm right"></i>
                    <i class="pd-player-leg left"></i><i class="pd-player-leg right"></i>
                </div>
                <div class="pd-grass-lines" aria-hidden="true"></div>
            </section>`;
    },

    onlineTargetMarkup(direction, icon) {
        const selected = this.localChoice.kick === direction || this.localChoice.keeper === direction;
        return `<button class="pd-target ${direction} ${selected ? "selected" : ""}" type="button"
            aria-label="${this.directionLabel(direction)}"
            onpointerup="penaltyDuelController.targetPress(event, '${direction}', true)"
            onclick="penaltyDuelController.targetPress(event, '${direction}', true)"
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
        try {
            const [wallet, freeRating, ticketRating] = await Promise.all([
                this.api.wallet(),
                this.api.leaderboard("FREE").catch(() => ({ rows: this.leaderboards.FREE })),
                this.api.leaderboard("TICKET").catch(() => ({ rows: this.leaderboards.TICKET })),
            ]);
            this.wallet = wallet;
            this.leaderboards = {
                FREE: freeRating?.rows || [],
                TICKET: ticketRating?.rows || [],
            };
        } catch (error) {
            console.warn(error);
        }
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
                    <div class="pd-stadium-rim" aria-hidden="true"><span>LEVEL GROUP</span><span>PENALTY DUEL</span><span>LEVEL GROUP</span></div>
                    <div class="pd-field-depth" aria-hidden="true"></div>
                    <div class="pd-goal" aria-label="Penalti yo‘nalishini tanlash">
                        <div class="pd-net" aria-hidden="true"></div>
                        <div class="pd-keeper" id="pdKeeper" aria-hidden="true">
                            <i class="pd-person-shadow"></i><i class="pd-neck"></i><i class="pd-head"></i>
                            <i class="pd-body"></i><i class="pd-keeper-shorts"></i>
                            <i class="pd-arm left"></i><i class="pd-arm right"></i>
                            <i class="pd-leg left"></i><i class="pd-leg right"></i>
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
                    <div class="pd-goal-burst" aria-hidden="true"></div>
                    <div class="pd-ball" id="pdBall" aria-hidden="true">⚽</div>
                    <div class="pd-kicker" id="pdKicker" aria-hidden="true">
                        <i class="pd-person-shadow"></i><i class="pd-player-neck"></i>
                        <i class="pd-player-head"></i><i class="pd-player-shirt"></i><i class="pd-player-shorts"></i>
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
            onpointerup="penaltyDuelController.targetPress(event, '${direction}', false)"
            onclick="penaltyDuelController.targetPress(event, '${direction}', false)"
            ${this.busy ? "disabled" : ""}><span>${icon}</span></button>`;
    },

    targetPress(event, direction, online) {
        if (event?.type === "click" && Number(event.detail) > 0) return;
        event?.preventDefault?.();
        if (event?.currentTarget) event.currentTarget.disabled = true;
        if (online) this.chooseOnline(direction);
        else this.choose(direction);
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
        if (!result.goal) ball.classList.add("is-saved");
        keeper.classList.add(`dive-${result.keeperDirection}`);
        pitch.classList.add(result.goal ? "has-goal" : "has-save");
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
