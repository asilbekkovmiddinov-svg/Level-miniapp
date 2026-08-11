const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function loadController() {
    const context = {
        API_URL: "https://example.test",
        TELEGRAM_ID: 11,
        window: {},
        document: {
            createElement: () => {
                const node = { innerHTML: "" };
                Object.defineProperty(node, "textContent", {
                    set(value) { node.innerHTML = String(value); },
                });
                return node;
            },
        },
        console,
        crypto: { randomUUID: () => "test-id" },
        setInterval: () => 1,
        clearInterval: () => {},
        setTimeout: () => 1,
        URLSearchParams,
        encodeURIComponent,
    };
    vm.createContext(context);
    vm.runInContext(
        fs.readFileSync("miniapp/pages/wall-rush.js", "utf8"),
        context,
    );
    return context.window.wallRushController;
}

test("realtime state redraws only for a new match version", () => {
    const controller = loadController();
    let renders = 0;
    controller.render = () => { renders += 1; };
    controller.match = { id: "m1", version: 3, status: "ACTIVE" };
    controller.timeoutRequestedVersion = 3;

    controller.applyMatchState({ id: "m1", version: 3, status: "ACTIVE" });
    assert.equal(renders, 0);

    controller.applyMatchState({ id: "m1", version: 4, status: "ACTIVE" });
    assert.equal(renders, 1);
    assert.equal(controller.match.version, 4);
    assert.equal(controller.timeoutRequestedVersion, null);
});

test("REST fallback applies an opponent action when WebSocket is unavailable", async () => {
    const controller = loadController();
    let renders = 0;
    controller.render = () => { renders += 1; };
    controller.stopped = false;
    controller.match = { id: "m1", version: 8, status: "ACTIVE" };
    controller.api.active = async () => ({
        id: "m1", version: 9, status: "ACTIVE",
        current_turn_player_id: 77,
        turn_deadline_at: "2026-08-11T12:00:30Z",
    });

    await controller.syncMatchState();

    assert.equal(controller.match.version, 9);
    assert.equal(controller.match.current_turn_player_id, 77);
    assert.equal(renders, 1);
});

test("player usernames are shown for both colors", () => {
    const controller = loadController();
    controller.match = {
        status: "ACTIVE",
        current_turn_player_id: 11,
        red_player_id: 11,
        blue_player_id: 22,
        red_username: "red_player",
        blue_username: "blue_player",
        red_walls_remaining: 10,
        blue_walls_remaining: 9,
    };
    const markup = controller.matchMarkup();
    assert.match(markup, /@red_player/);
    assert.match(markup, /@blue_player/);
});

test("wall direction and player color are independent", () => {
    const controller = loadController();
    controller.match = { red_player_id: 11, blue_player_id: 22 };
    assert.equal(
        controller.wallClass({
            orientation: "VERTICAL", owner_id: 11,
        }),
        "wr-wall vertical owner-red",
    );
    assert.equal(
        controller.wallClass({
            orientation: "HORIZONTAL", owner_id: 22,
        }),
        "wr-wall horizontal owner-blue",
    );
});
