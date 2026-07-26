const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const support = require("../miniapp/pages/support.js");
const root = path.resolve(__dirname, "..");
const profile = fs.readFileSync(path.join(root, "miniapp/pages/profile.js"), "utf8");
const app = fs.readFileSync(path.join(root, "miniapp/app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "miniapp/index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "miniapp/support.css"), "utf8");

function response(payload, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => payload,
    };
}

test("Support Center reads its Telegram username only from backend config", async () => {
    let request;
    const client = new support.SupportApiClient({
        baseUrl: "https://backend.example",
        fetchImpl: async (url, options) => {
            request = { url, options };
            return response({ support_telegram_username: "@Dynamic_Admin" });
        },
    });

    assert.deepEqual(await client.config(), { username: "Dynamic_Admin" });
    assert.equal(new URL(request.url).pathname, "/support/config");
    assert.equal(request.options.method, "GET");
    assert.doesNotMatch(fs.readFileSync(path.join(root, "miniapp/pages/support.js"), "utf8"), /ADMIN_USERNAME/);
});

test("all four support topics use the same safe Telegram destination", () => {
    assert.equal(support.SUPPORT_TOPICS.length, 4);
    for (const topic of support.SUPPORT_TOPICS) {
        const url = new URL(support.supportTelegramUrl("@Dynamic_Admin", topic.key));
        assert.equal(url.hostname, "t.me");
        assert.equal(url.pathname, "/Dynamic_Admin");
        assert.match(url.searchParams.get("text"), new RegExp(topic.title));
    }
    assert.equal(support.supportTelegramUrl("bad-name"), null);
});

test("Support Center is routed from Profile with premium responsive UI", () => {
    assert.match(profile, /openPage\('support'\)/);
    assert.match(profile, /🎧/);
    assert.match(app, /case "support":\s*await loadSupportPage\(\)/);
    assert.match(html, /id="supportPage"/);
    assert.match(html, /support\.css/);
    assert.match(html, /pages\/support\.js/);
    for (const selector of [".support-hero", ".support-grid", ".support-warning", ".support-admin"]) {
        assert.ok(css.includes(selector));
    }
    assert.match(css, /@media\(min-width:700px\)/);
    assert.match(css, /@media\(max-width:370px\)/);
    assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
});
