const Navbar = {
    currentPage: "home",

    setActive(page) {
        this.currentPage = page;

        document.querySelectorAll(".nav-btn").forEach((button) => {
            button.classList.remove("active");
        });

        const active = document.querySelector(
            `.nav-btn[data-page="${page}"]`
        );

        if (active) {
            active.classList.add("active");
        }
    },

    async open(page) {
        await openPage(page);
    },

    init() {
        document.querySelectorAll(".nav-btn").forEach((button) => {
            button.addEventListener("click", () => {
                this.open(button.dataset.page);
            });
        });
    }
};
