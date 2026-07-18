(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    else root.PromotionsUserCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    const CACHE_KEY = "levelgroup:promotions:v1";
    const INTERNAL_ACTIONS = { COIN_SHOP: "shop", REFERRAL: "referral", ARENA: "arena", WHEEL: "wheel", PROFILE: "profile" };
    const safeText = (value) => String(value ?? "");

    function normalize(items, now = Date.now()) {
        return (Array.isArray(items) ? items : []).map((item) => ({
            ...item, id: Number(item.id), priority: Number(item.priority || 0),
            button_action: safeText(item.button_action || "NONE").toUpperCase(),
        })).filter((item) => Number.isInteger(item.id) && item.id > 0 && (!item.end_at || new Date(item.end_at).getTime() > now))
            .sort((a, b) => b.priority - a.priority || a.id - b.id);
    }

    function remaining(endAt, now = Date.now()) {
        if (!endAt) return null;
        const total = Math.max(0, new Date(endAt).getTime() - now);
        const seconds = Math.floor(total / 1000);
        return { expired: total <= 0, days: Math.floor(seconds / 86400), hours: Math.floor(seconds % 86400 / 3600), minutes: Math.floor(seconds % 3600 / 60), seconds: seconds % 60 };
    }

    function countdown(endAt, now = Date.now()) {
        const value = remaining(endAt, now);
        if (!value) return "Doimiy taklif";
        if (value.expired) return "Yakunlandi";
        return `${value.days ? `${value.days} kun ` : ""}${String(value.hours).padStart(2, "0")}:${String(value.minutes).padStart(2, "0")}:${String(value.seconds).padStart(2, "0")}`;
    }

    function resolveAction(item) {
        const action = safeText(item?.button_action).toUpperCase();
        if (INTERNAL_ACTIONS[action]) return { type: "page", target: INTERNAL_ACTIONS[action] };
        const target = safeText(item?.button_target).trim();
        if (action === "URL" && /^https:\/\//i.test(target)) return { type: "url", target };
        if (action === "CUSTOM") {
            if (/^https:\/\//i.test(target)) return { type: "url", target };
            const page = target.replace(/^page:/i, "").toLowerCase();
            if (["shop", "referral", "arena", "wheel", "profile", "p2p", "wallet", "orders"].includes(page)) return { type: "page", target: page };
        }
        return { type: "none", target: "" };
    }

    function save(storage, items, savedAt = Date.now()) { storage?.setItem(CACHE_KEY, JSON.stringify({ savedAt, items })); }
    function load(storage, now = Date.now(), maxAge = 86400000) {
        try {
            const cached = JSON.parse(storage?.getItem(CACHE_KEY) || "null");
            return cached && now - Number(cached.savedAt) <= maxAge ? normalize(cached.items, now) : [];
        } catch (_error) { return []; }
    }
    return { CACHE_KEY, normalize, remaining, countdown, resolveAction, save, load };
});
