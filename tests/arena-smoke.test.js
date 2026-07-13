const assert = require("node:assert/strict");
const test = require("node:test");

const {
    ArenaApiClient,
    arenaCountdown,
    renderArenaEvidencePanel,
} = require("../miniapp/pages/arena.js");
const { ArenaSmokeBackend } = require("./helpers/arena-smoke-backend.js");

function client(backend, actor) {
    return new ArenaApiClient({
        baseUrl: "https://smoke.backend",
        initDataProvider: () => `${actor}-init`,
        fetchImpl: backend.fetch.bind(backend),
        retries: 1,
    });
}

test("Arena production smoke flow reaches winner notification", async () => {
    const backend = new ArenaSmokeBackend();
    const creator = client(backend, "creator");
    const opponent = client(backend, "opponent");

    const created = await creator.createMatch({
        gameType: "EFOOTBALL",
        stakeEfc: 100,
        scheduledAt: "2030-01-01T12:00:00.000Z",
        rulesAccepted: true,
    });
    assert.equal(created.status, "WAITING_PLAYER");
    assert.equal((await opponent.acceptMatch(created.id, { rulesAccepted: true })).status, "WAITING_READY");

    backend.openReady(created.id);
    assert.equal(arenaCountdown("2030-01-01T12:00:00.000Z", Date.parse("2030-01-01T11:55:00.000Z")), "05:00");
    assert.equal((await creator.readyMatch(created.id)).creatorReady, true);
    assert.equal((await opponent.readyMatch(created.id)).opponentReady, true);
    backend.finishReady(created.id);
    assert.equal((await creator.match(created.id)).status, "ROOM_READY");

    assert.equal((await creator.setRoomCode(created.id, "ROOM-100")).roomCode, "ROOM-100");
    assert.equal((await opponent.match(created.id)).roomCode, "ROOM-100");
    backend.startPlaying(created.id);

    let observed = await creator.match(created.id);
    assert.match(renderArenaEvidencePanel(observed), /0 \/ 2/);
    backend.botEvidence(created.id, "creator", "screenshot");
    observed = await creator.match(created.id);
    assert.match(renderArenaEvidencePanel(observed), /1 \/ 2/);
    backend.botEvidence(created.id, "creator", "video");
    observed = await creator.match(created.id);
    assert.match(renderArenaEvidencePanel(observed), /2 \/ 2/);

    backend.botEvidence(created.id, "opponent", "screenshot");
    backend.botEvidence(created.id, "opponent", "video");
    assert.equal((await creator.match(created.id)).status, "WAITING_ADMIN");
    backend.adminResolve(created.id, "PLAYER_1_WIN");
    assert.equal((await creator.match(created.id)).status, "COMPLETED");
    assert.deepEqual(backend.notifications, [{ matchId: created.id, decision: "PLAYER_1_WIN" }]);

    const mutationCalls = backend.calls.filter((call) => call.method === "POST");
    mutationCalls.forEach((call) => assert.ok(call.actor));
});

test("smoke helper covers retry, recovery, refund and cancel terminal states", async () => {
    const backend = new ArenaSmokeBackend();
    const creator = client(backend, "creator");
    const created = await creator.createMatch({
        gameType: "FC_MOBILE",
        stakeEfc: 50,
        scheduledAt: "2030-01-01T12:00:00.000Z",
        rulesAccepted: true,
    });

    backend.transientReads = 1;
    assert.equal((await creator.match(created.id)).id, created.id, "GET polling retry recovers");
    const recoveredClient = client(backend, "creator");
    assert.equal((await recoveredClient.match(created.id)).status, "WAITING_PLAYER", "reload recovery reads backend state");

    backend.adminResolve(created.id, "REFUND");
    assert.equal((await creator.match(created.id)).status, "COMPLETED");

    const cancelled = await creator.createMatch({
        gameType: "PUBG_MOBILE",
        stakeEfc: 50,
        scheduledAt: "2030-01-01T13:00:00.000Z",
        rulesAccepted: true,
    });
    backend.adminResolve(cancelled.id, "CANCEL");
    assert.equal((await creator.match(cancelled.id)).status, "CANCELLED");
    assert.deepEqual(backend.notifications.map((item) => item.decision), ["REFUND", "CANCEL"]);
});
