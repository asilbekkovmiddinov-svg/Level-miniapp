const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const Banner = require("../miniapp/pages/promotions-banner.js");
const { PromotionsAdminApi } = require("../miniapp/pages/promotions-admin-api.js");


test("banner validation accepts JPG PNG WEBP up to 5 MB", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) {
        assert.equal(Banner.validateFile({ type, size: Banner.MAX_FILE_SIZE }), true);
    }
    assert.throws(() => Banner.validateFile({ type: "image/gif", size: 100 }), /JPG/);
    assert.throws(() => Banner.validateFile({ type: "image/jpeg", size: Banner.MAX_FILE_SIZE + 1 }), /5 MB/);
});


test("crop geometry always returns a centered movable 16:9 source", () => {
    const landscape = Banner.cropRect(2000, 1000, 1, 0, 0);
    assert.equal(landscape.width / landscape.height, 16 / 9);
    assert.equal(landscape.x, (2000 - landscape.width) / 2);
    const zoomed = Banner.cropRect(1000, 2000, 2, 1, -1);
    assert.equal(zoomed.width / zoomed.height, 16 / 9);
    assert.equal(zoomed.x, 1000 - zoomed.width);
    assert.equal(zoomed.y, 0);
});


test("XHR banner upload sends initData, multipart file and progress without internal key", async () => {
    const headers = {};
    let sentForm = null;
    const progress = [];
    const xhr = {
        upload: {}, status: 200, responseText: JSON.stringify({ id: 7, banner_uploaded: true }),
        open(method, url) { this.method = method; this.url = url; },
        setRequestHeader(name, value) { headers[name] = value; },
        send(form) {
            sentForm = form;
            this.upload.onprogress({ lengthComputable: true, loaded: 5, total: 10 });
            this.onload();
        },
    };
    const api = new PromotionsAdminApi({ baseUrl: "https://backend.example", initDataProvider: () => "verified-admin" });
    const result = await api.uploadBanner(7, new Blob(["banner"], { type: "image/webp" }), (value) => progress.push(value), () => xhr);
    assert.equal(xhr.method, "POST");
    assert.equal(xhr.url, "https://backend.example/admin/promotions/7/banner");
    assert.equal(headers["X-Telegram-Init-Data"], "verified-admin");
    assert.equal(headers["X-Internal-Api-Key"], undefined);
    assert.ok(sentForm.get("file") instanceof Blob);
    assert.deepEqual(progress, [50, 100]);
    assert.equal(result.banner_uploaded, true);
});


test("banner delete uses authenticated Admin endpoint", async () => {
    const calls = [];
    const api = new PromotionsAdminApi({
        baseUrl: "https://backend.example", initDataProvider: () => "verified-admin",
        fetchImpl: async (url, options) => { calls.push({ url, options }); return { ok: true, status: 200, json: async () => ({}) }; },
    });
    await api.deleteBanner(9);
    assert.equal(calls[0].url, "https://backend.example/admin/promotions/9/banner");
    assert.equal(calls[0].options.method, "DELETE");
    assert.equal(calls[0].options.headers["X-Telegram-Init-Data"], "verified-admin");
});


test("Admin form exposes camera gallery drag-drop crop replace delete retry and progress", () => {
    const source = fs.readFileSync(path.join(__dirname, "../miniapp/pages/promotions-admin.js"), "utf8");
    const studio = fs.readFileSync(path.join(__dirname, "../miniapp/pages/promotions-banner.js"), "utf8");
    const index = fs.readFileSync(path.join(__dirname, "../miniapp/index.html"), "utf8");
    for (const expected of ["data-gallery", "data-camera", "capture=", "dragenter", "drop", "uploadBanner", "deleteBanner", "Uploadni qayta urinish", "pac-upload-progress"]) {
        assert.match(source, new RegExp(expected));
    }
    assert.match(studio, /16:9 BANNER CROP/);
    assert.match(studio, /compressedBlob/);
    assert.match(studio, /pointermove/);
    assert.match(index, /pages\/promotions-banner\.js/);
    assert.match(index, /promotions-banner\.css/);
});
