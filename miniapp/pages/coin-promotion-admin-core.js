(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    else root.CoinPromotionAdminCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    const STATUSES = ["ALL", "DRAFT", "ACTIVE", "PAUSED", "EXPIRED", "DELETED"];
    const text = (value) => String(value ?? "").trim();
    const number = (value) => Number(value || 0);

    function normalize(item) {
        return {
            ...item,
            id: number(item.id),
            coin_package_id: number(item.coin_package_id),
            title: text(item.title),
            original_price: number(item.original_price),
            promotion_price: number(item.promotion_price),
            total_quantity: number(item.total_quantity),
            reserved_quantity: number(item.reserved_quantity),
            sold_quantity: number(item.sold_quantity),
            remaining_quantity: number(item.remaining_quantity),
            per_user_limit: number(item.per_user_limit),
            status: text(item.status || "DRAFT").toUpperCase(),
        };
    }

    function normalizeList(payload) {
        const list = Array.isArray(payload) ? payload : payload?.data;
        if (!Array.isArray(list)) throw new Error("Coin Promotions javobi noto‘g‘ri.");
        return list.map(normalize);
    }

    function normalizePackages(payload) {
        const list = Array.isArray(payload) ? payload : payload?.data;
        if (!Array.isArray(list)) throw new Error("Coin packages javobi noto‘g‘ri.");
        return list.map((item) => ({
            id: number(item.id), title: text(item.title || item.name),
            coin_amount: number(item.coin_amount ?? item.coins_amount),
            price: number(item.price ?? item.price_uzs), category: text(item.category),
        })).filter((item) => item.id > 0);
    }

    function payload(values, packages) {
        const selected = packages.find((item) => item.id === number(values.coin_package_id));
        if (!selected) throw new Error("Coin package tanlang.");
        const promotionPrice = number(values.promotion_price);
        const totalQuantity = number(values.total_quantity);
        const start = new Date(values.start_at);
        const end = new Date(values.end_at);
        if (!(promotionPrice > 0 && promotionPrice < selected.price)) {
            throw new Error("Promotion narxi original narxdan kichik bo‘lishi kerak.");
        }
        if (totalQuantity <= 0) throw new Error("Total quantity 0 dan katta bo‘lishi kerak.");
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
            throw new Error("End time Start time’dan keyin bo‘lishi kerak.");
        }
        return {
            coin_package_id: selected.id,
            title: text(values.title),
            original_price: selected.price,
            promotion_price: promotionPrice,
            total_quantity: totalQuantity,
            per_user_limit: number(values.per_user_limit),
            start_at: start.toISOString(),
            end_at: end.toISOString(),
        };
    }

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>'"]/g, (char) => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
        })[char]);
    }

    return { STATUSES, escapeHtml, normalize, normalizeList, normalizePackages, payload };
});
