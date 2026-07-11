const SplashScreen = (() => {
    const CONFIG = {
        brand: "LEVEL_GROUP",
        minimumDuration: 3200,
        exitDuration: 650,
        letterDelay: 85,
        statusMessages: [
            "Secure connection",
            "Loading experience",
            "Preparing LEVEL_GROUP",
        ],
    };

    let splashElement = null;
    let statusElement = null;
    let startedAt = 0;
    let isFinished = false;

    function createLetterMarkup(text) {
        return [...text]
            .map((letter, index) => {
                const safeLetter = letter === " " ? "&nbsp;" : letter;
                const delay = 650 + index * CONFIG.letterDelay;

                return `
                    <span
                        class="splash-letter"
                        style="animation-delay: ${delay}ms"
                    >${safeLetter}</span>
                `;
            })
            .join("");
    }

    function createSplashMarkup() {
        return `
            <section
                id="premiumSplash"
                role="status"
                aria-label="LEVEL_GROUP yuklanmoqda"
            >
                <div class="splash-noise"></div>
                <div class="splash-orbit"></div>

                <div class="splash-content">
                    <div class="splash-logo-wrap">
                        <div class="splash-logo-glow"></div>
                        <div class="splash-logo-ring"></div>

                        <div class="splash-logo" aria-hidden="true">
                            <img
                                src="assets/level-group-emblem.png?v=2.0.1"
                                alt=""
                                width="128"
                                height="128"
                            >
                        </div>
                    </div>

                    <div
                        class="splash-brand"
                        aria-label="${CONFIG.brand}"
                    >
                        ${createLetterMarkup(CONFIG.brand)}
                    </div>

                    <div class="splash-subtitle">
                        Premium Football Ecosystem
                    </div>

                    <div class="splash-progress">
                        <div class="splash-progress-bar"></div>
                    </div>

                    <div
                        id="splashStatus"
                        class="splash-status"
                    >
                        ${CONFIG.statusMessages[0]}
                    </div>
                </div>
            </section>
        `;
    }

    function initializeTelegram() {
        const telegram = window.Telegram?.WebApp;

        if (!telegram) {
            return;
        }

        try {
            telegram.ready();
            telegram.expand();

            if (typeof telegram.setHeaderColor === "function") {
                telegram.setHeaderColor("#030305");
            }

            if (typeof telegram.setBackgroundColor === "function") {
                telegram.setBackgroundColor("#030305");
            }

            if (typeof telegram.disableVerticalSwipes === "function") {
                telegram.disableVerticalSwipes();
            }
        } catch (error) {
            console.warn("Telegram WebApp init warning:", error);
        }
    }

    function rotateStatusMessages() {
        if (!statusElement) {
            return;
        }

        CONFIG.statusMessages.forEach((message, index) => {
            window.setTimeout(() => {
                if (!isFinished && statusElement) {
                    statusElement.textContent = message;
                }
            }, 700 + index * 850);
        });
    }

    function revealApplication() {
        const appRoot =
            document.querySelector("#app") ||
            document.querySelector(".app") ||
            document.querySelector("main");

        if (!appRoot) {
            return;
        }

        appRoot.removeAttribute("aria-hidden");
        appRoot.classList.add("app-ready");
    }

    function removeSplash() {
        if (!splashElement || isFinished) {
            return;
        }

        isFinished = true;
        revealApplication();
        splashElement.classList.add("splash-hidden");

        window.setTimeout(() => {
            splashElement?.remove();
            document.body.classList.remove("splash-active");

            window.dispatchEvent(
                new CustomEvent("levelgroup:splash-complete")
            );
        }, CONFIG.exitDuration);
    }

    function finish() {
        const elapsed = Date.now() - startedAt;
        const remaining = Math.max(
            0,
            CONFIG.minimumDuration - elapsed
        );

        window.setTimeout(removeSplash, remaining);
    }

    function mount() {
        if (document.querySelector("#premiumSplash")) {
            return;
        }

        startedAt = Date.now();
        document.body.classList.add("splash-active");
        document.body.insertAdjacentHTML(
            "afterbegin",
            createSplashMarkup()
        );

        splashElement = document.querySelector("#premiumSplash");
        statusElement = document.querySelector("#splashStatus");

        initializeTelegram();
        rotateStatusMessages();

        if (document.readyState === "complete") {
            finish();
            return;
        }

        window.addEventListener("load", finish, {
            once: true,
        });

        window.setTimeout(finish, 5000);
    }

    return {
        mount,
        finish,
    };
})();

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        SplashScreen.mount,
        { once: true }
    );
} else {
    SplashScreen.mount();
}

window.SplashScreen = SplashScreen;
