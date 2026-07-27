(function exposeWheelRewardedAds(root, factory) {
    const api = factory(root);
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    if (root) root.WheelRewardedAds = api;
})(typeof globalThis !== "undefined" ? globalThis : this, (root) => {
    const slots = Object.freeze([
        Object.freeze({ id: "1", label: "Watch Ad", subtitle: "Get 1 Spin", provider: "ADSGRAM" }),
        Object.freeze({ id: "2", label: "Watch Ad", subtitle: "Get 1 Spin", provider: "MONETAG" }),
    ]);

    function providerLog(level, event, detail = {}) {
        root?.console?.[level]?.(`[WheelAds] ${event}`, detail);
    }

    function providerError(error) {
        return {
            name: error?.name || "Error",
            code: error?.code || null,
            message: error?.message || String(error),
        };
    }

    function requireRewardedResult(result, providerName) {
        if (result?.done === true && result?.error !== true) return result;
        const error = new Error(`${providerName} reklama reward bermadi.`);
        error.code = `${providerName}_NOT_REWARDED`;
        throw error;
    }

    const AdsgramProvider = Object.freeze({
        getName: () => "ADSGRAM",
        isAvailable: (adapters = {}) => adapters.ADSGRAM_AVAILABLE !== false
            && typeof adapters.ADSGRAM === "function",
        showRewarded: async (adapters = {}) => {
            if (!AdsgramProvider.isAvailable(adapters)) {
                const error = new Error("Adsgram provider mavjud emas.");
                error.code = "ADSGRAM_UNAVAILABLE";
                throw error;
            }
            return requireRewardedResult(await adapters.ADSGRAM(), "ADSGRAM");
        },
    });

    const MonetagProvider = Object.freeze({
        getName: () => "MONETAG",
        isAvailable: () => typeof root?.show_11422269 === "function",
        showRewarded: async (options = {}) => {
            if (!MonetagProvider.isAvailable()) {
                const error = new Error("Monetag SDK yuklanmadi.");
                error.code = "MONETAG_SDK_UNAVAILABLE";
                throw error;
            }
            providerLog("info", "monetag_show_called", { zone: "11422269", format: "pop" });
            const ymid = String(options.ymid || "");
            if (!ymid) {
                const error = new Error("Monetag YMID yaratilmadi.");
                error.code = "MONETAG_YMID_REQUIRED";
                throw error;
            }
            await root.show_11422269({
                type: "pop",
                ymid,
                requestVar: "wheel_reward",
            });
            providerLog("info", "monetag_show_resolved", { zone: "11422269", format: "pop" });
            return { shown: true, provider: "MONETAG" };
        },
    });

    const providers = Object.freeze({
        ADSGRAM: AdsgramProvider,
        MONETAG: MonetagProvider,
    });

    function getSlot(slotId) {
        return slots.find((slot) => slot.id === String(slotId)) || null;
    }

    async function run(slotId, adapters = {}) {
        const slot = getSlot(slotId);
        if (!slot) throw new Error("Rewarded reklama sloti topilmadi.");

        const provider = providers[slot.provider];
        if (!provider?.isAvailable(adapters)) {
            const error = new Error("Tanlangan reklama hozircha mavjud emas.");
            error.code = "REWARDED_PROVIDER_UNAVAILABLE";
            providerLog("warn", "provider_unavailable", { provider: slot.provider, slotId: slot.id });
            throw error;
        }

        providerLog("info", "provider_attempt", { provider: slot.provider, slotId: slot.id });
        try {
            const result = await provider.showRewarded(adapters);
            providerLog("info", "provider_success", { provider: slot.provider, slotId: slot.id });
            return result;
        } catch (error) {
            providerLog("warn", "provider_failed", {
                provider: slot.provider,
                slotId: slot.id,
                error: providerError(error),
            });
            throw error;
        }
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
