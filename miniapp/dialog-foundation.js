const LevelDialogFoundation = (() => {
    const OVERLAY_SELECTOR = [
        ".arena-v2-overlay", ".cpa-modal", ".orders-detail-overlay",
        ".p2p-create-overlay", ".p2p-trade-overlay", ".pac-crop-overlay",
        ".pac-form-overlay", ".referral-modal", ".wallet-action-overlay",
        ".wheel-result-modal", ".wheel-wizard-modal",
    ].join(",");
    const PANEL_SELECTOR = [
        ".arena-v2-sheet", ".cpa-modal>form", ".orders-detail-overlay>section",
        ".p2p-create-overlay>section", ".p2p-trade-overlay>section", ".pac-crop-sheet",
        ".pac-form-sheet", ".referral-modal-card", ".wallet-action-sheet",
        ".wheel-result-card", ".wheel-wizard-card",
    ].join(",");
    const FOCUSABLE_SELECTOR = [
        "button:not([disabled])", "[href]", "input:not([disabled])",
        "select:not([disabled])", "textarea:not([disabled])",
        "[tabindex]:not([tabindex='-1'])",
    ].join(",");
    const CLOSE_SELECTOR = [
        "[data-dialog-close]", "[data-close]", "[data-cancel]", "[data-wheel-close]",
        "[data-wheel-wizard-close]", "[aria-label='Yopish']",
        "[onclick*='close']", "[onclick*='Close']",
    ].join(",");
    const activeDialogs = [];
    const states = new WeakMap();
    let observer;

    function panelFor(overlay) {
        return overlay.matches(PANEL_SELECTOR) ? overlay : overlay.querySelector(PANEL_SELECTOR) || overlay.firstElementChild || overlay;
    }

    function focusables(panel) {
        return [...panel.querySelectorAll(FOCUSABLE_SELECTOR)].filter((element) =>
            !element.hidden && !element.closest("[hidden],[inert]") && element.getClientRects().length > 0);
    }

    function isolateBackground(overlay) {
        const changes = [];
        let branch = overlay;
        while (branch?.parentElement) {
            [...branch.parentElement.children].forEach((sibling) => {
                if (sibling === branch || sibling.hasAttribute("data-dialog-live-region")) return;
                changes.push({
                    element: sibling,
                    inert: sibling.inert,
                    ariaHidden: sibling.getAttribute("aria-hidden"),
                });
                sibling.inert = true;
                sibling.setAttribute("aria-hidden", "true");
            });
            branch = branch.parentElement;
            if (branch === document.body) break;
        }
        return changes;
    }

    function restoreBackground(changes) {
        changes.forEach(({ element, inert, ariaHidden }) => {
            if (!element.isConnected) return;
            element.inert = inert;
            if (ariaHidden === null) element.removeAttribute("aria-hidden");
            else element.setAttribute("aria-hidden", ariaHidden);
        });
    }

    function labelDialog(panel) {
        if (panel.hasAttribute("aria-label") || panel.hasAttribute("aria-labelledby")) return;
        const heading = panel.querySelector("h1,h2,h3,[data-dialog-title]");
        if (!heading) {
            panel.setAttribute("aria-label", "Dialog");
            return;
        }
        if (!heading.id) heading.id = `lg-dialog-title-${Date.now()}-${activeDialogs.length}`;
        panel.setAttribute("aria-labelledby", heading.id);
    }

    function activate(overlay) {
        if (!(overlay instanceof HTMLElement) || states.has(overlay) || overlay.hidden) return;
        const panel = panelFor(overlay);
        if (!(panel instanceof HTMLElement)) return;
        panel.setAttribute("role", "dialog");
        panel.setAttribute("aria-modal", "true");
        if (!panel.hasAttribute("tabindex")) panel.setAttribute("tabindex", "-1");
        labelDialog(panel);
        const state = {
            overlay,
            panel,
            restoreFocus: document.activeElement instanceof HTMLElement ? document.activeElement : null,
            background: isolateBackground(overlay),
        };
        states.set(overlay, state);
        activeDialogs.push(state);
        window.LevelMotionEngine?.enhance?.(overlay);
        requestAnimationFrame(() => {
            const initial = panel.querySelector("[autofocus]") || focusables(panel)[0] || panel;
            initial.focus({ preventScroll: true });
        });
    }

    function deactivate(overlay) {
        const state = states.get(overlay);
        if (!state) return;
        states.delete(overlay);
        const index = activeDialogs.indexOf(state);
        if (index >= 0) activeDialogs.splice(index, 1);
        restoreBackground(state.background);
        requestAnimationFrame(() => {
            if (state.restoreFocus?.isConnected) state.restoreFocus.focus({ preventScroll: true });
        });
    }

    function closeTopDialog(state) {
        const close = state.panel.querySelector(CLOSE_SELECTOR) || state.overlay.querySelector(CLOSE_SELECTOR);
        close?.click();
    }

    function handleKeydown(event) {
        const state = activeDialogs.at(-1);
        if (!state) return;
        if (event.key === "Escape") {
            event.preventDefault();
            closeTopDialog(state);
            return;
        }
        if (event.key !== "Tab") return;
        const items = focusables(state.panel);
        if (!items.length) {
            event.preventDefault();
            state.panel.focus({ preventScroll: true });
            return;
        }
        const first = items[0];
        const last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault(); last.focus({ preventScroll: true });
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault(); first.focus({ preventScroll: true });
        }
    }

    function inspectNode(node, removed = false) {
        if (!(node instanceof Element)) return;
        const overlays = [node, ...node.querySelectorAll(OVERLAY_SELECTOR)].filter((item) => item.matches(OVERLAY_SELECTOR));
        overlays.forEach((overlay) => removed || overlay.hidden ? deactivate(overlay) : activate(overlay));
    }

    function init() {
        document.querySelectorAll(OVERLAY_SELECTOR).forEach(activate);
        document.addEventListener("keydown", handleKeydown);
        observer = new MutationObserver((records) => records.forEach((record) => {
            if (record.type === "attributes") inspectNode(record.target);
            record.addedNodes?.forEach((node) => inspectNode(node));
            record.removedNodes?.forEach((node) => inspectNode(node, true));
        }));
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
    }

    return Object.freeze({ init, activate, deactivate, OVERLAY_SELECTOR });
})();

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", LevelDialogFoundation.init, { once: true });
else LevelDialogFoundation.init();
window.LevelDialogFoundation = LevelDialogFoundation;
