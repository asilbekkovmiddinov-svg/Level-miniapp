let arenaRatingLimit = 10;

async function loadArenaPage() {
    Navbar.setActive("arena");
    showPage("arenaPage", "1vs1 Arena");

    const page = document.getElementById("arenaPage");

    if (!page) {
        Modal.error("Arena sahifasi topilmadi.");
        return;
    }

    page.innerHTML = `
        <div class="arena-premium">

            <div class="arena-hero">
                <div class="arena-hero-glow"></div>

                <div class="arena-hero-top">
                    <div>
                        <div class="arena-badge">⚔️ LEVEL_GROUP ARENA</div>
                        <h2>1vs1 Battle Arena</h2>
                        <p>EFC tikib, real o‘yinchi bilan 1vs1 jang qiling.</p>
                    </div>

                    <div class="arena-cup">🏆</div>
                </div>

                <div class="arena-stats-grid">
                    <div class="arena-stat-card">
                        <span>Online</span>
                        <strong id="arenaOnlineCount">--</strong>
                        <small>foydalanuvchi</small>
                    </div>

                    <div class="arena-stat-card">
                        <span>Aktiv match</span>
                        <strong id="arenaActiveCount">--</strong>
                        <small>hozir</small>
                    </div>

                    <div class="arena-stat-card">
                        <span>Ochiq e'lon</span>
                        <strong id="arenaOpenCount">--</strong>
                        <small>qabul qilish mumkin</small>
                    </div>

                    <div class="arena-stat-card">
                        <span>Bugun EFC</span>
                        <strong id="arenaTodayEfc">--</strong>
                        <small>aylandi</small>
                    </div>
                </div>
            </div>

            <div class="arena-premium-tabs">
                <button class="arena-premium-tab active" data-tab="open">
                    <span>📋</span>
                    Ochiq
                </button>
                <button class="arena-premium-tab" data-tab="my">
                    <span>🕹</span>
                    Mening
                </button>
                <button class="arena-premium-tab" data-tab="create">
                    <span>➕</span>
                    Yaratish
                </button>
                <button class="arena-premium-tab" data-tab="rating">
                    <span>🏆</span>
                    Reyting
                </button>
                <button class="arena-premium-tab" data-tab="guide">
                    <span>📘</span>
                    Qo‘llanma
                </button>
            </div>

            <div id="arenaContent" class="arena-premium-content">
                <div class="mini-loader">Arena yuklanmoqda...</div>
            </div>
        </div>
    `;

    bindArenaPremiumTabs();
    await loadArenaDashboard();
    await loadArenaOpenMatches();
}


function bindArenaPremiumTabs() {
    document.querySelectorAll(".arena-premium-tab").forEach((tab) => {
        tab.addEventListener("click", async () => {
            document.querySelectorAll(".arena-premium-tab").forEach((item) => {
                item.classList.remove("active");
            });

            tab.classList.add("active");

            const tabName = tab.dataset.tab;

            if (tabName === "open") {
                await loadArenaOpenMatches();
            } else if (tabName === "my") {
                await loadArenaMyMatches();
            } else if (tabName === "create") {
                loadArenaCreateForm();
            } else if (tabName === "rating") {
                arenaRatingLimit = 10;
                await loadArenaRating();
            } else if (tabName === "guide") {
                await loadArenaGuide();
            }
        });
    });
}


function getArenaContent() {
    return document.getElementById("arenaContent");
}


async function loadArenaDashboard() {
    try {
        const overview = await getMatchOverview();

        setArenaStat(
            "arenaOnlineCount",
            overview.online_users ?? 0
        );

        setArenaStat(
            "arenaActiveCount",
            overview.active_matches ?? 0
        );

        setArenaStat(
            "arenaOpenCount",
            overview.open_matches ?? 0
        );

        setArenaStat(
            "arenaTodayEfc",
            Number(overview.today_efc_pool ?? 0).toLocaleString()
        );

    } catch (error) {
        console.error(error);

        setArenaStat("arenaOnlineCount", "--");
        setArenaStat("arenaActiveCount", "--");
        setArenaStat("arenaOpenCount", "--");
        setArenaStat("arenaTodayEfc", "--");
    }
}


function setArenaStat(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = value;
    }
}


function formatArenaDate(value) {
    if (!value) return "Noma’lum";

    try {
        const date = new Date(value);
        return date.toLocaleString("uz-UZ");
    } catch (error) {
        return value;
    }
}


function getStatusLabel(status) {
    const labels = {
        WAITING_PLAYER: "Ochiq",
        SCHEDULED: "Rejalangan",
        READY_CHECK: "Ready",
        WAITING_ROOM_CODE: "Room Code",
        ROOM_CREATED: "Room yaratildi",
        MATCH_STARTED: "Boshlangan",
        WAITING_ADMIN: "Admin tekshiradi",
        TECHNICAL_WIN: "Texnik g‘alaba",
        CANCELLED: "Bekor qilingan",
        COMPLETED: "Yakunlangan",
    };

    return labels[status] || status;
}


function formatArenaMatchCard(match, mode = "open") {
    const opponent = match.opponent_telegram_id || "Raqib yo‘q";
    const roomCode = match.room_code || "Hali yo‘q";
    const creatorShort = String(match.creator_telegram_id).slice(-5);
    const opponentShort = match.opponent_telegram_id
        ? String(match.opponent_telegram_id).slice(-5)
        : "-----";

    let actions = "";

    if (mode === "open" && match.status === "WAITING_PLAYER") {
        actions = `
            <button class="arena-main-action arena-accept-btn" data-id="${match.id}">
                ✅ Matchni qabul qilish
            </button>
        `;
    }

    if (mode === "my" && match.status === "READY_CHECK") {
        actions += `
            <button class="arena-main-action arena-ready-btn" data-id="${match.id}">
                ✅ Men tayyorman
            </button>
        `;
    }

    if (mode === "my" && match.status === "WAITING_ROOM_CODE") {
        actions += `
            <button class="arena-main-action arena-room-btn" data-id="${match.id}">
                🔐 Room Code yozish
            </button>
        `;
    }

    return `
        <div class="arena-vs-card">
            <div class="arena-vs-header">
                <div>
                    <span>Match #${match.id}</span>
                    <b>${getStatusLabel(match.status)}</b>
                </div>
                <div class="arena-prize">
                    ${match.winner_reward} EFC
                </div>
            </div>

            <div class="arena-vs-body">
                <div class="arena-player">
                    <div class="arena-player-avatar">P1</div>
                    <strong>${creatorShort}</strong>
                    <small>Yaratuvchi</small>
                </div>

                <div class="arena-vs-center">
                    <div class="arena-vs-text">VS</div>
                    <small>${match.efc_amount} EFC</small>
                </div>

                <div class="arena-player">
                    <div class="arena-player-avatar opponent">P2</div>
                    <strong>${opponentShort}</strong>
                    <small>${opponent}</small>
                </div>
            </div>

            <div class="arena-match-details">
                <div>
                    <span>🕒 Vaqt</span>
                    <b>${formatArenaDate(match.scheduled_at)}</b>
                </div>
                <div>
                    <span>🔐 Room</span>
                    <b>${roomCode}</b>
                </div>
            </div>

            ${actions ? `<div class="arena-card-actions">${actions}</div>` : ""}
        </div>
    `;
}

async function loadArenaOpenMatches() {
    const content = getArenaContent();

    if (!content) return;

    content.innerHTML = `<div class="arena-loading-box">⚔️ Ochiq matchlar yuklanmoqda...</div>`;

    try {
        const data = await getOpenMatches();
        const matches = data.matches || [];

        await loadArenaDashboard();

        if (!matches.length) {
            content.innerHTML = `
                <div class="arena-empty-premium">
                    <div class="arena-empty-icon">⚔️</div>
                    <h3>Hozircha ochiq match yo‘q</h3>
                    <p>Birinchi bo‘lib 1vs1 match yarating va raqib kuting.</p>
                    <button class="arena-main-action" onclick="loadArenaCreateForm()">
                        ➕ Match yaratish
                    </button>
                </div>
            `;
            return;
        }

        content.innerHTML = `
            <div class="arena-list-title">
                <h3>📋 Ochiq matchlar</h3>
                <span>${matches.length} ta e’lon</span>
            </div>

            ${matches
                .map((match) => formatArenaMatchCard(match, "open"))
                .join("")}
        `;

        bindArenaAcceptButtons();
    } catch (error) {
        console.error(error);
        content.innerHTML = `
            <div class="arena-empty-premium">
                <div class="arena-empty-icon">❌</div>
                <h3>Xatolik</h3>
                <p>Ochiq matchlarni yuklab bo‘lmadi.</p>
            </div>
        `;
    }
}


function bindArenaAcceptButtons() {
    document.querySelectorAll(".arena-accept-btn").forEach((button) => {
        button.addEventListener("click", async () => {
            const matchId = button.dataset.id;

            Loader.show();

            try {
                await acceptMatch(matchId);
                Modal.success("Match qabul qilindi!");
                await loadArenaMyMatches();
            } catch (error) {
                console.error(error);
                Modal.error(error.message || "Matchni qabul qilib bo‘lmadi.");
            } finally {
                Loader.hide();
            }
        });
    });
}


async function loadArenaMyMatches() {
    const content = getArenaContent();

    if (!content) return;

    content.innerHTML = `<div class="arena-loading-box">🕹 Matchlaringiz yuklanmoqda...</div>`;

    try {
        const data = await getMyMatches();
        const matches = data.matches || [];

        await loadArenaDashboard();

        if (!matches.length) {
            content.innerHTML = `
                <div class="arena-empty-premium">
                    <div class="arena-empty-icon">🕹</div>
                    <h3>Sizda hali match yo‘q</h3>
                    <p>Match yarating yoki ochiq e’lonlardan birini qabul qiling.</p>
                    <button class="arena-main-action" onclick="loadArenaCreateForm()">
                        ➕ Match yaratish
                    </button>
                </div>
            `;
            return;
        }

        content.innerHTML = `
            <div class="arena-list-title">
                <h3>🕹 Mening matchlarim</h3>
                <span>${matches.length} ta match</span>
            </div>

            ${matches
                .map((match) => formatArenaMatchCard(match, "my"))
                .join("")}
        `;

        bindArenaReadyButtons();
        bindArenaRoomButtons();
    } catch (error) {
        console.error(error);
        content.innerHTML = `
            <div class="arena-empty-premium">
                <div class="arena-empty-icon">❌</div>
                <h3>Xatolik</h3>
                <p>Matchlaringizni yuklab bo‘lmadi.</p>
            </div>
        `;
    }
}


function bindArenaReadyButtons() {
    document.querySelectorAll(".arena-ready-btn").forEach((button) => {
        button.addEventListener("click", async () => {
            const matchId = button.dataset.id;

            Loader.show();

            try {
                await setReady(matchId);
                Modal.success("Tayyor holatingiz qabul qilindi!");
                await loadArenaMyMatches();
            } catch (error) {
                console.error(error);
                Modal.error(error.message || "Ready bosib bo‘lmadi.");
            } finally {
                Loader.hide();
            }
        });
    });
}


function bindArenaRoomButtons() {
    document.querySelectorAll(".arena-room-btn").forEach((button) => {
        button.addEventListener("click", async () => {
            const matchId = button.dataset.id;
            const roomCode = prompt("Room Code kiriting:");

            if (!roomCode || roomCode.trim().length < 3) {
                Modal.error("Room Code kamida 3 ta belgidan iborat bo‘lishi kerak.");
                return;
            }

            Loader.show();

            try {
                await createRoomCode(matchId, roomCode.trim());
                Modal.success("Room Code saqlandi!");
                await loadArenaMyMatches();
            } catch (error) {
                console.error(error);
                Modal.error(error.message || "Room Code saqlanmadi.");
            } finally {
                Loader.hide();
            }
        });
    });
}


function loadArenaCreateForm() {
    const content = getArenaContent();

    if (!content) return;

    content.innerHTML = `
        <div class="arena-create-premium">
            <div class="arena-create-head">
                <div>
                    <span>⚔️ Yangi Battle</span>
                    <h3>1vs1 match yaratish</h3>
                    <p>EFC miqdorini tanlang va match vaqtini belgilang.</p>
                </div>
            </div>

            <div class="arena-quick-amounts">
                <button data-amount="100">100</button>
                <button data-amount="250">250</button>
                <button data-amount="500">500</button>
                <button data-amount="1000">1000</button>
            </div>

            <label class="arena-label">EFC miqdori</label>
            <input
                id="arenaAmountInput"
                class="arena-input"
                type="number"
                min="1"
                placeholder="Masalan: 100"
            />

            <label class="arena-label">Match vaqti</label>
            <input
                id="arenaTimeInput"
                class="arena-input"
                type="datetime-local"
            />

            <div class="arena-prize-preview">
                <div>
                    <span>Umumiy pool</span>
                    <b id="arenaPoolPreview">0 EFC</b>
                </div>
                <div>
                    <span>Komissiya</span>
                    <b id="arenaCommissionPreview">0 EFC</b>
                </div>
                <div>
                    <span>G‘olib oladi</span>
                    <b id="arenaRewardPreview">0 EFC</b>
                </div>
            </div>

            <button id="arenaCreateBtn" class="arena-main-action">
                ✅ Match yaratish
            </button>

            <p class="arena-warning">
                Match yaratilganda EFC balansingiz locked_efc ga o‘tadi.
            </p>
        </div>
    `;

    bindArenaCreateFormEvents();
}


function bindArenaCreateFormEvents() {
    const amountInput = document.getElementById("arenaAmountInput");
    const createBtn = document.getElementById("arenaCreateBtn");

    document.querySelectorAll(".arena-quick-amounts button").forEach((button) => {
        button.addEventListener("click", () => {
            amountInput.value = button.dataset.amount;
            updateArenaPrizePreview();
        });
    });

    if (amountInput) {
        amountInput.addEventListener("input", updateArenaPrizePreview);
    }

    if (createBtn) {
        createBtn.addEventListener("click", createArenaMatchFromForm);
    }
}


function updateArenaPrizePreview() {
    const amountInput = document.getElementById("arenaAmountInput");

    const amount = Number(amountInput.value || 0);
    const pool = amount * 2;
    const commission = pool * 0.05;
    const reward = pool - commission;

    document.getElementById("arenaPoolPreview").textContent = `${pool} EFC`;
    document.getElementById("arenaCommissionPreview").textContent = `${commission} EFC`;
    document.getElementById("arenaRewardPreview").textContent = `${reward} EFC`;
}

async function createArenaMatchFromForm() {
    const amountInput = document.getElementById("arenaAmountInput");
    const timeInput = document.getElementById("arenaTimeInput");

    const amount = Number(amountInput.value);
    const timeValue = timeInput.value;

    if (!amount || amount <= 0) {
        Modal.error("EFC miqdorini to‘g‘ri kiriting.");
        return;
    }

    if (!timeValue) {
        Modal.error("Match vaqtini tanlang.");
        return;
    }

    const scheduledAt = new Date(timeValue).toISOString();

    Loader.show();

    try {
        await createMatch(amount, scheduledAt);
        Modal.success("Match e’loni yaratildi!");
        await loadArenaMyMatches();
    } catch (error) {
        console.error(error);
        Modal.error(error.message || "Match yaratib bo‘lmadi.");
    } finally {
        Loader.hide();
    }
}


async function loadArenaRating() {
    const content = getArenaContent();

    if (!content) return;

    content.innerHTML = `<div class="arena-loading-box">🏆 Reyting yuklanmoqda...</div>`;

    try {
        const data = await getMatchLeaderboard("all");
        const users = data.users || [];
        const visibleUsers = users.slice(0, arenaRatingLimit);
        const myUser = users.find((user) => Number(user.telegram_id) === Number(TELEGRAM_ID));

        if (!users.length) {
            content.innerHTML = `
                <div class="arena-empty-premium">
                    <div class="arena-empty-icon">🏆</div>
                    <h3>Reyting hali yo‘q</h3>
                    <p>Hali hech kim match yakunlamagan.</p>
                </div>
            `;
            return;
        }

        content.innerHTML = `
            ${formatArenaPodium(users)}

            ${myUser ? formatMyArenaRating(myUser, users) : ""}

            <div class="arena-list-title">
                <h3>🏆 Umumiy reyting</h3>
                <span>${visibleUsers.length}/${users.length}</span>
            </div>

            <div class="arena-rating-table">
                ${visibleUsers
                    .map((user, index) => formatArenaRatingRow(user, index + 1))
                    .join("")}
            </div>

            ${
                arenaRatingLimit < users.length
                    ? `
                        <button id="arenaShowMoreRating" class="arena-secondary-action">
                            Yana ko‘rsatish
                        </button>
                    `
                    : ""
            }
        `;

        const showMoreBtn = document.getElementById("arenaShowMoreRating");

        if (showMoreBtn) {
            showMoreBtn.addEventListener("click", async () => {
                arenaRatingLimit += 10;
                await loadArenaRating();
            });
        }
    } catch (error) {
        console.error(error);
        content.innerHTML = `
            <div class="arena-empty-premium">
                <div class="arena-empty-icon">❌</div>
                <h3>Xatolik</h3>
                <p>Reytingni yuklab bo‘lmadi.</p>
            </div>
        `;
    }
}


function formatArenaPodium(users) {
    const first = users[0];
    const second = users[1];
    const third = users[2];

    return `
        <div class="arena-podium">
            ${second ? formatPodiumPlayer(second, 2, "🥈") : ""}
            ${first ? formatPodiumPlayer(first, 1, "🥇") : ""}
            ${third ? formatPodiumPlayer(third, 3, "🥉") : ""}
        </div>
    `;
}


function formatPodiumPlayer(user, place, medal) {
    return `
        <div class="arena-podium-card place-${place}">
            <div class="arena-podium-medal">${medal}</div>
            <strong>${String(user.telegram_id).slice(-5)}</strong>
            <span>${user.rating}</span>
            <small>${user.wins}W / ${user.losses}L</small>
        </div>
    `;
}


function formatMyArenaRating(myUser, users) {
    const myIndex = users.findIndex((user) => Number(user.telegram_id) === Number(TELEGRAM_ID));
    const place = myIndex >= 0 ? myIndex + 1 : "-";

    return `
        <div class="arena-my-rating">
            <div>
                <span>Mening reytingim</span>
                <h3>#${place}</h3>
                <p>${myUser.wins} g‘alaba • ${myUser.losses} mag‘lubiyat</p>
            </div>
            <strong>${myUser.rating}</strong>
        </div>
    `;
}


function formatArenaRatingRow(user, place) {
    const isMe = Number(user.telegram_id) === Number(TELEGRAM_ID);

    return `
        <div class="arena-rating-row ${isMe ? "me" : ""}">
            <div class="arena-rating-place">#${place}</div>
            <div class="arena-rating-user">
                <strong>${String(user.telegram_id).slice(-5)}</strong>
                <span>${user.wins}W / ${user.losses}L • ${user.win_rate}%</span>
            </div>
            <div class="arena-rating-score">
                ${user.rating}
            </div>
        </div>
    `;
}


async function loadArenaGuide() {
    const content = getArenaContent();

    if (!content) return;

    content.innerHTML = `<div class="arena-loading-box">📘 Qo‘llanma yuklanmoqda...</div>`;

    try {
        const guide = await getMatchGuide();

        content.innerHTML = `
            <div class="arena-guide-premium">
                <div class="arena-empty-icon">📘</div>
                <h3>${guide.title}</h3>
                <p>${guide.text.replaceAll("\n", "<br>")}</p>
            </div>
        `;
    } catch (error) {
        console.error(error);
        content.innerHTML = `
            <div class="arena-empty-premium">
                <div class="arena-empty-icon">❌</div>
                <h3>Xatolik</h3>
                <p>Qo‘llanmani yuklab bo‘lmadi.</p>
            </div>
        `;
    }
}
