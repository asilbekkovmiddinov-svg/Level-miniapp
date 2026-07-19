(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    else root.PromotionBannerStudio = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    const MAX_FILE_SIZE = 5 * 1024 * 1024;
    const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

    function validateFile(file) {
        if (!file || !ACCEPTED_TYPES.has(file.type)) throw new Error("Faqat JPG, PNG yoki WEBP rasm tanlang.");
        if (!file.size || file.size > MAX_FILE_SIZE) throw new Error("Banner hajmi 5 MB’dan oshmasligi kerak.");
        return true;
    }

    function cropRect(width, height, zoom = 1, offsetX = 0, offsetY = 0) {
        const ratio = 16 / 9;
        let cropWidth = width;
        let cropHeight = cropWidth / ratio;
        if (cropHeight > height) {
            cropHeight = height;
            cropWidth = cropHeight * ratio;
        }
        cropWidth /= zoom;
        cropHeight /= zoom;
        const availableX = Math.max(0, width - cropWidth);
        const availableY = Math.max(0, height - cropHeight);
        return {
            x: availableX * (Math.max(-1, Math.min(1, offsetX)) + 1) / 2,
            y: availableY * (Math.max(-1, Math.min(1, offsetY)) + 1) / 2,
            width: cropWidth,
            height: cropHeight,
        };
    }

    function loadImage(file) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const image = new Image();
            image.onload = () => resolve({ image, url });
            image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Rasmni ochib bo‘lmadi.")); };
            image.src = url;
        });
    }

    function canvasBlob(canvas, type, quality) {
        return new Promise((resolve, reject) => canvas.toBlob(
            (blob) => blob ? resolve(blob) : reject(new Error("Rasmni compress qilib bo‘lmadi.")),
            type,
            quality,
        ));
    }

    async function compressedBlob(canvas) {
        for (const quality of [0.86, 0.74, 0.62, 0.5]) {
            const blob = await canvasBlob(canvas, "image/webp", quality);
            if (blob.size <= MAX_FILE_SIZE) return blob;
        }
        throw new Error("Compressed banner ham 5 MB limitdan oshdi.");
    }

    async function open(file) {
        validateFile(file);
        const loaded = await loadImage(file);
        const { image, url } = loaded;
        return new Promise((resolve, reject) => {
            const overlay = document.createElement("div");
            overlay.className = "pac-crop-overlay";
            overlay.innerHTML = `<section class="pac-crop-sheet">
                <header><div><small>16:9 BANNER CROP</small><h2>Rasmni joylashtiring</h2></div><button type="button" data-cancel>×</button></header>
                <div class="pac-crop-stage"><canvas width="1280" height="720"></canvas><span>16:9</span></div>
                <label class="pac-crop-zoom"><span>Zoom</span><input type="range" min="1" max="2" value="1" step="0.01"><b>100%</b></label>
                <p>Rasmni suring va kerakli 16:9 joylashuvni tanlang.</p>
                <footer><button type="button" data-cancel>Bekor qilish</button><button class="primary" type="button" data-apply>Crop & Compress</button></footer>
            </section>`;
            document.body.appendChild(overlay);
            const canvas = overlay.querySelector("canvas");
            const context = canvas.getContext("2d");
            const slider = overlay.querySelector("input");
            const zoomLabel = overlay.querySelector(".pac-crop-zoom b");
            let zoom = 1, offsetX = 0, offsetY = 0, dragging = false, lastX = 0, lastY = 0;
            const draw = () => {
                const crop = cropRect(image.naturalWidth, image.naturalHeight, zoom, offsetX, offsetY);
                context.clearRect(0, 0, canvas.width, canvas.height);
                context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
            };
            const finish = (error, blob) => {
                URL.revokeObjectURL(url); overlay.remove();
                if (error) reject(error); else resolve(blob);
            };
            slider.addEventListener("input", () => {
                zoom = Number(slider.value); zoomLabel.textContent = `${Math.round(zoom * 100)}%`; draw();
            });
            canvas.addEventListener("pointerdown", (event) => {
                dragging = true; lastX = event.clientX; lastY = event.clientY; canvas.setPointerCapture(event.pointerId);
            });
            canvas.addEventListener("pointermove", (event) => {
                if (!dragging) return;
                offsetX = Math.max(-1, Math.min(1, offsetX - (event.clientX - lastX) / 140));
                offsetY = Math.max(-1, Math.min(1, offsetY - (event.clientY - lastY) / 90));
                lastX = event.clientX; lastY = event.clientY; draw();
            });
            canvas.addEventListener("pointerup", () => { dragging = false; });
            overlay.querySelectorAll("[data-cancel]").forEach((button) => button.addEventListener("click", () => finish(new Error("Banner crop cancelled."))));
            overlay.querySelector("[data-apply]").addEventListener("click", async (event) => {
                event.currentTarget.disabled = true; event.currentTarget.textContent = "Compressing...";
                try { finish(null, await compressedBlob(canvas)); } catch (error) {
                    event.currentTarget.disabled = false;
                    event.currentTarget.textContent = "Crop & Compress";
                    overlay.querySelector(".pac-crop-sheet>p").textContent = error.message;
                }
            });
            draw();
        });
    }

    return { ACCEPTED_TYPES, MAX_FILE_SIZE, compressedBlob, cropRect, open, validateFile };
});
