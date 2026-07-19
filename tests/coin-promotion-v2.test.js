const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const core = require("../miniapp/pages/coin-promotion-core.js");

test("promotion card uses only authoritative backend promotion fields", () => {
    const product = core.normalizeProduct({
        id: 7, coin_amount: 130, price: 25000, original_price: 25000,
        promotion_price: 15000, remaining_quantity: 4, promotion_id: 31,
        promotion_status: "ACTIVE", promotion_end_at: "2026-07-21T12:00:00Z",
    });
    assert.equal(product.has_promotion, true);
    assert.equal(product.display_price, 15000);
    assert.equal(product.original_price, 25000);
    assert.equal(product.remaining_quantity, 4);
    assert.equal(product.promotion_id, 31);
    assert.equal(product.promotion_end_at, "2026-07-21T12:00:00Z");
});

test("inactive backend promotion is always an ordinary card", () => {
    const product = core.normalizeProduct({
        price: 25000, original_price: 25000, promotion_price: 15000,
        remaining_quantity: 4, promotion_id: 31, promotion_status: "PAUSED",
    });
    assert.equal(product.has_promotion, false);
    assert.equal(product.display_price, 25000);
});

test("countdown follows the required formats and urgent boundary", () => {
    const now = Date.parse("2026-07-19T12:00:00Z");
    assert.deepEqual(core.countdown("2026-07-20T13:02:00Z", now), {
        text: "1 kun 01:02", urgent: false, expired: false,
    });
    assert.deepEqual(core.countdown("2026-07-19T12:59:59Z", now), {
        text: "00:59:59", urgent: false, expired: false,
    });
    assert.equal(core.countdown("2026-07-19T12:00:59Z", now).urgent, true);
    assert.equal(core.countdown("2026-07-19T11:59:59Z", now).expired, true);
});

test("expired countdown removes promotion without changing backend prices", () => {
    const product = core.normalizeProduct({
        price: 25000, original_price: 25000, promotion_price: 15000,
        remaining_quantity: 4, promotion_id: 31, promotion_end_at: "2026-07-19T12:00:00Z",
    });
    const expired = core.expirePromotion(product);
    assert.equal(expired.has_promotion, false);
    assert.equal(expired.display_price, 25000);
    assert.equal(expired.promotion_id, null);
});

test("ordinary and ended promotions render the ordinary backend price", () => {
    const ordinary = core.normalizeProduct({ id: 7, price: 25000 });
    const ended = core.normalizeProduct({
        id: 7, price: 25000, original_price: 25000,
        promotion_price: 15000, remaining_quantity: 0, promotion_id: 31,
    });
    assert.equal(ordinary.has_promotion, false);
    assert.equal(ordinary.display_price, 25000);
    assert.equal(ended.has_promotion, false);
    assert.equal(ended.display_price, 25000);
    assert.equal(ended.promotion_id, null);
    assert.equal(ended.remaining_quantity, null);
});

test("order result keeps backend locked price and promotion identity", () => {
    assert.deepEqual(core.normalizeOrder({ locked_price: 15000, price_uzs: 25000, promotion_id: 31 }), {
        lockedPrice: 15000, promotionId: 31,
    });
    assert.deepEqual(core.normalizeOrder({ locked_price: 25000, promotion_id: null }), {
        lockedPrice: 25000, promotionId: null,
    });
});

test("Coin Shop UI includes premium promotion, remaining and near-live refresh UX", () => {
    const source = fs.readFileSync(path.join(__dirname, "../miniapp/pages/shop.js"), "utf8");
    const css = fs.readFileSync(path.join(__dirname, "../miniapp/coin-promotion.css"), "utf8");
    const html = fs.readFileSync(path.join(__dirname, "../miniapp/index.html"), "utf8");
    assert.match(source, /🔥 Flash Sale/);
    assert.match(source, /<del>\$\{formatMoney\(product\.original_price\)\} UZS<\/del>/);
    assert.match(source, /Qoldi: \$\{product\.remaining_quantity\} ta/);
    assert.match(source, /SHOP_PROMOTION_REFRESH_MS = 15000/);
    assert.match(source, /setInterval\(updateShopPromotionCountdowns, 1000\)/);
    assert.match(source, /CoinPromotionCore\.expirePromotion/);
    assert.match(source, /result\.data\?\.locked_price/);
    assert.match(source, /result\.data\?\.promotion_id/);
    assert.match(source, /createOrder\(productId, region, shopOrderAttempt\.idempotencyKey\)/);
    assert.doesNotMatch(source, /createOrder\([^\n]*promotion_id/);
    assert.match(css, /coin-promotion-badge/);
    assert.match(css, /coin-promotion-countdown\.is-urgent/);
    assert.match(css, /prefers-reduced-motion/);
    assert.match(html, /coin-promotion\.css/);
    assert.match(html, /coin-promotion-core\.js/);
});
