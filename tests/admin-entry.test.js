const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const profile = fs.readFileSync(path.join(__dirname, "../miniapp/pages/profile.js"), "utf8");

test("Profile admin entry uses the existing authoritative admin API", () => {
    assert.match(profile, /new PromotionsAdminApi\(\{ baseUrl: API_URL \}\)/);
    assert.match(profile, /await adminApi\.list\(\)/);
    assert.match(profile, /profileAdminAccess = await checkProfileAdminAccess\(\)/);
    assert.doesNotMatch(profile, /X-Internal-Api-Key|isAdmin|adminTelegramIds|allowlist/i);
});

test("Admin card is absent unless backend access succeeds", () => {
    assert.match(profile, /profileAdminAccess \? `/);
    assert.match(profile, /catch \(_error\) \{\s*return false;/);
    assert.match(profile, /🛠/);
    assert.match(profile, /<strong>Admin Panel<\/strong>/);
});

test("Admin entry reuses the existing promotions query route", () => {
    assert.match(profile, /window\.location\.assign\("\?admin=promotions"\)/);
    assert.doesNotMatch(profile, /URLSearchParams|query\.get/);
});
