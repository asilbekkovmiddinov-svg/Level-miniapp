const LevelMotionEngine = (() => {
    const CONTROL_SELECTOR = "button,[role='button'],input[type='button'],input[type='submit']";
    const CARD_SELECTOR = ".lg-card,.home-quick-card,.home-activity,.quick-card,.service-card,.list-card,.orders-card,.pac-card,.cpa-card,.woa-card,.nfc-card-surface,.arena-v2-match,.wallet-history-row,.pux-card";
    const STAGGER_SELECTOR = ".lg-motion-stagger,.home-quick-grid,.pux-list,.nfc-list,.orders-v2-list,.pac-list,.cpa-list,.woa-list";

    function enhance(root = document) {
        const scope = root instanceof Element ? root : document;
        if (scope.matches?.(CONTROL_SELECTOR)) scope.classList.add("lg-motion-control");
        if (scope.matches?.(CARD_SELECTOR)) scope.classList.add("lg-motion-card");
        scope.querySelectorAll?.(CONTROL_SELECTOR).forEach((node) => node.classList.add("lg-motion-control"));
        scope.querySelectorAll?.(CARD_SELECTOR).forEach((node) => node.classList.add("lg-motion-card"));
        const groups = [];
        if (scope.matches?.(STAGGER_SELECTOR)) groups.push(scope);
        scope.querySelectorAll?.(STAGGER_SELECTOR).forEach((group) => groups.push(group));
        groups.forEach((group) => Array.from(group.children).forEach((child, index) => child.style.setProperty("--lg-motion-index", Math.min(index, 8))));
    }

    function release(control) {
        if (!control) return;
        control.classList.remove("is-motion-pressed");
    }

    function init() {
        enhance(document);
        document.addEventListener("pointerdown", (event) => {
            const control = event.target instanceof Element ? event.target.closest(CONTROL_SELECTOR) : null;
            if (!control || control.disabled) return;
            control.classList.add("is-motion-pressed");
        }, { passive: true });
        ["pointerup", "pointercancel", "pointerleave"].forEach((name) => document.addEventListener(name, (event) => release(event.target instanceof Element ? event.target.closest(CONTROL_SELECTOR) : null), { passive: true }));
        document.addEventListener("click", (event) => {
            const control = event.target instanceof Element ? event.target.closest(CONTROL_SELECTOR) : null;
            if (!control || control.disabled) return;
            release(control); control.classList.remove("is-motion-pulse");
            requestAnimationFrame(() => control.classList.add("is-motion-pulse"));
            setTimeout(() => control.classList.remove("is-motion-pulse"), 280);
        }, { passive: true });
        new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach((node) => { if (node.nodeType === 1) enhance(node); }))).observe(document.body, { childList: true, subtree: true });
    }

    return Object.freeze({ init, enhance, CONTROL_SELECTOR, CARD_SELECTOR });
})();

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", LevelMotionEngine.init, { once: true });
else LevelMotionEngine.init();
window.LevelMotionEngine = LevelMotionEngine;
