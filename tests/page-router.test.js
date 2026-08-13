const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const read = (file) => fs.readFileSync(path.join(__dirname, "../miniapp", file), "utf8");
const app = read("app.js");
const navbar = read("components/navbar.js");
const polish = read("global-premium-polish.css");
const home = read("home.css");
const html = read("index.html");

test("page mount makes exactly the selected top-level page interactive", () => {
    assert.match(app, /querySelectorAll\(":scope > \.page"\)/);
    assert.match(app, /page\.hidden = !active/);
    assert.match(app, /page\.inert = !active/);
    assert.match(app, /setAttribute\("aria-hidden", String\(!active\)\)/);
    assert.match(app, /classList\.toggle\("active-page", active\)/);
});

test("every navigation opens at the top through one router", () => {
    assert.match(app, /nextPage\.scrollTop = 0/);
    assert.match(app, /pageContent\.scrollTop = 0/);
    assert.match(app, /window\.scrollTo\(\{ top: 0, left: 0, behavior: "auto" \}\)/);
    assert.match(navbar, /await openPage\(page\)/);
    assert.doesNotMatch(navbar, /switch \(page\)/);
});

test("internal router preserves the explicit promotion return target", () => {
    assert.match(app, /async function openPage\(page, options = \{\}\)/);
    assert.match(app, /pageReturnTarget = options\.returnPage \|\| null/);
    assert.match(app, /async function handlePageBack/);
});

test("hidden page state wins over module-specific display declarations", () => {
    assert.match(home, /#homePage\{[^}]*display:grid/);
    assert.match(polish, /\.page\[hidden\]\{display:none!important\}/);
    assert.ok(html.indexOf("home.css") < html.indexOf("global-premium-polish.css"));
});

test("all module mounts remain isolated direct children of pageContent", () => {
    const pageIds = [...html.matchAll(/<section id="([^"]+Page)" class="page(?: active-page)?"/g)]
        .map((match) => match[1]);
    assert.deepEqual(pageIds, [
        "homePage", "p2pPage", "wallRushPage", "arenaPage", "shopPage", "wheelPage",
        "ordersPage", "profilePage", "supportPage", "referralPage", "walletPage",
        "promotionsAdminPage", "promotionsPage", "divisionAdminPage",
        "tournamentAdminPage", "notificationsPage",
        "coinPromotionAdminPage", "wheelOrderAdminPage",
    ]);
});
