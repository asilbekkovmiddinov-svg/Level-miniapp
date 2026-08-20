const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const {
    PenaltyDuelEngine,
    PENALTY_DIRECTIONS,
    penaltyDuelRoundLabel,
    penaltyDuelRoundSlots,
    penaltyDuelRatingCountdown,
} = require("../miniapp/pages/penalty-duel.js");
const html = fs.readFileSync(path.join(__dirname, "../miniapp/index.html"), "utf8");
const app = fs.readFileSync(path.join(__dirname, "../miniapp/app.js"), "utf8");
const source = fs.readFileSync(path.join(__dirname, "../miniapp/pages/penalty-duel.js"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "../miniapp/penalty-duel.css"), "utf8");

test("Penalty Duel exposes five clear shot directions", () => {
    assert.deepEqual(PENALTY_DIRECTIONS, [
        "top-left", "top-right", "center", "bottom-left", "bottom-right",
    ]);
});

test("score is calculated automatically after every shot", () => {
    const game = new PenaltyDuelEngine({ rng: () => 0 });
    const playerGoal = game.playerShot("top-right");
    assert.equal(playerGoal.goal, true);
    assert.equal(game.playerScore, 1);
    assert.equal(game.phase, "PLAYER_KEEPER");
    const opponentSave = game.defend("top-left");
    assert.equal(opponentSave.goal, false);
    assert.equal(game.opponentScore, 0);
    assert.equal(game.round, 2);
    assert.equal(game.phase, "PLAYER_SHOT");
});

test("five complete rounds finish the match and return the outcome", () => {
    const game = new PenaltyDuelEngine();
    for (let round = 0; round < 5; round += 1) {
        game.playerShot("top-left", "top-right");
        game.defend("center", "center");
    }
    assert.equal(game.phase, "FINISHED");
    assert.equal(game.playerScore, 5);
    assert.equal(game.opponentScore, 0);
    assert.equal(game.outcome(), "WIN");
    assert.equal(game.history.length, 10);
});

test("turn order and invalid directions are rejected", () => {
    const game = new PenaltyDuelEngine();
    assert.throws(() => game.defend("center", "center"), /zarba berish navbati/);
    assert.throws(() => game.playerShot("outside", "center"), /Noto‘g‘ri/);
});

test("ten alternating shots render as five paired penalty rounds", () => {
    assert.equal(penaltyDuelRoundLabel({ round_number: 1 }), "1/5");
    assert.equal(penaltyDuelRoundLabel({ round_number: 2 }), "1/5");
    assert.equal(penaltyDuelRoundLabel({ round_number: 6 }), "3/5");
    assert.equal(penaltyDuelRoundLabel({ round_number: 10 }), "5/5");
    assert.equal(penaltyDuelRoundLabel({ round_number: 11 }), "SD1");
    assert.equal(penaltyDuelRoundLabel({ round_number: 12 }), "SD1");

    const slots = penaltyDuelRoundSlots({
        side: "PLAYER_ONE",
        status: "ACTIVE",
        round_number: 3,
        history: [
            { round: 1, you_goal: true, opponent_goal: false },
            { round: 2, you_goal: false, opponent_goal: true },
        ],
    });
    assert.deepEqual(slots[0], {
        pair: 1,
        label: "1",
        yourState: "goal",
        opponentState: "goal",
        active: false,
    });
    assert.equal(slots[1].active, true);
    assert.equal(slots.length, 5);
});

test("Penalty Duel is mounted as the primary game navigation", () => {
    assert.match(html, /id="penaltyDuelPage"/);
    assert.match(html, /data-page="penalty-duel"/);
    assert.match(html, /penalty-duel\.css/);
    assert.match(html, /pages\/penalty-duel\.js/);
    assert.match(app, /case "penalty-duel": await ensurePenaltyDuelHotfix\(\); await loadPenaltyDuelPage/);
    assert.match(app, /penaltyDuelController\?\.leave/);
});

test("online Penalty Duel uses authenticated authoritative endpoints", () => {
    assert.match(source, /X-Telegram-Init-Data/);
    assert.match(source, /\/penalty-duel\/matchmaking\/join/);
    assert.match(source, /\/penalty-duel\/matches\/\$\{matchId\}\/choices/);
    assert.match(source, /matchById\(matchId\)/);
    assert.match(source, /if \(!match && trackedMatchId\) match = await this\.api\.matchById\(trackedMatchId\)/);
    assert.match(source, /this\.api\.socketUrl\(this\.match\?\.id\)/);
    assert.match(source, /expected_version: this\.match\.version/);
    assert.match(source, /idempotency_key: key/);
    assert.match(source, /\/penalty-duel\/ws\?init_data=/);
    assert.match(source, /message\.type === "PENALTY_MATCH_STATE"/);
    assert.match(source, /PENALTY_FALLBACK_SYNC_MS = 500/);
    assert.match(source, /this\.socket\.readyState === WebSocket\.OPEN/);
    assert.match(source, /PENALTY_RECONNECT_MS = 750/);
});

test("online choices remain two-step and server result drives score", () => {
    assert.match(source, /localStep: "KICK"/);
    assert.match(source, /this\.localChoice\.kick = direction/);
    assert.match(source, /this\.localChoice\.keeper = direction/);
    assert.match(source, /match\.your_score/);
    assert.match(source, /match\.opponent_score/);
    assert.match(source, /HISOB AVTOMATIK TASDIQLANDI/);
    assert.match(source, /\+1 Tournament Ticket/);
    assert.doesNotMatch(source, /tournament_tickets\s*\+=|game_tickets\s*-=/);
});

test("game UI communicates automatic scoring and animated football roles", () => {
    assert.match(source, /Hisob avtomatik/);
    assert.match(source, /5 ta zarba/);
    assert.match(source, /pdKeeper/);
    assert.match(source, /pdKicker/);
    assert.match(source, /pdBall/);
    assert.match(source, /Mashg‘ulot rejimida ticket berilmaydi/);
    assert.match(css, /\.pd-keeper/);
    assert.match(css, /\.pd-kicker\.is-kicking/);
    assert.match(css, /\.pd-ball\.to-top-left/);
    assert.match(css, /@media\(max-width:380px\)/);
});

test("saved shots visibly rebound while the keeper reaches every corner", () => {
    assert.match(source, /if \(!result\.goal\) ball\.classList\.add\("is-saved"\)/);
    assert.match(css, /\.pd-ball\.is-saved\.to-top-left/);
    assert.match(css, /\.pd-ball\.is-saved\.to-top-right/);
    assert.match(css, /@keyframes pd-ball-save/);
    assert.match(css, /@keyframes pd-dive-top-left/);
    assert.match(css, /@keyframes pd-dive-top-right/);
    assert.match(css, /@keyframes pd-dive-bottom-left/);
    assert.match(css, /@keyframes pd-dive-bottom-right/);
});

test("a direction is accepted on the first pointer release without a duplicate click", () => {
    assert.match(source, /onpointerup="penaltyDuelController\.targetPress/);
    assert.match(source, /event\?\.type === "click" && Number\(event\.detail\) > 0/);
    assert.match(source, /event\.currentTarget\.disabled = true/);
    assert.match(source, /Zarba tanlandi ✓ Endi darvozabon uchun bir marta bosing/);
});

test("Penalty Duel lobby exposes separate mode and period rankings", () => {
    assert.match(source, /\/penalty-duel\/leaderboard\?mode=/);
    assert.match(source, /this\.api\.leaderboard\("FREE"\)/);
    assert.match(source, /this\.api\.leaderboard\("TICKET"\)/);
    assert.match(source, /freeRating\?\.weekly_rows/);
    assert.match(source, /freeRating\?\.overall_rows/);
    assert.match(source, /ticketRating\?\.weekly_rows/);
    assert.match(source, /ticketRating\?\.overall_rows/);
    assert.match(source, /setRatingPeriod\('WEEKLY'\)/);
    assert.match(source, /setRatingPeriod\('OVERALL'\)/);
    assert.match(source, /this\.leaderboards\[this\.ratingMode\]\?\.\[this\.ratingPeriod\]/);
    assert.doesNotMatch(source, /<small>Haftalik<\/small>[\s\S]*<small>Umumiy<\/small>/);
    assert.match(source, /freeRating\?\.week_end_at/);
    assert.match(source, /ticketRating\?\.week_end_at/);
    assert.match(source, /id="pdRatingCountdown"/);
    assert.match(source, /this\.refreshRatings\(\)/);
    assert.match(css, /\.pd-rating-row\{display:grid/);
    assert.match(css, /\.pd-rating-period\{display:flex/);
    assert.match(css, /\.pd-rating-scope-tabs/);
});

test("weekly rating countdown shows remaining days, hours, and minutes", () => {
    const now = Date.parse("2026-08-20T12:00:00Z");
    assert.equal(
        penaltyDuelRatingCountdown("2026-08-23T19:00:00+00:00", now),
        "3 kun 07 soat 00 daqiqa",
    );
    assert.equal(
        penaltyDuelRatingCountdown("2026-08-20T12:00:01Z", now),
        "0 kun 00 soat 01 daqiqa",
    );
    assert.equal(
        penaltyDuelRatingCountdown("2026-08-20T11:59:59Z", now),
        "Yangi hafta boshlanmoqda",
    );
});

test("Penalty Duel ticket ad uses the server-enabled three-provider production rotation", () => {
    assert.match(source, /PENALTY_AD_COOLDOWN_MS = 5 \* 60 \* 1000/);
    assert.match(source, /ADSGRAM: \(\) => this\.runAdsgramPrimary\(\)/);
    assert.match(source, /TADS: \(\) => this\.runTadsProvider\(\)/);
    assert.match(source, /TELEGA: \(\) => this\.runTelegaProvider\(\)/);
    assert.match(source, /ONCLICKA: \(\) => this\.runOnclickaProvider\(\)/);
    assert.match(source, /providers: this\.adConfig\?\.providers/);
    assert.match(source, /this\.adConfig\?\.onclicka_enabled !== true/);
    assert.match(source, /blockId: "39763"/);
    assert.match(source, /widgetId,/);
    assert.match(source, /adBlockUuid,/);
    assert.match(source, /initCdTma\(\{ id: spotId \}\)/);
    assert.match(source, /\/penalty-duel\/rewards\/config/);
    assert.doesNotMatch(source, /PENALTY_TELEGA_TOKEN/);
    assert.match(source, /next_penalty_duel_rewarded_ad_provider/);
    assert.match(source, /last_penalty_duel_rewarded_ad_at/);
    assert.match(source, /rewardedAt > previousRewardAt/);
    assert.match(source, /waitForServerTicket\(previousRewardAt, provider, attempts = 60\)/);
    assert.match(source, /Server tasdig‘i kutilmoqda… Oynani yopmang/);
    assert.match(source, /Server tasdig‘i kelmadi\. Ticket berilmadi/);
    assert.match(source, /\/penalty-duel\/rewards\/adsgram\/session/);
    assert.match(source, /\/penalty-duel\/rewards\/onclicka\/session/);
    assert.match(source, /\/penalty-duel\/rewards\/onclicka\/cancel/);
    assert.match(source, /const session = await this\.api\.createOnclickaSession\(\)/);
    assert.match(source, /await this\.cancelOnclickaSession\(session\.token\)/);
    assert.match(html, /penalty-duel-ad-rotation\.js/);
    assert.match(source, /inapp\.telega\.io\/sdk\/v1\/sdk\.js/);
    assert.match(source, /js\.onclckvd\.com\/in-stream-ad-admanager\/tma\.js/);
    assert.match(css, /\.pd-ad-card\{display:grid/);
});

test("players have natural body details and goals trigger a stadium effect", () => {
    assert.match(source, /pd-goal-burst/);
    assert.match(source, /pitch\.classList\.add\(result\.goal \? "has-goal" : "has-save"\)/);
    assert.match(source, /pd-stadium-rim/);
    assert.match(source, /pd-player-neck/);
    assert.match(source, /pd-player-shorts/);
    assert.match(source, /pd-keeper-shorts/);
    assert.match(css, /\.pd-player-shirt::after/);
    assert.match(css, /\.pd-arm::after/);
    assert.match(css, /\.pd-player-head::after/);
    assert.match(css, /\.pd-player-leg::before/);
    assert.match(css, /\.pd-stadium-rim/);
    assert.match(css, /\.pd-field-depth/);
    assert.match(css, /@keyframes pd-strike-leg/);
    assert.match(css, /@keyframes pd-goal-burst/);
    assert.match(css, /@keyframes pd-net-impact/);
});
