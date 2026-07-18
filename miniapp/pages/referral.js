let referralData = null;

function referralNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : 0;
}

function normalizeReferralSummary(payload) {
    const data = payload?.data;
    if (!payload?.success || !data || typeof data.referral_link !== "string") {
        throw new Error("Referral ma’lumotlari noto‘g‘ri formatda olindi.");
    }
    const link = data.referral_link.trim();
    if (!/^https:\/\/t\.me\/[A-Za-z0-9_]+\?start=ref_[A-Za-z0-9_-]+$/.test(link)) {
        throw new Error("Referral havolasi yaroqsiz.");
    }
    return {
        referralLink: link,
        totalReferrals: referralNumber(data.total_referrals),
        coinShopBuyers: referralNumber(data.coin_shop_buyers),
        totalEarnedUzs: referralNumber(data.total_earned_uzs),
        registrationBonusUzs: referralNumber(data.registration_bonus_uzs),
        firstShopBonusUzs: referralNumber(data.first_shop_bonus_uzs),
    };
}

function referralMoney(value) {
    return `${referralNumber(value).toLocaleString("uz-UZ")} UZS`;
}

function referralShareMessage(referralLink, firstName) {
    const name = typeof firstName === "string" ? firstName.trim() : "";
    const invitation = name
        ? `🔥 ${name} sizni LEVEL_GROUP'ga taklif qildi!`
        : "🔥 Sizni LEVEL_GROUP'ga taklif qilishmoqda!";
    return `${invitation}

🎮 Arena'da raqobatlashing.
🎡 Wheel'da sovg'alar yuting.
🛒 Coin Shop orqali xarid qiling.
🤝 P2P savdo qiling.
💳 Wallet orqali mablag'ingizni boshqaring.

✨ Hammasi bitta Telegram MiniApp ichida.

🚀 Hoziroq qo'shiling:

${referralLink}`;
}

function referralShareUrl(referralLink, firstName) {
    const message = referralShareMessage(referralLink, firstName);
    const text = message.slice(0, -(referralLink.length + 2));
    return `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(text)}`;
}

function shareReferralLink() {
    if (!referralData?.referralLink) {
        Modal.error("Referral havolasi hali tayyor emas.");
        return;
    }
    const firstName = globalThis.Telegram?.WebApp?.initDataUnsafe?.user?.first_name;
    const shareUrl = referralShareUrl(referralData.referralLink, firstName);
    if (globalThis.Telegram?.WebApp?.openTelegramLink) {
        globalThis.Telegram.WebApp.openTelegramLink(shareUrl);
        return;
    }
    globalThis.open?.(shareUrl, "_blank");
}

async function referralClipboardWrite(text, environment = {}) {
    const navigatorObject = environment.navigator || globalThis.navigator;
    try {
        if (navigatorObject?.clipboard?.writeText) {
            await navigatorObject.clipboard.writeText(text);
            return true;
        }
    } catch (_error) {
        // Telegram Android WebView may deny the modern Clipboard API.
    }

    const documentObject = environment.document || globalThis.document;
    if (!documentObject?.createElement || !documentObject?.body) return false;
    const textarea = documentObject.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    documentObject.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    let copied = false;
    try {
        copied = Boolean(documentObject.execCommand?.("copy"));
    } finally {
        textarea.remove();
    }
    return copied;
}

async function copyReferralLink() {
    if (!referralData?.referralLink) {
        Modal.error("Referral havolasi hali tayyor emas.");
        return;
    }
    const copied = await referralClipboardWrite(referralData.referralLink);
    if (copied) Modal.success("Referral havolasi nusxalandi.");
    else Modal.error("Havolani nusxalab bo‘lmadi. Qayta urinib ko‘ring.");
}

function referralSkeleton() {
    return `<div class="referral-skeleton" aria-label="Referral ma’lumotlari yuklanmoqda">
        <i></i><b></b><span></span><span></span><span></span>
    </div>`;
}

function renderReferralPage(data) {
    const page = document.getElementById("referralPage");
    const empty = data.totalReferrals === 0
        ? `<div class="referral-empty"><span>👥</span><b>Hali referalingiz yo‘q</b><p>Havolangizni do‘stlaringiz bilan ulashing.</p></div>`
        : "";
    page.innerHTML = `<div class="referral-v1">
        <header class="referral-hero">
            <small>LEVEL REWARDS</small>
            <h2>Do‘stingiz bilan birga yuting</h2>
            <p>Har bir yangi referral va uning birinchi Coin Shop xaridi uchun UZS bonus oling.</p>
        </header>
        <section class="referral-link-card">
            <span>SHAXSIY REFERRAL HAVOLANGIZ</span>
            <div><code>${data.referralLink}</code></div>
            <div class="referral-link-actions">
                <button type="button" onclick="copyReferralLink()">📋 Nusxalash</button>
                <button type="button" onclick="shareReferralLink()">✈️ Ulashish</button>
            </div>
            <small>Havola faqat sizga tegishli va har bir yangi foydalanuvchi bir marta hisoblanadi.</small>
        </section>
        <section class="referral-stats">
            <article><span>👥</span><small>Jami referallar</small><strong>${data.totalReferrals}</strong></article>
            <article><span>🛒</span><small>Coin Shop xarid qilganlar</small><strong>${data.coinShopBuyers}</strong></article>
            <article class="wide"><span>◆</span><small>Jami ishlangan bonus</small><strong>${referralMoney(data.totalEarnedUzs)}</strong></article>
        </section>
        ${empty}
        <section class="referral-bonuses">
            <h3>Bonuslar</h3>
            <article><span>＋</span><div><b>${referralMoney(data.registrationBonusUzs)}</b><p>Har bir yangi referral ro‘yxatdan o‘tganda</p></div></article>
            <article><span>★</span><div><b>${referralMoney(data.firstShopBonusUzs)}</b><p>Referralning birinchi muvaffaqiyatli Coin Shop xarididan keyin</p></div></article>
        </section>
        <section class="referral-rules">
            <h3>Referral qoidalari</h3>
            <ol>
                <li>Bir foydalanuvchi faqat bitta referalga bog‘lanadi.</li>
                <li>O‘z-o‘zini referral qilish taqiqlanadi.</li>
                <li>Har bir yangi foydalanuvchi faqat bir marta hisoblanadi.</li>
                <li>Coin Shop bonusi faqat birinchi muvaffaqiyatli yakunlangan xarid uchun beriladi.</li>
                <li>Bekor qilingan yoki rad etilgan buyurtmalar bonus bermaydi.</li>
                <li>Qoidabuzarlik aniqlansa bonus bekor qilinishi va akkaunt cheklanishi mumkin.</li>
            </ol>
        </section>
    </div>`;
}

function renderReferralError(message) {
    document.getElementById("referralPage").innerHTML = `<div class="referral-state">
        <span>⚠️</span><h3>Ma’lumotlarni yuklab bo‘lmadi</h3>
        <p>${message || "Internet aloqasini tekshirib qayta urinib ko‘ring."}</p>
        <button type="button" onclick="loadReferralPage()">Qayta urinish</button>
    </div>`;
}

async function loadReferralPage() {
    Navbar.setActive("profile");
    Navbar.currentPage = "referral";
    showPage("referralPage", "Referral");
    document.getElementById("referralPage").innerHTML = referralSkeleton();
    try {
        referralData = normalizeReferralSummary(await getReferralSummary());
        renderReferralPage(referralData);
    } catch (error) {
        referralData = null;
        renderReferralError(error?.message);
    }
}

if (typeof module !== "undefined") {
    module.exports = {
        normalizeReferralSummary,
        referralClipboardWrite,
        referralMoney,
        referralShareMessage,
        referralShareUrl,
    };
}
