class SupportApiClient {
    constructor({
        baseUrl = typeof API_URL !== "undefined" ? API_URL : "",
        fetchImpl = (...args) => globalThis.fetch(...args),
    } = {}) {
        this.baseUrl = String(baseUrl).replace(/\/$/, "");
        this.fetchImpl = fetchImpl;
    }

    async config() {
        const response = await this.fetchImpl(`${this.baseUrl}/support/config`, {
            method: "GET",
            headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error("Support ma’lumotlari hozir mavjud emas.");
        const payload = await response.json();
        return {
            username: supportNormalizeUsername(payload?.support_telegram_username),
        };
    }
}

const supportApiClient = new SupportApiClient();
const SUPPORT_TOPICS = Object.freeze([
    { key: "bug", icon: "🐞", title: "Xatolik haqida xabar berish", note: "Ishlamayotgan joy yoki texnik muammoni yuboring." },
    { key: "idea", icon: "💡", title: "Taklif yuborish", note: "LEVEL_GROUP’ni yaxshilash bo‘yicha fikringizni yozing." },
    { key: "review", icon: "⭐", title: "Sharh qoldirish", note: "Tajriba va taassurotlaringizni biz bilan bo‘lishing." },
    { key: "question", icon: "❓", title: "Savol berish", note: "Platforma xizmatlari haqida yordam oling." },
]);
let supportUsername = null;

function supportNormalizeUsername(value) {
    const username = String(value || "").trim().replace(/^@+/, "");
    return /^[A-Za-z0-9_]{5,32}$/.test(username) ? username : null;
}

function supportEscape(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;").replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function supportTelegramUrl(username, topic = "question") {
    const safeUsername = supportNormalizeUsername(username);
    if (!safeUsername) return null;
    const selected = SUPPORT_TOPICS.find((item) => item.key === topic) || SUPPORT_TOPICS[3];
    const text = `LEVEL_GROUP Support — ${selected.title}`;
    return `https://t.me/${safeUsername}?text=${encodeURIComponent(text)}`;
}

function supportTelegramIcon() {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor"
        d="M21.7 3.4 18.5 19c-.2 1.1-.9 1.4-1.8.9l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.4-5 9.1-8.2c.4-.4-.1-.6-.6-.2L6 12.8 1.2 11.3c-1-.3-1-1 .2-1.5L20 2.6c.9-.3 1.9.2 1.7.8Z"/></svg>`;
}

function supportView(username) {
    const available = Boolean(supportNormalizeUsername(username));
    return `<section class="support-center">
        <header class="support-hero"><span>🎧</span><small>LEVEL_GROUP CARE</small>
            <h2>Support Center</h2><p>Yordam, fikr va takliflaringiz uchun to‘g‘ridan-to‘g‘ri bog‘laning.</p></header>
        <div class="support-grid">${SUPPORT_TOPICS.map((item) => `
            <button type="button" data-support-topic="${item.key}" ${available ? "" : "disabled"}
                onclick="openSupportTelegram('${item.key}')">
                <span>${item.icon}</span><div><strong>${supportEscape(item.title)}</strong>
                <small>${supportEscape(item.note)}</small></div><b>${supportTelegramIcon()}</b>
            </button>`).join("")}</div>
        <aside class="support-warning"><span>!</span><p>Iltimos, muammo haqida iloji boricha batafsil yozing.<br>
            Skrinshot yoki video yuborsangiz muammoni tezroq hal qilishimiz mumkin.</p></aside>
        <button type="button" class="support-admin ${available ? "" : "is-unavailable"}"
            ${available ? 'onclick="openSupportTelegram(\'question\')"' : "disabled"}>
            <span>${supportTelegramIcon()}</span><div><small>ASOSIY ADMINISTRATOR</small>
            <strong>${available ? `@${supportEscape(username)}` : "Support vaqtincha mavjud emas"}</strong></div>
        </button>
    </section>`;
}

function supportState(message, retry = false) {
    return `<section class="support-state"><span>🎧</span><h2>Support Center</h2>
        <p>${supportEscape(message)}</p>${retry ? '<button type="button" onclick="loadSupportPage()">Qayta urinish</button>' : ""}</section>`;
}

async function loadSupportPage() {
    Navbar.setActive("profile");
    showPage("supportPage", "Support Center");
    const page = document.getElementById("supportPage");
    if (!page) return;
    page.innerHTML = '<div class="support-skeleton" role="status" aria-label="Support yuklanmoqda"><i></i><i></i><i></i></div>';
    try {
        const config = await supportApiClient.config();
        supportUsername = config.username;
        page.innerHTML = supportUsername
            ? supportView(supportUsername)
            : supportState("Administrator Telegram manzili hozir sozlanmagan.");
    } catch (error) {
        supportUsername = null;
        page.innerHTML = supportState(error.message, true);
    }
}

function openSupportTelegram(topic) {
    const url = supportTelegramUrl(supportUsername, topic);
    if (!url) return false;
    const webApp = globalThis.Telegram?.WebApp;
    if (typeof webApp?.openTelegramLink === "function") {
        webApp.openTelegramLink(url);
    } else if (typeof globalThis.open === "function") {
        globalThis.open(url, "_blank", "noopener");
    }
    return true;
}

Object.assign(globalThis, { loadSupportPage, openSupportTelegram });

if (typeof module !== "undefined") {
    module.exports = {
        SupportApiClient,
        SUPPORT_TOPICS,
        supportNormalizeUsername,
        supportTelegramUrl,
        supportView,
    };
}
