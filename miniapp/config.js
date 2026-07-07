const API_URL = "https://level-backend-jocker7005.waw0.amvera.tech";

const tg = window.Telegram?.WebApp || {
    ready: () => {},
    expand: () => {},
    showAlert: (text) => alert(text),
    showPopup: ({ message }) => alert(message),
    showConfirm: (message, callback) => callback(confirm(message)),
};

tg.ready();
tg.expand();

const user = tg.initDataUnsafe?.user || {};

const TELEGRAM_ID = user.id || 0;
const FIRST_NAME = user.first_name || "User";
const USERNAME = user.username || "";

async function api(path, method = "GET", body = null) {
    const options = {
        method,
        headers: {
            "Content-Type": "application/json",
        },
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(API_URL + path, options);
    return await response.json();
}
