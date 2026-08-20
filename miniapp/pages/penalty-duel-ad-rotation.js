(function exposePenaltyDuelAdRotation(root, factory) {
    const api = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    if (root) root.PenaltyDuelAdRotation = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
    const PROVIDERS = Object.freeze(["ADSGRAM", "TADS", "TELEGA", "ONCLICKA"]);

    function normalizeProvider(provider) {
        const normalized = String(provider || "").trim().toUpperCase();
        return PROVIDERS.includes(normalized) ? normalized : PROVIDERS[0];
    }

    function orderedProviders(startProvider) {
        const start = PROVIDERS.indexOf(normalizeProvider(startProvider));
        return PROVIDERS.map((_, offset) => PROVIDERS[(start + offset) % PROVIDERS.length]);
    }

    function stopsRotation(error) {
        return error?.fallback === false || String(error?.code || "").endsWith("_CANCELLED");
    }

    async function run({ startProvider, adapters, onAttempt }) {
        let lastError;
        for (const provider of orderedProviders(startProvider)) {
            try {
                onAttempt?.(provider);
                const adapter = adapters?.[provider];
                if (typeof adapter !== "function") {
                    const unavailable = new Error(`${provider} integratsiyasi mavjud emas.`);
                    unavailable.code = `${provider}_SDK_UNAVAILABLE`;
                    throw unavailable;
                }
                return { provider, reward: await adapter() };
            } catch (error) {
                lastError = error;
                if (stopsRotation(error)) throw error;
            }
        }
        const exhausted = new Error("Hozir hech bir tarmoqda reklama topilmadi.");
        exhausted.code = "AD_ROTATION_EXHAUSTED";
        exhausted.cause = lastError;
        throw exhausted;
    }

    return Object.freeze({ PROVIDERS, normalizeProvider, orderedProviders, run, stopsRotation });
});
