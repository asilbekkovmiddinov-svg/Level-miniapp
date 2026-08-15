const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const page = fs.readFileSync("miniapp/pages/tournament.js", "utf8");
const admin = fs.readFileSync("miniapp/pages/tournament-admin.js", "utf8");
const core = fs.readFileSync("miniapp/pages/division-core.js", "utf8");
const css = fs.readFileSync("miniapp/tournament.css", "utf8");
const html = fs.readFileSync("miniapp/index.html", "utf8");

test("Arena exposes Arena Division and Tournament through one mobile switch", () => {
    assert.match(core, /data-competition="arena"/);
    assert.match(core, /data-competition="division"/);
    assert.match(core, /data-competition="tournament"/);
    assert.match(page, /competitionTabsMarkup\("tournament"\)/);
    assert.ok(html.indexOf("tournament-core.js") < html.indexOf("tournament-api.js"));
    assert.ok(html.indexOf("tournament-api.js") < html.indexOf("pages/tournament.js"));
});

test("user Tournament page covers one-time entry group match and admin result", () => {
    assert.match(page, /data-tournament-apply/);
    assert.match(page, /tournament-ticket-balance/);
    assert.match(page, /SIZNING MATCHINGIZ/);
    assert.match(page, /data-tournament-countdown/);
    assert.match(page, /Qatnashish ticketi bir marta/);
    assert.match(page, /Guruhlar/);
    assert.match(page, /Natija admin tomonidan kiritildi/);
    assert.match(page, /O‘yinlar va natijalar/);
    assert.doesNotMatch(page, /data-tournament-arena/);
});

test("Tournament layout stays responsive without a horizontal scroll surface", () => {
    assert.match(css, /\.tournament-page\{overflow-x:hidden\}/);
    assert.match(css, /\.tournament-admin-match form\{display:grid/);
    assert.match(css, /grid-template-columns:minmax\(0,1fr\) 42px minmax\(0,1fr\)/);
    assert.match(css, /@media\(max-width:390px\)/);
    assert.doesNotMatch(css, /overflow-x:auto/);
});

test("simple admin UI configures groups schedules matches and writes result", () => {
    assert.match(admin, /name="ticket_cost"/);
    assert.match(admin, /name="group_mode"/);
    assert.match(admin, /name="group_size"/);
    assert.match(admin, /name="qualifiers_per_group"/);
    assert.match(admin, /tournamentParticipantSearch/);
    assert.match(admin, /data-tournament-result/);
    assert.match(admin, /data-tournament-finalize/);
    assert.doesNotMatch(admin, /data-tournament-open-round/);
    assert.doesNotMatch(admin, /data-tournament-advance-round/);
});
