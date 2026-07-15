function userAvatarEscape(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function safeUserAvatarUrl(value) {
    const url = String(value || "").trim();
    if (!url) return "";
    try {
        const parsed = new URL(url);
        return parsed.protocol === "https:" ? parsed.href : "";
    } catch (_error) {
        return "";
    }
}

function normalizeBackendUser(source = {}, prefix = "user") {
    const nested = source?.[prefix] && typeof source[prefix] === "object" ? source[prefix] : {};
    const field = (name) => source?.[`${prefix}_${name}`] ?? nested?.[name];
    const displayName = field("display_name") || field("name") || field("first_name")
        || (prefix === "user" ? source.display_name || source.first_name : "")
        || "Foydalanuvchi";
    const rawUsername = field("username") || (prefix === "user" ? source.username : "") || "";
    const username = rawUsername ? `@${String(rawUsername).replace(/^@/, "")}` : "";
    const photoUrl = safeUserAvatarUrl(
        field("photo_url") || field("avatar_url") || field("profile_photo_url")
        || (prefix === "user" ? source.photo_url || source.avatar_url || source.profile_photo_url : ""),
    );
    const online = Boolean(field("is_online") ?? (prefix === "user" ? source.is_online : false));
    const onlineText = field("online_text") || (online ? "Online" : "Offline");
    return { displayName: String(displayName), username, photoUrl, online, onlineText: String(onlineText) };
}

function userAvatarComponent(user, { size = "md", showInfo = false } = {}) {
    const data = user?.displayName
        ? { ...user, photoUrl: safeUserAvatarUrl(user.photoUrl) }
        : normalizeBackendUser(user);
    const image = data.photoUrl
        ? `<img src="${userAvatarEscape(data.photoUrl)}" alt="" loading="lazy" decoding="async"
            onload="userAvatarImageLoaded(this)" onerror="userAvatarImageFailed(this)">`
        : "";
    const avatar = `<span class="user-avatar user-avatar-${userAvatarEscape(size)} ${image ? "is-loading" : "is-fallback"}">
        <i class="user-avatar-skeleton"></i><b class="user-avatar-fallback">LG</b>${image}
    </span>`;
    if (!showInfo) return avatar;
    return `<span class="user-identity">${avatar}<span class="user-identity-copy">
        <strong>${userAvatarEscape(data.displayName)}</strong>
        ${data.username ? `<small>${userAvatarEscape(data.username)}</small>` : ""}
        <em class="${data.online ? "is-online" : ""}"><i></i>${userAvatarEscape(data.onlineText)}</em>
    </span></span>`;
}

function userAvatarImageLoaded(image) {
    image?.parentElement?.classList.remove("is-loading", "is-fallback");
    image?.parentElement?.classList.add("is-loaded");
}

function userAvatarImageFailed(image) {
    const avatar = image?.parentElement;
    image?.remove();
    avatar?.classList.remove("is-loading", "is-loaded");
    avatar?.classList.add("is-fallback");
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        safeUserAvatarUrl,
        normalizeBackendUser,
        userAvatarComponent,
    };
}
