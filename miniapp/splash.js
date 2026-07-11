const SplashScreen = (() => {
    const SETTINGS = {
        minimumDuration: 3500,
        exitDuration: 620,
        fallbackDuration: 10000,
        letterDelay: 58,
        statuses: [
            { at: 1850, text: "INITIALIZING", progress: 24 },
            { at: 2250, text: "CONNECTING", progress: 48 },
            { at: 2700, text: "LOADING ARENA", progress: 76 },
            { at: 3200, text: "READY", progress: 100 },
        ],
    };

    let root = null;
    let status = null;
    let bar = null;
    let startedAt = 0;
    let appReady = false;
    let finished = false;
    const timers = [];

    function letters() {
        return [..."LEVEL_GROUP"].map((character, index) => {
            const className = character === "_" ? " is-accent" : "";
            const delay = 1180 + index * SETTINGS.letterDelay;
            return `<span class="cinematic-letter${className}" style="--delay:${delay}ms">${character}</span>`;
        }).join("");
    }

    function markup() {
        return `
            <section id="premiumSplash" class="cinematic-splash" aria-label="LEVEL_GROUP yuklanmoqda">
                <div class="cinematic-stage" aria-hidden="true">
                    <div class="cinematic-mesh"></div>
                    <div class="cinematic-spotlight"></div>
                    <div class="cinematic-rings"><i></i><i></i><i></i></div>
                    <div class="cinematic-particles"><i></i><i></i><i></i><i></i><i></i><i></i></div>
                    <div class="cinematic-grain"></div>
                    <div class="cinematic-vignette"></div>
                </div>
                <div class="cinematic-core">
                    <div class="energy-seed" aria-hidden="true"></div>
                    <div class="cinematic-logo-shell">
                        <div class="logo-energy"></div>
                        <div class="logo-sweep"></div>
                        <img src="assets/splash-emblem-transparent.png?v=3.1.0" width="512" height="512" alt="LEVEL_GROUP">
                    </div>
                    <div class="logo-reflection" aria-hidden="true"></div>
                    <h1 class="cinematic-brand" aria-label="LEVEL_GROUP">${letters()}</h1>
                    <p class="cinematic-subtitle"><span>PREMIUM FOOTBALL ECOSYSTEM</span></p>
                </div>
                <div class="cinematic-loading">
                    <div class="cinematic-track">
                        <div id="cinematicProgress" class="cinematic-bar"><i></i></div>
                    </div>
                    <p id="cinematicStatus" class="cinematic-status">INITIALIZING</p>
                </div>
                <p class="cinematic-version">V2.0 <i>•</i> SECURE TELEGRAM MINI APP</p>
            </section>
        `;
    }

    function prepareTelegram() {
        const webApp = window.Telegram?.WebApp;
        if (!webApp) return;
        try {
            webApp.ready();
            webApp.expand();
            webApp.setHeaderColor?.("#030305");
            webApp.setBackgroundColor?.("#030305");
            webApp.disableVerticalSwipes?.();
        } catch (error) {
            console.warn("Telegram WebApp splash warning:", error);
        }
    }

    function scheduleSequence() {
        SETTINGS.statuses.forEach(({ at, text, progress }) => {
            timers.push(window.setTimeout(() => {
                if (finished || !root) return;
                status.classList.add("is-changing");
                window.setTimeout(() => {
                    if (finished) return;
                    status.textContent = text;
                    status.classList.remove("is-changing");
                }, 120);
                bar.style.width = `${progress}%`;
                if (progress === 100) root.classList.add("is-ready");
            }, at));
        });
    }

    function revealApp() {
        const app = document.getElementById("app");
        app?.classList.remove("hidden");
        app?.setAttribute("aria-hidden", "false");
    }

    function tryFinish() {
        if (finished || !appReady) return;
        const remaining = Math.max(0, SETTINGS.minimumDuration - (Date.now() - startedAt));
        timers.push(window.setTimeout(finish, remaining));
    }

    function finish() {
        if (finished || !root) return;
        finished = true;
        revealApp();
        root.classList.add("is-leaving");
        timers.push(window.setTimeout(() => {
            root?.remove();
            document.body.classList.remove("splash-active");
            window.dispatchEvent(new CustomEvent("levelgroup:splash-complete"));
        }, SETTINGS.exitDuration));
    }

    function signalReady() {
        appReady = true;
        tryFinish();
    }

    function mount() {
        if (root || document.getElementById("premiumSplash")) return;
        startedAt = Date.now();
        document.body.classList.add("splash-active");
        document.body.insertAdjacentHTML("afterbegin", markup());
        root = document.getElementById("premiumSplash");
        status = document.getElementById("cinematicStatus");
        bar = document.getElementById("cinematicProgress");
        prepareTelegram();
        scheduleSequence();
        timers.push(window.setTimeout(() => {
            appReady = true;
            tryFinish();
        }, SETTINGS.fallbackDuration));
    }

    window.addEventListener("levelgroup:app-ready", signalReady, { once: true });
    return { mount, finish, signalReady };
})();

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", SplashScreen.mount, { once: true });
} else {
    SplashScreen.mount();
}

window.SplashScreen = SplashScreen;