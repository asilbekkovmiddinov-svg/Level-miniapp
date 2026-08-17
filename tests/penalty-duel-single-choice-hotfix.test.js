const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const hotfix = fs.readFileSync(path.join(__dirname, "../miniapp/pages/penalty-duel-hotfix.js"), "utf8");
const app = fs.readFileSync(path.join(__dirname, "../miniapp/app.js"), "utf8");

test("online Penalty Duel submits exactly one server-authoritative choice per shot", () => {
    assert.match(hotfix, /this\.match\.your_role === "KICK"/);
    assert.match(hotfix, /this\.api\.choices\(this\.match\.id, \{\s*direction,\s*idempotency_key: key,/s);
    assert.doesNotMatch(hotfix, /kick_direction:/);
    assert.doesNotMatch(hotfix, /keeper_direction:/);
    assert.doesNotMatch(hotfix, /expected_version:/);
    assert.match(hotfix, /Bir marta bosing/);
});

test("structured FastAPI validation errors never render as object Object", () => {
    assert.match(hotfix, /Array\.isArray\(detail\)/);
    assert.match(hotfix, /item\?\.msg \|\| item\?\.message \|\| item\?\.detail/);
    assert.match(hotfix, /formatDetail\(payload\?\.detail\)/);
    assert.doesNotMatch(hotfix, /String\(payload\?\.detail\)/);
});

test("Penalty Duel hotfix is loaded before opening the game page", () => {
    assert.match(app, /async function ensurePenaltyDuelHotfix\(\)/);
    assert.match(app, /pages\/penalty-duel-hotfix\.js\?v=1\.0\.0/);
    assert.match(app, /case "penalty-duel": await ensurePenaltyDuelHotfix\(\); await loadPenaltyDuelPage\(\); break;/);
});
