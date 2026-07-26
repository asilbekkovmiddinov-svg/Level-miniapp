(function exposeWheelRewardedAds(root, factory) {
    const api = factory(root);
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    if (root) root.WheelRewardedAds = api;
})(typeof globalThis !== "undefined" ? globalThis : this, (root) => {
    const slots = Object.freeze([
        Object.freeze({ id: "1", label: "Watch Ad #1", provider: "ADSGRAM", fallbackProviders: Object.freeze(["MONETAG"]) }),
        Object.freeze({ id: "2", label: "Watch Ad #2", provider: "ADSGRAM", fallbackProviders: Object.freeze(["MONETAG"]) }),
        Object.freeze({ id: "3", label: "Watch Ad #3", provider: "ADSGRAM", fallbackProviders: Object.freeze(["MONETAG"]) }),
    ]);

    const AdsgramProvider = Object.freeze({
        getName: () => "ADSGRAM",
        isAvailable: (adapters = {}) => adapters.ADSGRAM_AVAILABLE !== false
            && typeof adapters.ADSGRAM === "function",
        showRewarded: async (adapters = {}) => {
            if (!AdsgramProvider.isAvailable(adapters)) {
                throw new Error("Adsgram provider mavjud emas.");
            }
            return adapters.ADSGRAM();
        },
    });

    const MonetagProvider = Object.freeze({
        getName: () => "MONETAG",
        isAvailable: () => typeof root?.show_11422269 === "function",
        showRewarded: async () => {
            if (!MonetagProvider.isAvailable()) {
                throw new Error("Monetag provider mavjud emas.");
            }
            return root.show_11422269("pop");
        },
    });

    const providers = Object.freeze({
        ADSGRAM: AdsgramProvider,
        MONETAG: Object.freeze({
            getName: MonetagProvider.getName,
            isAvailable: (adapters = {}) => typeof adapters.MONETAG === "function"
                && MonetagProvider.isAvailable(),
            showRewarded: async (adapters = {}) => {
                if (typeof adapters.MONETAG !== "function" || !MonetagProvider.isAvailable()) {
                    throw new Error("Monetag provider mavjud emas.");
                }
                return adapters.MONETAG();
            },
        }),
    });

    function getSlot(slotId) {
        return slots.find((slot) => slot.id === String(slotId)) || null;
    }

    async function run(slotId, adapters = {}) {
        const slot = getSlot(slotId);
        if (!slot) throw new Error("Rewarded reklama sloti topilmadi.");

        const providerNames = [slot.provider, ...(slot.fallbackProviders || [])];
        const provider = providerNames
            .map((name) => providers[name])
            .find((candidate) => candidate?.isAvailable(adapters));
        if (!provider) throw new Error("Rewarded reklama provideri mavjud emas.");
        return provider.showRewarded(adapters);
    }

    return Object.freeze({
        slots,
        providers,
        AdsgramProvider,
        MonetagProvider,
        getSlot,
        run,
    });
});
