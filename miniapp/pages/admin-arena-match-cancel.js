(function () {
    function arenaCancelMarkup() {
        return `<section class="pac-arena-prizes" id="adminArenaCancelPanel">
            <header><div><small>ARENA • EMERGENCY CONTROL</small><h3>Matchni bekor qilish</h3><p>Qotib qolgan Arena matchini ID orqali bekor qiling. Backend match holatini tekshiradi va kerak bo‘lsa ticketlarni qaytaradi.</p></div><span>⚠️</span></header>
            <form id="adminArenaCancelForm">
                <label><span>Match ID</span><input id="adminArenaCancelMatchId" type="number" min="1" step="1" inputmode="numeric" required placeholder="Masalan: 125"></label>
                <footer><small>Bu amal faqat admin uchun. FINISHED yoki allaqachon CANCELLED match qayta bekor qilinmaydi.</small><button id="adminArenaCancelButton" type="submit">Matchni bekor qilish</button></footer>
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
        const confirmed = window.confirm(`#${matchId} Arena matchini bekor qilasizmi?`);
        if (!confirmed) return;
        if (button) { button.disabled = true; button.textContent = "Bekor qilinmoqda…"; }
        try {
            const result = await promotionsAdminApi.cancelArenaMatch(matchId);
            const refunded = Number(result?.refunded_tickets || 0);
            promotionsAdminToast(refunded > 0 ? `Match #${matchId} bekor qilindi. ${refunded} ticket qaytarildi.` : `Match #${matchId} bekor qilindi.`);
            if (input) input.value = "";
        } catch (error) {
            promotionsAdminToast(error?.message || "Matchni bekor qilib bo‘lmadi.", "error");
        } finally {
            if (button) { button.disabled = false; button.textContent = "Matchni bekor qilish"; }
        }
    }

    function mountArenaCancelPanel() {
        if (document.getElementById("adminArenaCancelPanel")) return;
        const prizes = document.querySelector("#promotionsAdminPage .pac-arena-prizes");
        const metrics = document.querySelector("#promotionsAdminPage .pac-user-metrics");
        const anchor = prizes || metrics;
        if (!anchor) return;
        anchor.insertAdjacentHTML("afterend", arenaCancelMarkup());
        document.getElementById("adminArenaCancelForm")?.addEventListener("submit", cancelArenaMatch);
    }

    const observer = new MutationObserver(() => mountArenaCancelPanel());
    window.addEventListener("load", () => {
        const page = document.getElementById("promotionsAdminPage");
        if (page) observer.observe(page, { childList: true, subtree: true });
        mountArenaCancelPanel();
    });
})();
