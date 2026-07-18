(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    else root.PromotionsAnalyticsCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    const PERIODS = ["TODAY", "7D", "30D", "ALL"];
    const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
    function normalize(payload) {
        const source = payload?.data || payload || {};
        const metrics = Array.isArray(source.promotions) ? source.promotions : [];
        return {
            period: PERIODS.includes(source.period) ? source.period : "7D",
            summary: { views: number(source.summary?.views), unique_views: number(source.summary?.unique_views), clicks: number(source.summary?.clicks), unique_clicks: number(source.summary?.unique_clicks), unique_users: number(source.summary?.unique_users), ctr: number(source.summary?.ctr), conversion_rate: number(source.summary?.conversion_rate) },
            promotions: metrics.map((item) => ({ ...item, promotion_id: number(item.promotion_id), views: number(item.views), unique_views: number(item.unique_views), clicks: number(item.clicks), unique_clicks: number(item.unique_clicks), ctr: number(item.ctr), conversion_rate: number(item.conversion_rate) })),
            daily: Array.isArray(source.daily) ? source.daily.map((row) => ({ ...row, views: number(row.views), clicks: number(row.clicks), ctr: number(row.ctr) })) : [],
            rankings: {
                top_performing: source.top_performing || [], worst_performing: source.worst_performing || [],
                most_clicked: source.most_clicked || [], highest_ctr: source.highest_ctr || [],
            },
        };
    }
    function metricMap(analytics) { return new Map((analytics?.promotions || []).map((item) => [Number(item.promotion_id), item])); }
    function chartPoints(rows, key, width = 300, height = 90) {
        if (!rows.length) return "";
        const max = Math.max(1, ...rows.map((row) => number(row[key])));
        return rows.map((row, index) => {
            const x = rows.length === 1 ? width / 2 : index * width / (rows.length - 1);
            const y = height - (number(row[key]) / max) * (height - 8) - 4;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        }).join(" ");
    }
    return { PERIODS, normalize, metricMap, chartPoints };
});
