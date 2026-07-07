async function loadArenaPage() {
    Navbar.setActive("arena");
    showPage("arenaPage", "1vs1 Arena");

    const page = document.getElementById("arenaPage");

    if (!page) {
        Modal.error("Arena sahifasi topilmadi.");
        return;
    }

    page.innerHTML = `
        <div class="section-card">
            <div class="section-header">
                <div>
                    <h2>🎮 1vs1 Arena</h2>
                    <p>EFC tikib, boshqa o‘yinchi bilan 1vs1 match o‘ynang.</p>
                </div>
            </div>

            <div class="arena-tabs">
                <button class="arena-tab active" data-tab="open">Ochiq matchlar</button>
                <button class="arena-tab" data-tab="my">Mening matchlarim</button>
                <button class="arena-tab" data-tab="create">Match yaratish</button>
                <button class="arena-tab" data-tab="rating">Reyting</button>
                <button class="arena-tab" data-tab="guide">Qo‘llanma</button>
            </div>

            <div id="arenaContent" class="arena-content">
                <div class="mini-loader">Yuklanmoqda...</div>
            </div>
        </div>
    `;

    bindArenaTabs();
    await loadArenaOpenMatches();
}

function bindArenaTabs() {
    document.querySelectorAll(".arena-tab").forEach((tab) => {
        tab.addEventListener("click", async () => {
            document.querySelectorAll(".arena-tab").forEach((item) => {
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

function formatArenaDate(value) {
    if (!value) return "Noma’lum";

    try {
        const date = new Date(value);
        return date.toLocaleString("uz-UZ");
    } catch (error) {
        return value;
    }
}

function formatArenaMatchCard(match, mode = "open") {
    const opponent = match.opponent_telegram_id || "hali yo‘q";
    const roomCode = match.room_code || "hali yo‘q";

    let actions = "";

    if (mode === "open" && match.status === "WAITING_PLAYER") {
        actions = `
            <button class="primary-btn arena-accept-btn" data-id="${match.id}">
                ✅ Qabul qilish
            </button>
        `;
    }

    if (mode === "my" && match.status === "READY_CHECK") {
        actions += `
            <button class="primary-btn arena-ready-btn" data-id="${match.id}">
                ✅ Men tayyorman
            </button>
        `;
    }

    if (mode === "my" && match.status === "WAITING_ROOM_CODE") {
        actions += `
            <button class="primary-btn arena-room-btn" data-id="${match.id}">
                🔐 Room Code yozish
            </button>
        `;
    }

    return `
        <div class="arena-match-card">
            <div class="arena-match-top">
                <b>Match #${match.id}</b>
                <span>${match.status}</span>
            </div>

            <div class="arena-match-info">
                <p>👤 Yaratuvchi: <code>${match.creator_telegram_id}</code></p>
                <p>👥 Raqib: <code>${opponent}</code></p>
                <p>💰 Tikilgan: <b>${match.efc_amount} EFC</b></p>
                <p>🏆 Mukofot: <b>${match.winner_reward} EFC</b></p>
                <p>🕒 Vaqt: ${formatArenaDate(match.scheduled_at)}</p>
                <p>🔐 Room Code: <code>${roomCode}</code></p>
            </div>

            <div class="arena-actions">
                ${actions}
            </div>
        </div>
    `;
}

async function loadArenaOpenMatches() {
    const content = getArenaContent();

    if (!content) return;

    content.innerHTML = `<div class="mini-loader">Ochiq matchlar yuklanmoqda...</div>`;

    try {
        const data = await getOpenMatches();
        const matches = data.matches || [];

        if (!matches.length) {
            content.innerHTML = `
                <div class="empty-state">
                    <h3>📋 Ochiq matchlar yo‘q</h3>
                    <p>Hozircha hech kim 1vs1 e’lon yaratmagan.</p>
                </div>
            `;
            return;
        }

        content.innerHTML = matches
            .map((match) => formatArenaMatchCard(match, "open"))
            .join("");

        bindArenaAcceptButtons();
    } catch (error) {
        console.error(error);
        content.innerHTML = `
            <div class="empty-state">
                <h3>❌ Xatolik</h3>
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

    content.innerHTML = `<div class="mini-loader">Matchlaringiz yuklanmoqda...</div>`;

    try {
        const data = await getMyMatches();
        const matches = data.matches || [];

        if (!matches.length) {
            content.innerHTML = `
                <div class="empty-state">
                    <h3>🕹 Matchlar yo‘q</h3>
                    <p>Siz hali 1vs1 match yaratmagansiz yoki qabul qilmagansiz.</p>
                </div>
            `;
            return;
        }

        content.innerHTML = matches
            .map((match) => formatArenaMatchCard(match, "my"))
            .join("");

        bindArenaReadyButtons();
        bindArenaRoomButtons();
    } catch (error) {
        console.error(error);
        content.innerHTML = `
            <div class="empty-state">
                <h3>❌ Xatolik</h3>
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

            Modal.prompt(
                "Room Code",
                "Room Code ni kiriting. Uni keyin o‘zgartirib bo‘lmaydi.",
                async (roomCode) => {
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
                }
            );
        });
    });
}


function loadArenaCreateForm() {
    const content = getArenaContent();

    if (!content) return;

    content.innerHTML = `
        <div class="arena-form">
            <h3>🎮 Match yaratish</h3>

            <label>EFC miqdori</label>
            <input
                id="arenaAmountInput"
                type="number"
                min="1"
                placeholder="Masalan: 100"
            />

            <label>Match vaqti</label>
            <input
                id="arenaTimeInput"
                type="datetime-local"
            />

            <button id="arenaCreateBtn" class="primary-btn">
                ✅ Match yaratish
            </button>

            <p class="hint-text">
                Match yaratilganda EFC balansingiz locked_efc ga o‘tadi.
            </p>
        </div>
    `;

    const createBtn = document.getElementById("arenaCreateBtn");

    if (createBtn) {
        createBtn.addEventListener("click", createArenaMatchFromForm);
    }
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

    content.innerHTML = `<div class="mini-loader">Reyting yuklanmoqda...</div>`;

    try {
        const data = await getMatchLeaderboard("all");
        const users = data.users || [];

        if (!users.length) {
            content.innerHTML = `
                <div class="empty-state">
                    <h3>🏆 Reyting yo‘q</h3>
                    <p>Hali hech kim match yakunlamagan.</p>
                </div>
            `;
            return;
        }

        content.innerHTML = `
            <div class="arena-rating-list">
                ${users.map((user, index) => `
                    <div class="arena-rating-card">
                        <div>
                            <b>${index + 1}. <code>${user.telegram_id}</code></b>
                            <p>✅ ${user.wins} g‘alaba | ❌ ${user.losses} mag‘lubiyat</p>
                            <p>🔥 Streak: ${user.win_streak} | 🏆 Best: ${user.best_win_streak}</p>
                        </div>
                        <span>${user.rating}</span>
                    </div>
                `).join("")}
            </div>
        `;
    } catch (error) {
        console.error(error);
        content.innerHTML = `
            <div class="empty-state">
                <h3>❌ Xatolik</h3>
                <p>Reytingni yuklab bo‘lmadi.</p>
            </div>
        `;
    }
}


async function loadArenaGuide() {
    const content = getArenaContent();

    if (!content) return;

    content.innerHTML = `<div class="mini-loader">Qo‘llanma yuklanmoqda...</div>`;

    try {
        const guide = await getMatchGuide();

        content.innerHTML = `
            <div class="arena-guide">
                <h3>📘 ${guide.title}</h3>
                <p>${guide.text.replaceAll("\n", "<br>")}</p>
            </div>
        `;
    } catch (error) {
        console.error(error);
        content.innerHTML = `
            <div class="empty-state">
                <h3>❌ Xatolik</h3>
                <p>Qo‘llanmani yuklab bo‘lmadi.</p>
            </div>
        `;
    }
}
