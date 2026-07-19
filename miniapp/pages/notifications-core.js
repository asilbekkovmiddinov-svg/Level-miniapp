(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    else root.NotificationsCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    const CACHE_KEY = "levelgroup:notifications:v1";
    const STATUSES = ["ALL", "UNREAD", "READ"];
    const ICONS = { COIN_SHOP: "🛒", REFERRAL: "🤝", ARENA: "⚔️", WHEEL: "🎁", PROFILE: "👤", URL: "↗", CUSTOM: "◆", NONE: "🔔" };

    function normalize(items) {
        return (Array.isArray(items) ? items : []).map((item) => ({
            ...item, id: Number(item.id), promotion_id: item.promotion_id == null ? null : Number(item.promotion_id),
            status: String(item.status || "UNREAD").toUpperCase(), button_action: String(item.button_action || "NONE").toUpperCase(),
        })).filter((item) => Number.isInteger(item.id) && item.id > 0 && ["UNREAD", "READ", "CLICKED", "DISMISSED"].includes(item.status) && item.status !== "DISMISSED")
            .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0) || b.id - a.id);
    }

    function visible(items, { filter = "ALL", search = "" } = {}) {
        const query = String(search).trim().toLocaleLowerCase("uz");
        return normalize(items).filter((item) => {
            const unread = item.status === "UNREAD";
            const matchesFilter = filter === "ALL" || (filter === "UNREAD" && unread) || (filter === "READ" && !unread);
            return matchesFilter && (!query || `${item.title || ""} ${item.message || ""}`.toLocaleLowerCase("uz").includes(query));
        });
    }

    function unreadCount(items) { return normalize(items).filter((item) => item.status === "UNREAD").length; }
    function icon(action) { return ICONS[String(action || "NONE").toUpperCase()] || ICONS.NONE; }
    function save(storage, items, savedAt = Date.now()) { storage?.setItem(CACHE_KEY, JSON.stringify({ savedAt, items: normalize(items) })); }
    function load(storage, now = Date.now(), maxAge = 86400000) {
        try {
            const data = JSON.parse(storage?.getItem(CACHE_KEY) || "null");
            return data && now - Number(data.savedAt) <= maxAge ? normalize(data.items) : [];
        } catch (_error) { return []; }
    }
    return { CACHE_KEY, STATUSES, normalize, visible, unreadCount, icon, save, load };
});
