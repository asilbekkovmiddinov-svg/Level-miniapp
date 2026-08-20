const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const hotfix = fs.readFileSync(path.join(__dirname, "../miniapp/pages/penalty-duel-hotfix.js"), "utf8");
const app = fs.readFileSync(path.join(__dirname, "../miniapp/app.js"), "utf8");

test("online Penalty Duel submits one role-driven choice per shot", () => {
    assert.ok(hotfix.includes('this.match.your_role === "KICK"'));
    assert.ok(hotfix.includes("const matchId = this.match.id;"));
    assert.ok(hotfix.includes("const match = await this.api.choices(matchId, { direction, idempotency_key: key });"));
    assert.ok(hotfix.includes("direction"));
    assert.ok(hotfix.includes("idempotency_key: key"));
    assert.equal(hotfix.includes("kick_direction:"), false);
    assert.equal(hotfix.includes("keeper_direction:"), false);
    assert.equal(hotfix.includes("expected_version:"), false);
    assert.ok(hotfix.includes("Bir marta bosing"));
});

test("structured FastAPI validation errors are normalized to readable text", () => {
    assert.ok(hotfix.includes("Array.isArray(detail)"));
    assert.ok(hotfix.includes("item?.msg || item?.message || item?.detail"));
    assert.ok(hotfix.includes("formatDetail(payload?.detail)"));
    assert.equal(hotfix.includes("String(payload?.detail)"), false);
});

test("Penalty Duel hotfix loads before the game page", () => {
    assert.ok(app.includes("async function ensurePenaltyDuelHotfix()"));
    assert.ok(app.includes('pages/penalty-duel-hotfix.js?v=1.0.0'));
    const ensureIndex = app.indexOf('case "penalty-duel": await ensurePenaltyDuelHotfix();');
    const loadIndex = app.indexOf("await loadPenaltyDuelPage();", ensureIndex);
    assert.ok(ensureIndex >= 0);
    assert.ok(loadIndex > ensureIndex);
});
