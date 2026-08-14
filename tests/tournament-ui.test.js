const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const page = fs.readFileSync("miniapp/pages/tournament.js", "utf8");
const core = fs.readFileSync("miniapp/pages/division-core.js", "utf8");
const css = fs.readFileSync("miniapp/tournament.css", "utf8");
const html = fs.readFileSync("miniapp/index.html", "utf8");

test("Arena exposes Division and Tournament through one mobile switch", () => {
    assert.match(core, /data-competition="division"/);
    assert.match(core, /data-competition="tournament"/);
    assert.match(page, /competitionTabsMarkup\("tournament"\)/);
    assert.ok(html.indexOf("tournament-core.js") < html.indexOf("tournament-api.js"));
    assert.ok(html.indexOf("tournament-api.js") < html.indexOf("pages/tournament.js"));
});

test("user Tournament page covers application assignment match and tables", () => {
    assert.match(page, /data-tournament-apply/);
    assert.match(page, /tournament-ticket-balance/);
    assert.match(page, /SIZNING MATCHINGIZ/);
    assert.match(page, /data-tournament-countdown/);
    assert.match(page, /data-tournament-arena/);
    assert.match(page, /Guruh reytingi/);
    assert.match(page, /Pley-off bracket/);
    assert.match(page, /Olimpik bracket/);
    assert.match(page, /O‘yinlar va natijalar/);
});

test("Tournament layout stays responsive without a horizontal scroll surface", () => {
    assert.match(css, /\.tournament-page\{overflow-x:hidden\}/);
    assert.match(css, /\.tournament-rounds\{display:grid/);
    assert.match(css, /grid-template-columns:minmax\(0,1fr\) 42px minmax\(0,1fr\)/);
    assert.match(css, /@media\(max-width:390px\)/);
    assert.doesNotMatch(css, /overflow-x:auto/);
});
