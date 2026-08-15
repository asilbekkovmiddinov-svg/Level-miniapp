const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const appSource = fs.readFileSync(path.join(root, "miniapp/app.js"), "utf8");
const arenaSource = fs.readFileSync(path.join(root, "miniapp/pages/arena.js"), "utf8");

function loadArenaModule() {
    const originalDocument = global.document;
    const buttons = [
        { disabled: false, classList: { toggle() {} }, setAttribute(name, value) { this[name] = value; } },
        { disabled: false, classList: { toggle() {} }, setAttribute(name, value) { this[name] = value; } },
    ];
    global.document = {
        querySelectorAll(selector) {
            return selector === 'button[data-page="arena"]' ? buttons : [];
        },
        getElementById() { return null; },
    };
    delete require.cache[require.resolve("../miniapp/pages/arena.js")];
    const arena = require("../miniapp/pages/arena.js");
    return {
        arena,
        buttons,
        restore() {
            global.document = originalDocument;
            delete require.cache[require.resolve("../miniapp/pages/arena.js")];
        },
    };
}

test("20 rapid Arena navigation attempts allow exactly one entry", () => {
    const harness = loadArenaModule();
    try {
        const attempts = Array.from({ length: 20 }, () => harness.arena.arenaBeginNavigation());
        assert.equal(attempts.filter(Boolean).length, 1);
        assert.equal(attempts.filter((value) => value === false).length, 19);
        harness.buttons.forEach((button) => {
            assert.equal(button.disabled, true);
            assert.equal(button["aria-busy"], "true");
        });
        harness.arena.arenaFinishNavigation({ querySelectorAll: () => [] });
        harness.buttons.forEach((button) => {
            assert.equal(button.disabled, false);
            assert.equal(button["aria-busy"], "false");
        });
    } finally {
        harness.restore();
    }
});

test("Arena render closes overlay and releases its lock in finally", () => {
    assert.match(arenaSource, /async function loadArenaPage\(\) \{\s*if \(!arenaBeginNavigation\(\)\) return false/);
    assert.match(arenaSource, /async function loadArenaPage\(\)[\s\S]*finally \{\s*arenaFinishNavigation\(page\)/);
    assert.match(arenaSource, /function arenaFinishNavigation\(page\) \{[\s\S]*arenaCleanupEntranceOverlay\(page\)[\s\S]*arenaSetNavigationPending\(false\)[\s\S]*navigationPending = false/);
});

test("new overlay cleanup is scheduled on every Arena render", () => {
    assert.match(arenaSource, /arenaScheduleEntranceOverlayCleanup\(page\);\s*if \(page\.dataset\.arenaPremiumUi === "1"\) return/);
    assert.match(arenaSource, /clearTimeout\(arenaEntranceState\.cleanupTimer\)/);
});

test("overlay cleanup removes all matching overlays idempotently", () => {
    const harness = loadArenaModule();
    let removed = 0;
    try {
        const page = {
            querySelectorAll(selector) {
                assert.equal(selector, ".arena-v8-entry");
                return [{ remove: () => { removed += 1; } }, { remove: () => { removed += 1; } }];
            },
        };
        harness.arena.arenaCleanupEntranceOverlay(page);
        harness.arena.arenaCleanupEntranceOverlay({ querySelectorAll: () => [] });
        assert.equal(removed, 2);
    } finally {
        harness.restore();
    }
});

test("Arena route opens the authoritative two-ticket page", () => {
    assert.doesNotMatch(appSource, /navigationState|setNavigationTriggerState|cleanupNavigationOverlay/);
    const route = appSource.match(/case "arena":[\s\S]*?break;/)?.[0] || "";
    assert.match(route, /loadArenaV3Page\(\)/);
    assert.doesNotMatch(route, /Tez orada/);
});
