const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const {
    safeUserAvatarUrl,
    normalizeBackendUser,
    userAvatarComponent,
} = require("../miniapp/components/user-avatar.js");
const { p2pTradeParticipants } = require("../miniapp/pages/p2p.js");

test("avatar accepts only backend HTTPS photo URLs", () => {
    assert.equal(safeUserAvatarUrl("javascript:alert(1)"), "");
    assert.equal(safeUserAvatarUrl("http://example.com/avatar.jpg"), "");
    assert.equal(safeUserAvatarUrl("https://cdn.example.com/avatar.jpg"), "https://cdn.example.com/avatar.jpg");
});

test("backend user normalization uses profile fields without deriving from telegram ID", () => {
    const user = normalizeBackendUser({
        owner_display_name: "Ali Valiyev", owner_username: "ali",
        owner_photo_url: "https://cdn.example.com/a.jpg", owner_is_online: true,
        owner_id: 123,
    }, "owner");
    assert.deepEqual(user, {
        displayName: "Ali Valiyev", username: "@ali",
        photoUrl: "https://cdn.example.com/a.jpg", online: true, onlineText: "Online",
    });
    assert.equal(user.photoUrl.includes("123"), false);
});

test("avatar component renders skeleton, premium image and LG fallback", () => {
    const image = userAvatarComponent({ displayName: "Ali", username: "@ali", photoUrl: "https://cdn.example.com/a.jpg", online: true, onlineText: "Online" }, { size: "lg", showInfo: true });
    assert.match(image, /user-avatar-skeleton/);
    assert.match(image, /loading="lazy"/);
    assert.match(image, /userAvatarImageFailed/);
    assert.match(image, /Ali/);
    const fallback = userAvatarComponent({ displayName: "User", username: "", photoUrl: "", online: false, onlineText: "Offline" });
    assert.match(fallback, /is-fallback/);
    assert.match(fallback, />LG</);
});

test("trade participants map buyer and seller from backend roles", () => {
    const sell = p2pTradeParticipants({
        order_type: "SELL", owner_display_name: "Seller", requester_display_name: "Buyer",
    });
    assert.equal(sell.buyer.displayName, "Buyer");
    assert.equal(sell.seller.displayName, "Seller");
    const buy = p2pTradeParticipants({
        order_type: "BUY", owner_display_name: "Buyer", requester_display_name: "Seller",
    });
    assert.equal(buy.buyer.displayName, "Buyer");
    assert.equal(buy.seller.displayName, "Seller");
});

test("P2P pages use the reusable avatar component", () => {
    const p2p = fs.readFileSync(path.join(__dirname, "../miniapp/pages/p2p.js"), "utf8");
    const html = fs.readFileSync(path.join(__dirname, "../miniapp/index.html"), "utf8");
    assert.match(p2p, /p2pBackendUser\(order, "owner"\)/);
    assert.match(p2p, /p2pAvatar/);
    assert.match(p2p, /p2pTradeParticipants/);
    assert.match(html, /components\/user-avatar\.js/);
});
