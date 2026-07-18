(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    else root.PromotionsAdminCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    const STATUSES = ["ALL", "ACTIVE", "SCHEDULED", "PAUSED", "EXPIRED", "DELETED"];
    const ACTIONS = ["NONE", "COIN_SHOP", "REFERRAL", "ARENA", "WHEEL", "PROFILE", "URL", "CUSTOM"];

    function text(value) {
        return String(value ?? "").trim();
    }

    function numberOrNull(value) {
        if (value === "" || value === null || value === undefined) return null;
        const result = Number(value);
        return Number.isFinite(result) ? result : null;
    }

    function dateOrNull(value) {
        if (!value) return null;
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date.toISOString();
    }

    function normalizePromotion(item) {
        return {
            ...item,
            id: Number(item.id),
            title: text(item.title),
            subtitle: text(item.subtitle),
            description: text(item.description),
            banner_url: text(item.banner_url),
            badge: text(item.badge),
            button_text: text(item.button_text),
            button_action: text(item.button_action || "NONE").toUpperCase(),
            button_target: text(item.button_target),
            priority: Number(item.priority || 0),
            status: text(item.status || "DRAFT").toUpperCase(),
            view_count: Number(item.view_count || 0),
            click_count: Number(item.click_count || 0),
        };
    }

    function normalizeList(payload) {
        const list = Array.isArray(payload) ? payload : payload?.data;
        if (!Array.isArray(list)) throw new Error("Promotions serveridan noto‘g‘ri javob olindi.");
        return list.map(normalizePromotion);
    }

    function dashboardCounts(items) {
        const counts = { TOTAL: items.length, ACTIVE: 0, SCHEDULED: 0, PAUSED: 0, EXPIRED: 0, DELETED: 0 };
        items.forEach((item) => {
            if (Object.prototype.hasOwnProperty.call(counts, item.status)) counts[item.status] += 1;
        });
        return counts;
    }

    function visiblePromotions(items, { filter = "ALL", search = "", sort = "PRIORITY" } = {}) {
        const query = text(search).toLocaleLowerCase("uz");
        const result = items.filter((item) => {
            const statusMatch = filter === "ALL" || item.status === filter;
            const searchMatch = !query || `${item.title} ${item.subtitle}`.toLocaleLowerCase("uz").includes(query);
            return statusMatch && searchMatch;
        });
        const time = (value) => value ? new Date(value).getTime() || 0 : 0;
        result.sort((left, right) => {
            if (sort === "CREATED") return time(right.created_at) - time(left.created_at) || right.id - left.id;
            if (sort === "UPDATED") return time(right.updated_at) - time(left.updated_at) || right.id - left.id;
            return right.priority - left.priority || right.id - left.id;
        });
        return result;
    }

    function formPayload(values) {
        const action = text(values.button_action || "NONE").toUpperCase();
        const payload = {
            title: text(values.title),
            subtitle: text(values.subtitle) || null,
            description: text(values.description) || null,
            banner_url: text(values.banner_url) || null,
            badge: text(values.badge) || null,
            priority: numberOrNull(values.priority) ?? 0,
            button_text: text(values.button_text) || null,
            button_action: action,
            button_target: text(values.button_target) || null,
            start_at: dateOrNull(values.start_at),
            end_at: dateOrNull(values.end_at),
            max_views: numberOrNull(values.max_views),
            max_clicks: numberOrNull(values.max_clicks),
        };
        if (values.status) payload.status = text(values.status).toUpperCase();
        if (!payload.title) throw new Error("Title kiritilishi shart.");
        if (payload.priority < 0) throw new Error("Priority manfiy bo‘lishi mumkin emas.");
        if (payload.max_views !== null && payload.max_views <= 0) throw new Error("Max views 0 dan katta bo‘lishi kerak.");
        if (payload.max_clicks !== null && payload.max_clicks <= 0) throw new Error("Max clicks 0 dan katta bo‘lishi kerak.");
        if (["URL", "CUSTOM"].includes(action) && !payload.button_target) throw new Error("Button target kiritilishi shart.");
        if (payload.start_at && payload.end_at && new Date(payload.end_at) <= new Date(payload.start_at)) {
            throw new Error("End datetime Start datetime’dan keyin bo‘lishi kerak.");
        }
        return payload;
    }

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>'"]/g, (char) => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
        })[char]);
    }

    return { ACTIONS, STATUSES, dashboardCounts, escapeHtml, formPayload, normalizeList, normalizePromotion, visiblePromotions };
});
