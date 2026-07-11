window.addEventListener("load", async () => {
    Loader.show();

    try {
        const homeName = document.getElementById("homeName");
        if (homeName) {
            homeName.textContent = USERNAME ? `@${USERNAME}` : FIRST_NAME;
        }

        await registerUser();
        await updateUserSeen();

        Navbar.init();
        bindMenuButtons();
        bindHeaderButtons();

        await loadHome();
    } catch (error) {
        console.error(error);
        Modal.error("Mini App yuklanishda xatolik yuz berdi.");
    } finally {
        Loader.hide();
        window.dispatchEvent(new CustomEvent("levelgroup:app-ready"));
    }
});

function showPage(pageId, title) {
    document.querySelectorAll(".page").forEach((page) => {
        page.classList.remove("active-page");
    });

    const page = document.getElementById(pageId);
    if (page) {
        page.classList.add("active-page");
    }

    const pageTitle = document.getElementById("pageTitle");
    if (pageTitle) {
        pageTitle.textContent = title || "LEVEL_GROUP";
    }
}

function bindMenuButtons() {
    document.querySelectorAll(".menu-card").forEach((button) => {
        button.addEventListener("click", async () => {
            await openPage(button.dataset.page);
        });
    });
}

function bindHeaderButtons() {
    const refreshBtn = document.getElementById("refreshBtn");
    const backBtn = document.getElementById("backBtn");

    if (refreshBtn) {
        refreshBtn.addEventListener("click", refreshEverything);
    }

    if (backBtn) {
        backBtn.addEventListener("click", loadHome);
    }
}

async function openPage(page) {
    switch (page) {
        case "shop":
            await loadShopPage();
            break;
        case "p2p":
            await loadP2PPage();
            break;
        case "wheel":
            await loadWheelPage();
            break;
        case "arena":
            await loadArenaPage();
            break;
        case "orders":
            await loadOrdersPage();
            break;
        case "profile":
            await loadProfilePage();
            break;
        default:
            await loadHome();
    }
}

async function loadHome() {
    Navbar.setActive("home");
    showPage("homePage", "LEVEL_GROUP");
    await loadHomeBalances();
}

async function refreshCurrentPage() {
    await openPage(Navbar.currentPage || "home");
}

async function refreshEverything() {
    Loader.show();

    try {
        await updateUserSeen();
        await refreshCurrentPage();
    } catch (error) {
        console.error(error);
        Modal.error("Ma'lumotlarni yangilab bo'lmadi.");
    } finally {
        Loader.hide();
    }
}

setInterval(async () => {
    try {
        await updateUserSeen();
    } catch (e) {
        console.log(e);
    }
}, 60000);
