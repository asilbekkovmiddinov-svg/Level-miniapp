const SplashScreen = (() => {
    const MOTION = Object.freeze({
        minimumVisibleMs: 3000,
        reducedVisibleMs: 900,
        exitMs: 720,
        reducedExitMs: 180,
        safetyTimeoutMs: 10000,
        settleMs: 2600,
        levelLetterDelayMs: 92,
    });
    const PARTICLES = Object.freeze([
        [18, 31, -18, -30, 5.2, .2], [28, 22, 22, -20, 6.1, 1.1],
        [73, 25, -24, 18, 5.7, 2.4], [84, 41, -18, -27, 6.6, .7],
        [79, 65, 20, -25, 5.4, 1.8], [68, 77, 25, 18, 6.3, 3.1],
        [31, 79, -22, 17, 5.9, 2.1], [16, 61, 19, 24, 6.8, 3.7],
        [39, 17, 16, -22, 5.6, 1.5], [61, 84, -16, 21, 6.2, 2.8],
    ]);

    let root = null;
    let startedAt = 0;
    let appReady = false;
    let finished = false;
    const timers = new Set();
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    function schedule(callback, delay) {
        const timer = window.setTimeout(() => { timers.delete(timer); callback(); }, delay);
        timers.add(timer);
        return timer;
    }

    function levelLetters() {
        return [..."LEVEL"].map((letter, index) => (
            `<span style="--letter-index:${index};--letter-delay:${index * MOTION.levelLetterDelayMs}ms">${letter}</span>`
        )).join("");
    }

    function particles() {
        return PARTICLES.map(([x, y, driftX, driftY, duration, delay], index) => (
            `<i style="--particle-x:${x}%;--particle-y:${y}%;--drift-x:${driftX}px;--drift-y:${driftY}px;--particle-duration:${duration}s;--particle-delay:${delay}s;--particle-size:${index % 3 === 0 ? 3 : 2}px"></i>`
        )).join("");
    }

    function markup() {
        return `<section id="premiumSplash" class="premium-splash-v4" role="status" aria-label="LEVEL_GROUP ochilmoqda">
            <div class="splash-atmosphere" aria-hidden="true">
                <i class="splash-aurora splash-aurora-crimson"></i>
                <i class="splash-aurora splash-aurora-purple"></i>
                <i class="splash-noise"></i><i class="splash-vignette"></i>
            </div>
            <div class="splash-particle-field" aria-hidden="true">${particles()}</div>
            <div class="splash-brand-stage">
                <div class="splash-logo-wrap" aria-hidden="true">
                    <i class="splash-logo-halo"></i><i class="splash-logo-shine"></i>
                    <img src="assets/splash-emblem-transparent.png?v=4.0.0" width="512" height="512" alt="" decoding="async">
                </div>
                <h1 class="splash-wordmark" aria-label="LEVEL GROUP">
                    <span class="splash-level">${levelLetters()}</span>
                    <span class="splash-group">GROUP</span>
                </h1>
                <p class="splash-tagline">Play <i>•</i> Earn <i>•</i> Trade</p>
            </div>
            <span class="splash-accessible-copy">LEVEL_GROUP MiniApp tayyorlanmoqda</span>
        </section>`;
    }

    function prepareTelegram() {
        const webApp = window.Telegram?.WebApp;
        if (!webApp) return;
        try {
            webApp.ready(); webApp.expand();
            webApp.setHeaderColor?.("#030305");
            webApp.setBackgroundColor?.("#030305");
            webApp.disableVerticalSwipes?.();
        } catch (error) { console.warn("Telegram WebApp splash warning:", error); }
    }

    function revealApp() {
        const app = document.getElementById("app");
        if (!app) return;
        app.classList.add("splash-app-entering");
        app.classList.remove("hidden");
        app.setAttribute("aria-hidden", "false");
        window.requestAnimationFrame(() => app.classList.add("is-visible"));
    }

    function finish() {
        if (finished || !root) return;
        finished = true;
        const exitMs = reducedMotion ? MOTION.reducedExitMs : MOTION.exitMs;
        revealApp(); root.classList.add("is-leaving");
        schedule(() => {
            const app = document.getElementById("app");
            app?.classList.remove("splash-app-entering", "is-visible");
            root?.remove(); root = null;
            document.body.classList.remove("splash-active");
            window.dispatchEvent(new CustomEvent("levelgroup:splash-complete"));
        }, exitMs);
    }

    function tryFinish() {
        if (finished || !appReady) return;
        const minimum = reducedMotion ? MOTION.reducedVisibleMs : MOTION.minimumVisibleMs;
        schedule(finish, Math.max(0, minimum - (Date.now() - startedAt)));
    }

    function signalReady() { appReady = true; tryFinish(); }

    function mount() {
        if (root || document.getElementById("premiumSplash")) return;
        startedAt = Date.now();
        document.body.classList.add("splash-active");
        document.body.insertAdjacentHTML("afterbegin", markup());
        root = document.getElementById("premiumSplash");
        if ((navigator.hardwareConcurrency || 8) <= 4) root?.classList.add("is-lite");
        prepareTelegram();
        schedule(() => root?.classList.add("is-settled"), reducedMotion ? 50 : MOTION.settleMs);
        schedule(() => { appReady = true; tryFinish(); }, MOTION.safetyTimeoutMs);
    }

    window.addEventListener("levelgroup:app-ready", signalReady, { once: true });
    return Object.freeze({ mount, finish, signalReady, MOTION });
})();

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", SplashScreen.mount, { once: true });
else SplashScreen.mount();
window.SplashScreen = SplashScreen;
