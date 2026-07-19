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
        const hasPromotion = Boolean(
            promotionId && remainingQuantity > 0 && promotionPrice > 0 && promotionPrice < originalPrice
        );
        return {
            ...product,
            coin_amount: number(product.coin_amount, number(product.coins_amount)),
            original_price: originalPrice,
            promotion_price: hasPromotion ? promotionPrice : null,
            remaining_quantity: hasPromotion ? remainingQuantity : null,
            promotion_id: hasPromotion ? promotionId : null,
            has_promotion: hasPromotion,
            display_price: hasPromotion ? promotionPrice : number(product.price_uzs, number(product.price, originalPrice)),
        };
    }

    function normalizeOrder(source) {
        const order = source && typeof source === "object" ? source : {};
        return {
            promotionId: Number(order.promotion_id) > 0 ? Number(order.promotion_id) : null,
            lockedPrice: number(order.locked_price, number(order.price_uzs, 0)),
        };
    }

    return { normalizeProduct, normalizeOrder };
});
