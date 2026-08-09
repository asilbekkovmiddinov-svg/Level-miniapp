const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const app = fs.readFileSync(path.join(__dirname, "../miniapp/app.js"), "utf8");

test("Arena navigation is disabled with a coming soon notice", () => {
    const arenaRoute = app.match(/case "arena":[\s\S]*?break;/)?.[0] || "";

    assert.match(arenaRoute, /Modal\.alert\("Arena", "Tez orada"\)/);
    assert.doesNotMatch(arenaRoute, /loadArenaPage\(/);
});
