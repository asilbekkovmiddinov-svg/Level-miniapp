(function exposePenaltyDuelAdRotation(root, factory) {
    const api = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    if (root) root.PenaltyDuelAdRotation = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
    const PROVIDERS = Object.freeze(["ADSGRAM", "TADS", "TELEGA"]);
    const SUPPORTED_PROVIDERS = Object.freeze([...PROVIDERS, "ONCLICKA"]);

    function normalizeProviders(providers) {
        if (!Array.isArray(providers)) return PROVIDERS;
        const normalized = providers
            .map((provider) => String(provider || "").trim().toUpperCase())
            .filter((provider, index, values) => (
                SUPPORTED_PROVIDERS.includes(provider) && values.indexOf(provider) === index
            ));
        return normalized.length ? normalized : PROVIDERS;
    }

    function normalizeProvider(provider, providers) {
        const activeProviders = normalizeProviders(providers);
        const normalized = String(provider || "").trim().toUpperCase();
        return activeProviders.includes(normalized) ? normalized : activeProviders[0];
    }

    function orderedProviders(startProvider, providers) {
        const activeProviders = normalizeProviders(providers);
        const start = activeProviders.indexOf(normalizeProvider(startProvider, activeProviders));
        return activeProviders.map((_, offset) => (
            activeProviders[(start + offset) % activeProviders.length]
        ));
    }

    function stopsRotation(error) {
        return error?.fallback === false;
    }

    async function run({ startProvider, providers, adapters, onAttempt }) {
        let lastError;
        for (const provider of orderedProviders(startProvider, providers)) {
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

    return Object.freeze({
        PROVIDERS,
        SUPPORTED_PROVIDERS,
        normalizeProviders,
        normalizeProvider,
        orderedProviders,
        run,
        stopsRotation,
    });
});
