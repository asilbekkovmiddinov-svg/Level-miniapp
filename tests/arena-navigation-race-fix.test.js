const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const appSource = fs.readFileSync(path.join(root, "miniapp/app.js"), "utf8");
const arenaSource = fs.readFileSync(path.join(root, "miniapp/pages/arena.js"), "utf8");
const arena = require("../miniapp/pages/arena.js");

function navigationHarness() {
    let arenaLoads = 0;
    let overlayCleanups = 0;
    let releaseArena;
    const arenaButton = {
        dataset: { page: "arena" },
        disabled: false,
        classList: { toggle() {} },
        setAttribute(name, value) { this[name] = value; },
    };
    const context = {
        console,
        URLSearchParams,
        CustomEvent: class {},
        setTimeout,
        clearTimeout,
        setInterval() { return 1; },
        window: {
            addEventListener() {},
            dispatchEvent() {},
            scrollTo() {},
            location: { search: "" },
        },
        document: {
            body: { classList: { remove() {} } },
            querySelectorAll(selector) {
                return selector === "button[data-page]" ? [arenaButton] : [];
            },
            getElementById() { return {}; },
        },
        arenaCleanupEntranceOverlay() { overlayCleanups += 1; },
        loadArenaPage() {
            arenaLoads += 1;
            return new Promise((resolve) => { releaseArena = resolve; });
        },
        loadShopPage: async () => {},
        loadP2PPage: async () => {},
        loadWheelPage: async () => {},
        loadOrdersPage: async () => {},
        loadProfilePage: async () => {},
        loadReferralPage: async () => {},
        loadDedicatedWalletPage: async () => {},
        loadPromotionsAdminPage: async () => {},
        loadCoinPromotionAdminPage: async () => {},
        loadWheelOrderAdminPage: async () => {},
        loadPromotionsPage: async () => {},
        loadNotificationsPage: async () => {},
        Loader: {}, Modal: {}, Navbar: {},
    };
    vm.createContext(context);
    vm.runInContext(appSource, context);
    return { context, arenaButton, counts: () => ({ arenaLoads, overlayCleanups }), release: () => releaseArena() };
}

test("20 rapid Arena taps start exactly one navigation and ignore the rest", async () => {
    const harness = navigationHarness();
    const attempts = Array.from({ length: 20 }, () => harness.context.openPage("arena"));
    assert.equal(harness.counts().arenaLoads, 1);
    assert.equal(harness.arenaButton.disabled, true);
    assert.equal(harness.arenaButton["aria-busy"], "true");
    harness.release();
    const results = await Promise.all(attempts);
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal(results.filter((value) => value === false).length, 19);
    assert.equal(harness.counts().overlayCleanups, 1);
    assert.equal(harness.arenaButton.disabled, false);
    assert.equal(harness.arenaButton["aria-busy"], "false");
});

test("navigation lock and trigger cleanup are protected by finally", () => {
    assert.match(appSource, /if \(navigationState\.pending\) return false/);
    assert.match(appSource, /setNavigationTriggerState\(page, true\)/);
    assert.match(appSource, /finally \{[\s\S]*cleanupNavigationOverlay\(page\)[\s\S]*setNavigationTriggerState\(page, false\)[\s\S]*navigationState\.pending = false/);
});

test("Arena overlay lifecycle is rescheduled on every render", () => {
    assert.match(arenaSource, /arenaScheduleEntranceOverlayCleanup\(page\);\s*if \(page\.dataset\.arenaPremiumUi === "1"\) return/);
    assert.match(arenaSource, /async function loadArenaPage\(\)[\s\S]*finally \{\s*arenaCleanupEntranceOverlay\(page\)/);
});

test("overlay cleanup removes every existing Arena entry overlay", () => {
    let removed = 0;
    const page = {
        querySelectorAll(selector) {
            assert.equal(selector, ".arena-v8-entry");
            return [{ remove: () => { removed += 1; } }, { remove: () => { removed += 1; } }];
        },
    };
    arena.arenaCleanupEntranceOverlay(page);
    assert.equal(removed, 2);
});
