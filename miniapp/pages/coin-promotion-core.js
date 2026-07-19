(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    root.CoinPromotionCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    function number(value, fallback = 0) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function normalizeProduct(source) {
        const product = source && typeof source === "object" ? source : {};
        const originalPrice = number(product.original_price, number(product.price_uzs, number(product.price)));
        const promotionPrice = number(product.promotion_price, 0);
        const remainingQuantity = Math.max(0, Math.trunc(number(product.remaining_quantity, 0)));
        const promotionId = Number.isInteger(Number(product.promotion_id)) && Number(product.promotion_id) > 0
            ? Number(product.promotion_id) : null;
        const promotionStatus = String(product.promotion_status || product.status || "ACTIVE").toUpperCase();
        const endAt = product.promotion_end_at || product.end_at || null;
        const hasPromotion = Boolean(
            promotionId && promotionStatus === "ACTIVE" && remainingQuantity > 0
            && promotionPrice > 0 && promotionPrice < originalPrice
        );
        return {
            ...product,
            coin_amount: number(product.coin_amount, number(product.coins_amount)),
            original_price: originalPrice,
            promotion_price: hasPromotion ? promotionPrice : null,
            remaining_quantity: hasPromotion ? remainingQuantity : null,
            promotion_id: hasPromotion ? promotionId : null,
            promotion_status: hasPromotion ? promotionStatus : null,
            promotion_end_at: hasPromotion ? endAt : null,
            has_promotion: hasPromotion,
            display_price: hasPromotion ? promotionPrice : number(product.price_uzs, number(product.price, originalPrice)),
        };
    }

    function countdown(endAt, now = Date.now()) {
        const end = new Date(endAt).getTime();
        if (!endAt || !Number.isFinite(end)) return null;
        const seconds = Math.max(0, Math.ceil((end - now) / 1000));
        if (seconds <= 0) return { text: "00:00:00", urgent: true, expired: true };
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainder = seconds % 60;
        const pad = (value) => String(value).padStart(2, "0");
        return {
            text: days > 0 ? `${days} kun ${pad(hours)}:${pad(minutes)}` : `${pad(hours)}:${pad(minutes)}:${pad(remainder)}`,
            urgent: seconds < 60,
            expired: false,
        };
    }

    function expirePromotion(product) {
        return {
            ...product,
            promotion_price: null,
            remaining_quantity: null,
            promotion_id: null,
            promotion_status: null,
            promotion_end_at: null,
            has_promotion: false,
            display_price: number(product.price_uzs, number(product.price, product.original_price)),
        };
    }

    function normalizeOrder(source) {
        const order = source && typeof source === "object" ? source : {};
        return {
            promotionId: Number(order.promotion_id) > 0 ? Number(order.promotion_id) : null,
            lockedPrice: number(order.locked_price, number(order.price_uzs, 0)),
        };
    }

    return { normalizeProduct, normalizeOrder, countdown, expirePromotion };
});
