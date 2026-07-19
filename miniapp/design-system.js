const LevelDesignSystem = (() => {
    const HAPTIC_SELECTORS = Object.freeze({
        selection: ".nav-btn",
        light: ".menu-card,.wallet-action,.icon-btn,.back-btn,.lg-button-secondary,.lg-button-ghost",
        medium: ".primary-btn,.red-btn,.lg-button-primary,.wallet-form-submit,.arena-v2-submit,.wheel-spin-button",
        warning: ".lg-button-danger,[data-haptic='danger']",
    });
    let lastHapticAt = 0;

    function haptic(kind = "light") {
        const feedback = window.Telegram?.WebApp?.HapticFeedback;
        if (!feedback || Date.now() - lastHapticAt < 80) return;
        lastHapticAt = Date.now();
        try {
            if (kind === "selection") feedback.selectionChanged?.();
            else if (kind === "warning") feedback.notificationOccurred?.("warning");
            else feedback.impactOccurred?.(kind);
        } catch (_error) { /* Haptics are progressive enhancement. */ }
    }

    function hapticKind(target) {
        if (target.closest(HAPTIC_SELECTORS.warning)) return "warning";
        if (target.closest(HAPTIC_SELECTORS.selection)) return "selection";
        if (target.closest(HAPTIC_SELECTORS.medium)) return "medium";
        if (target.closest(HAPTIC_SELECTORS.light)) return "light";
        return null;
    }

    function applyRuntimeMode() {
        const lowCore = (navigator.hardwareConcurrency || 8) <= 4;
        const saveData = navigator.connection?.saveData === true;
        document.documentElement.classList.toggle("design-low-motion", lowCore || saveData);
        document.documentElement.dataset.telegramTheme = window.Telegram?.WebApp?.colorScheme || "dark";
    }

    function init() {
        applyRuntimeMode();
        document.addEventListener("pointerdown", (event) => {
            const target = event.target instanceof Element ? event.target : null;
            if (!target || target.closest(":disabled")) return;
            const kind = hapticKind(target); if (kind) haptic(kind);
        }, { passive: true });
        window.Telegram?.WebApp?.onEvent?.("themeChanged", applyRuntimeMode);
    }

    return Object.freeze({ init, haptic, HAPTIC_SELECTORS });
})();

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", LevelDesignSystem.init, { once: true });
else LevelDesignSystem.init();
window.LevelDesignSystem = LevelDesignSystem;
