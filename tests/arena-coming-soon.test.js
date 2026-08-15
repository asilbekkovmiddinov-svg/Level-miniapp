const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const app = fs.readFileSync(path.join(__dirname, "../miniapp/app.js"), "utf8");

test("Arena navigation opens the two-ticket Arena", () => {
    const arenaRoute = app.match(/case "arena":[\s\S]*?break;/)?.[0] || "";

    assert.match(arenaRoute, /loadArenaV3Page\(\)/);
    assert.doesNotMatch(arenaRoute, /Tez orada/);
});
