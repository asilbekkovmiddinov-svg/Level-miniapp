const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const arena = require("../miniapp/pages/arena.js");
const source = fs.readFileSync(
    path.join(__dirname, "../miniapp/pages/arena.js"),
    "utf8",
);
const styles = fs.readFileSync(
    path.join(__dirname, "../miniapp/premium-arena.css"),
    "utf8",
);

function response(payload, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => payload,
    };
}

const waitingMatch = {
    id: 42,
    game_type: "EFOOTBALL",
    creator_display_name: "Ali",
    opponent_display_name: "Raqib kutilmoqda",
    efc_amount: "100",
    total_pool: "200",
    winner_reward: "190",
    status: "WAITING_PLAYER",
    scheduled_at: "2030-01-01T12:00:00Z",
    creator_ready: false,
    opponent_ready: false,
    can_cancel: true,
};

test("creator cancel uses authenticated POST endpoint without client cancel reason", async () => {
    let call;
    const client = new arena.ArenaApiClient({
        baseUrl: "https://backend.example",
        initDataProvider: () => "verified-init-data",
        retries: 3,
        fetchImpl: async (url, options) => {
            call = { url, options };
            return response({ ...waitingMatch, status: "CANCELLED", can_cancel: false });
        },
    });

    const cancelled = await client.cancelCreatorMatch(42);

    assert.equal(new URL(call.url).pathname, "/matches/42/creator-cancel");
    assert.equal(call.options.method, "POST");
    assert.equal(call.options.headers["X-Telegram-Init-Data"], "verified-init-data");
    assert.equal(call.options.body, undefined);
    assert.equal(cancelled.status, "CANCELLED");
    assert.equal(cancelled.canCancel, false);
});

test("cancel permission is backend authoritative and modal has required copy", () => {
    assert.equal(arena.normalizeMatch(waitingMatch).canCancel, true);
    assert.equal(arena.normalizeMatch({ ...waitingMatch, can_cancel: false }).canCancel, false);

    const modal = arena.arenaCreatorCancelModal(42);
    assert.match(modal, /Room bekor qilinsinmi\?/);
    assert.match(modal, /Lock qilingan EFC qaytariladi\./);
    assert.match(modal, /confirmArenaCreatorCancel\(42\)/);
});

test("successful cancel refreshes history and wallet then shows success toast", () => {
    assert.match(source, /loadArenaTab\("history"\)/);
    assert.match(source, /typeof loadWalletPage === "function" \? loadWalletPage\(\)/);
    assert.match(source, /Room bekor qilindi\. Lock qilingan EFC qaytarildi\./);
    assert.match(source, /match\.canCancel \?/);
    assert.match(styles, /\.arena-v8-creator-cancel/);
    assert.match(styles, /\.arena-v8-cancel-confirm/);
    assert.match(styles, /@media\(prefers-reduced-motion:reduce\)/);
});
