(function exposeWheelRewardedAds(root, factory) {
    const api = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    if (root) root.WheelRewardedAds = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
    const slots = Object.freeze([
        Object.freeze({ id: "1", label: "Watch Ad #1", provider: "ADSGRAM" }),
        Object.freeze({ id: "2", label: "Watch Ad #2", provider: "ADSGRAM" }),
        Object.freeze({ id: "3", label: "Watch Ad #3", provider: "ADSGRAM" }),
    ]);

    const providers = Object.freeze({
        ADSGRAM: async (adapters) => {
            if (typeof adapters?.ADSGRAM !== "function") {
                throw new Error("Adsgram provider mavjud emas.");
            }
            return adapters.ADSGRAM();
        },
    });

    function getSlot(slotId) {
        return slots.find((slot) => slot.id === String(slotId)) || null;
    }

    async function run(slotId, adapters = {}) {
        const slot = getSlot(slotId);
        if (!slot) throw new Error("Rewarded reklama sloti topilmadi.");
        const provider = providers[slot.provider];
        if (!provider) throw new Error(`${slot.provider} provider ulanmagan.`);
        return provider(adapters);
    }

    return Object.freeze({ slots, providers, getSlot, run });
});
