(function () {
    function arenaCancelMarkup() {
        return `<section class="pac-arena-prizes" id="adminArenaCancelPanel">
            <header><div><small>ARENA • EMERGENCY CONTROL</small><h3>Matchni bekor qilish</h3><p>Qotib qolgan Arena matchini ID orqali bekor qiling.</p></div><span>⚠️</span></header>
            <form id="adminArenaCancelForm">
                <label><span>Match ID</span><input id="adminArenaCancelMatchId" type="number" min="1" step="1" inputmode="numeric" required placeholder="Masalan: 31"></label>
                <footer><small>Bu amal faqat admin uchun. FINISHED match bekor qilinmaydi.</small><button id="adminArenaCancelButton" type="submit">Matchni bekor qilish</button></footer>
            </form>
        </section>`;
    }

    async function cancelArenaMatch(event) {
        event.preventDefault();
        const input = document.getElementById("adminArenaCancelMatchId");
        const button = document.getElementById("adminArenaCancelButton");
        const matchId = Number(input?.value || 0);
        if (!Number.isInteger(matchId) || matchId <= 0) {
            promotionsAdminToast("To‘g‘ri Match ID kiriting.", "error");
            input?.focus();
            return;
        }
        if (!window.confirm(`#${matchId} Arena matchini bekor qilasizmi?`)) return;
        if (button) { button.disabled = true; button.textContent = "Bekor qilinmoqda…"; }
        try {
            await promotionsAdminApi.cancelArenaMatch(matchId);
            promotionsAdminToast(`Match #${matchId} bekor qilindi.`);
            if (input) input.value = "";
        } catch (error) {
            promotionsAdminToast(error?.message || "Matchni bekor qilib bo‘lmadi.", "error");
        } finally {
            if (button) { button.disabled = false; button.textContent = "Matchni bekor qilish"; }
        }
    }

    function mountArenaCancelPanel() {
        if (document.getElementById("adminArenaCancelPanel")) return true;
        const page = document.getElementById("promotionsAdminPage");
        if (!page) return false;
        const anchor = page.querySelector(".pac-arena-prizes") || page.querySelector(".pac-user-metrics") || page.firstElementChild;
        if (!anchor) return false;
        anchor.insertAdjacentHTML("afterend", arenaCancelMarkup());
        document.getElementById("adminArenaCancelForm")?.addEventListener("submit", cancelArenaMatch);
        return true;
    }

    function start() {
        mountArenaCancelPanel();
        const page = document.getElementById("promotionsAdminPage");
        if (!page) return;
        const observer = new MutationObserver(() => mountArenaCancelPanel());
        observer.observe(page, { childList: true, subtree: true });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
        start();
    }
})();
