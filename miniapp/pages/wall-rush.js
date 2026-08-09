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
            throw new Error(payload?.detail || "Wall Rush so‘rovi bajarilmadi.");
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
    actionMode: "MOVE",
    tadsController: null,
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
        clearInterval(this.timer);
        clearInterval(this.adTimer);
        this.timer = null;
        this.adTimer = null;
        if (this.socket) this.socket.close();
        this.socket = null;
    },

    connect() {
        if (!telegramInitData() || typeof WebSocket === "undefined") return;
        if (this.socket) this.socket.close();
        this.socket = new WebSocket(this.api.socketUrl());
        this.socket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            if (message.type === "MATCH_STATE") {
                this.match = message.match;
                this.render();
            }
        };
        this.socket.onclose = () => {
            if (document.getElementById("wallRushPage")?.classList.contains("active-page")) {
                setTimeout(() => this.connect(), 1500);
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
            this.startAdCountdown();
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
                <section class="wr-ad-card">
                    <span>🎬</span>
                    <div><strong>Reklama ko‘rib ticket oling</strong><small id="wrAdStatus">${this.adStatusText()}</small></div>
                    <button id="wrTadsButton" onclick="wallRushController.watchAd()" ${this.adAvailable() ? "" : "disabled"}>+1 🎟</button>
                    <div id="tads-container-11416" hidden></div>
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
                <p class="wr-note">Reklama topilmasa ham bepul rejim doim ochiq qoladi.</p>
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
        return `
            <div class="wr-game">
                <header class="wr-score">
                    <article class="${this.match.red_player_id === TELEGRAM_ID ? "is-me" : ""}">
                        <i class="red"></i><span>QIZIL</span><b>${this.match.red_walls_remaining} devor</b>
                    </article>
                    <div><small>NAVBAT</small><strong id="wrTimer">30.0</strong></div>
                    <article class="${this.match.blue_player_id === TELEGRAM_ID ? "is-me" : ""}">
                        <i class="blue"></i><span>KO‘K</span><b>${this.match.blue_walls_remaining} devor</b>
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
            item.className = `wr-wall ${wall.orientation.toLowerCase()}`;
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
        return Math.max(0, new Date(last).getTime() + 3600000 - Date.now());
    },

    adAvailable() {
        return this.adCooldownRemainingMs() === 0;
    },

    adStatusText() {
        if (this.adState) return this.adState;
        const remaining = this.adCooldownRemainingMs();
        if (remaining === 0) return "Har 1 soatda bir marta";
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

    async watchAd() {
        if (!this.adAvailable() || this.adState === "Reklama ochilmoqda…") return;
        this.adState = "Reklama ochilmoqda…";
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
                        onAdsNotFound: () => {
                            this.adState = "Hozir reklama topilmadi. Bepul o‘yin ochiq.";
                            this.render();
                        },
                    });
            }
            const controller = await Promise.resolve(this.tadsController);
            if (typeof controller.loadAd === "function") await controller.loadAd();
            await controller.showAd();
        } catch (error) {
            console.error("TADS show failed", error);
            this.adState = "Hozir reklama topilmadi. Bepul o‘yin ochiq.";
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
                    this.adState = "";
                    this.render();
                    return;
                }
            } catch (_error) {
                // Webhook processing can be briefly delayed; keep polling.
            }
        }
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
            this.match = await this.api.action(this.match.id, body);
            this.render();
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
        if (left === 0) this.api.timeout(this.match.id).catch(() => {});
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
