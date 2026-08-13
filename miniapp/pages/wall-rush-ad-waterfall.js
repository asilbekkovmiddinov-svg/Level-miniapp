(function exposeWallRushAdWaterfall(root, factory) {
    const api = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    if (root) root.WallRushAdWaterfall = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
    const fallbackCodes = new Set([
        "ADSGRAM_NO_FILL",
        "ADSGRAM_SDK_UNAVAILABLE",
        "ADSGRAM_SHOW_FAILED",
        "ADSGRAM_TIMEOUT",
    ]);

    function shouldFallbackToTads(error) {
        return fallbackCodes.has(String(error?.code || ""));
    }

    async function run({ showAdsgram, showTads }) {
        try {
            return { provider: "ADSGRAM", reward: await showAdsgram() };
        } catch (error) {
            if (!shouldFallbackToTads(error)) throw error;
            return { provider: "TADS", reward: await showTads(error) };
        }
    }

    return Object.freeze({ run, shouldFallbackToTads });
});
