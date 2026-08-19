(function exposeWallRushAdWaterfall(root, factory) {
    const api = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    if (root) root.WallRushAdWaterfall = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
    const PROVIDERS = Object.freeze(["ADSGRAM", "TELEGA"]);

    function normalizeProvider(provider) {
        return String(provider || "").toUpperCase() === "TELEGA" ? "TELEGA" : "ADSGRAM";
    }

    function nextProvider(provider) {
        return normalizeProvider(provider) === "ADSGRAM" ? "TELEGA" : "ADSGRAM";
    }

    async function run({ provider, showAdsgram, showTelega }) {
        const selected = normalizeProvider(provider);
        if (selected === "TELEGA") {
            return { provider: "TELEGA", reward: await showTelega() };
        }
        return { provider: "ADSGRAM", reward: await showAdsgram() };
    }

    return Object.freeze({ PROVIDERS, run, normalizeProvider, nextProvider });
});
