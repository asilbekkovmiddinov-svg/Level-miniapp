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
src="data:image/webp;base64,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"
                                alt=""
                                width="96"
                                height="96"
                                style="position:absolute;inset:0;display:block;width:100%;height:100%;object-fit:contain;object-position:center;border-radius:28px"
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
