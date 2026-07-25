const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
    arenaSafeAvatarUrl,
    arenaTelegramProfile,
    arenaHeroHeader,
    arenaStakeNavigation,
    arenaQuickPlayRipple,
    arenaToast,
} = require("../miniapp/pages/arena.js");

const css = fs.readFileSync(path.join(__dirname, "../miniapp/premium-arena.css"), "utf8");

test("premium Arena hero includes brand, battle subtitle and live badge", () => {
    const html = arenaHeroHeader();
    assert.match(html, /LEVEL_GROUP ARENA/);
    assert.match(html, /Ready to Battle/);
    assert.match(html, /arena-v5-online/);
    assert.match(html, /arena-v5-identity/);
});

test("Telegram profile supports secure avatar and initial fallback", () => {
    const previous = globalThis.Telegram;
    globalThis.Telegram = { WebApp: { initDataUnsafe: { user: {
        first_name: "Ali", last_name: "Valiyev", photo_url: "https://cdn.example/ali.jpg",
    } } } };
    try {
        assert.deepEqual(arenaTelegramProfile(), {
            displayName: "Ali Valiyev",
            photoUrl: "https://cdn.example/ali.jpg",
            initial: "A",
        });
        assert.equal(arenaSafeAvatarUrl("javascript:alert(1)"), "");
        assert.equal(arenaSafeAvatarUrl("http://cdn.example/a.jpg"), "");
    } finally {
        globalThis.Telegram = previous;
    }
});

test("stake cards preserve five V4 stakes and expose premium metrics", () => {
    const html = arenaStakeNavigation();
    [100, 500, 1000, 5000, 10000].forEach((stake) => {
        assert.match(html, new RegExp(`data-arena-stake="${stake}"`));
    });
    assert.match(css, /arena-v3-stake-grid button::before/);
    assert.match(css, /linear-gradient/);
    assert.match(css, /backdrop-filter:blur/);
    assert.match(css, /arenaV5QuickShine/);
});

test("Quick Play, ripple, toast and reduced motion remain presentation-only", () => {
    assert.equal(typeof arenaQuickPlayRipple, "function");
    assert.equal(typeof arenaToast, "function");
    assert.match(css, /arena-v5-quick-play/);
    assert.match(css, /arena-v5-ripple/);
    assert.match(css, /arena-v5-toast/);
    assert.match(css, /arenaV5Skeleton/);
    assert.match(css, /prefers-reduced-motion:reduce/);
});
