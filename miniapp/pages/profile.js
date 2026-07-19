let profileData = null;
let profileAdminAccess = false;

async function loadProfilePage() {
    Navbar.setActive("profile");
    showPage("profilePage", "Profil");

    profileData = {
        telegram_id: TELEGRAM_ID,
        first_name: FIRST_NAME || "User",
        username: USERNAME || "",
    };

    profileAdminAccess = await checkProfileAdminAccess();
    renderProfile();
}

async function checkProfileAdminAccess() {
    try {
        const adminApi = new PromotionsAdminApi({ baseUrl: API_URL });
        await adminApi.list();
        return true;
    } catch (_error) {
        return false;
    }
}

function openAdminPanelFromProfile() {
    window.location.assign("?admin=promotions");
}

function renderProfile() {
    const page = document.getElementById("profilePage");

    const usernameText = profileData.username
        ? `@${profileData.username}`
        : "Username yo‘q";

    page.innerHTML = `
        <div class="profile-box">
            <div class="avatar">LG</div>

            <h2>${profileData.first_name}</h2>
            <p class="gray">${usernameText}</p>
            <p class="green">● Online</p>

            <div class="stat-grid">
                <div class="stat-box">
                    <small>Telegram ID</small>
                    <strong>${profileData.telegram_id}</strong>
                </div>

                <div class="stat-box">
                    <small>Til</small>
                    <strong>UZ</strong>
                </div>

                <div class="stat-box">
                    <small>P2P reyting</small>
                    <strong>V1.1</strong>
                </div>

                <div class="stat-box">
                    <small>Savdolar</small>
                    <strong>V1.1</strong>
                </div>
            </div>

            <button class="profile-referral-cta" type="button" onclick="openPage('referral')">
                <span>🎁</span>
                <span>
                    <strong>Referral dasturi</strong>
                    <small>Do‘stlarni taklif qiling va UZS bonus oling</small>
                </span>
                <b>›</b>
            </button>

            ${profileAdminAccess ? `
                <button class="profile-admin-cta" type="button" onclick="openAdminPanelFromProfile()">
                    <span>🛠</span>
                    <span>
                        <strong>Admin Panel</strong>
                        <small>Promotions va Coin Promotions boshqaruvi</small>
                    </span>
                    <b>›</b>
                </button>
            ` : ""}
        </div>
    `;
}

async function refreshProfile() {
    await loadProfilePage();
}
