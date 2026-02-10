const CAPTURE_STORAGE_KEY = "snapqr:lastCapture";
const SETTINGS_KEY = "snapqr:settings";
const QR_LIMIT_BYTES = 2500;

const page = document.body.dataset.page;
const elements = {
  thumbnail: document.getElementById("thumbnail"),
  captureFull: document.getElementById("capture-full"),
  captureArea: document.getElementById("capture-area"),
  toggleSettings: document.getElementById("toggle-settings"),
  settingsPanel: document.getElementById("settings-panel"),
  qualitySlider: document.getElementById("quality-slider"),
  qualityValue: document.getElementById("quality-value"),
  scaleSelect: document.getElementById("scale-select"),
  copyImage: document.getElementById("copy-image"),
  generateQr: document.getElementById("generate-qr"),
  downloadImage: document.getElementById("download-image"),
  copyText: document.getElementById("copy-text"),
  qrCanvas: document.getElementById("qr-canvas"),
  statusMessage: document.getElementById("status-message"),
  fallbackPanel: document.getElementById("fallback-panel"),
  uploadTemp: document.getElementById("upload-temp"),
  extractOcr: document.getElementById("extract-ocr"),
};

let currentCapture = null;
let processedDataUrl = null;
let processedBlob = null;
let settings = {
  jpegQuality: 0.6,
  scale: 1,
};

init();

async function init() {
  settings = await chrome.runtime.sendMessage({ type: "snapqr:get-settings" });
  applySettingsToUi();
  await loadStoredCapture();
  bindEvents();
}

function bindEvents() {
  elements.captureFull?.addEventListener("click", () => {
    requestCapture("full");
  });
  elements.captureArea?.addEventListener("click", () => {
    requestCapture("area");
  });
  elements.toggleSettings?.addEventListener("click", () => {
    elements.settingsPanel?.classList.toggle("hidden");
  });
  elements.qualitySlider?.addEventListener("input", () => {
    const value = Number.parseFloat(elements.qualitySlider.value);
    settings.jpegQuality = value;
    elements.qualityValue.textContent = value.toFixed(1);
    persistSettings();
  });
  elements.scaleSelect?.addEventListener("change", () => {
    settings.scale = Number.parseFloat(elements.scaleSelect.value);
    persistSettings();
  });
  elements.copyImage?.addEventListener("click", async () => {
    if (!processedBlob) return;
    await navigator.clipboard.write([
      new ClipboardItem({ [processedBlob.type]: processedBlob }),
    ]);
    setStatus("Imagen copiada al portapapeles.");
  });
  elements.generateQr?.addEventListener("click", async () => {
    await generateQr();
  });
  elements.downloadImage?.addEventListener("click", () => {
    if (!processedDataUrl) return;
    const link = document.createElement("a");
    link.href = processedDataUrl;
    const extension = processedBlob?.type === "image/jpeg" ? "jpg" : "png";
    link.download = `snapqr-capture.${extension}`;
    link.click();
  });
  elements.copyText?.addEventListener("click", async () => {
    if (!processedDataUrl) return;
    await navigator.clipboard.writeText(processedDataUrl);
    setStatus("Data URL copiado.");
  });
  elements.uploadTemp?.addEventListener("click", () => {
    setStatus("Función de subida temporal pendiente.");
  });
  elements.extractOcr?.addEventListener("click", () => {
    setStatus("Función OCR pendiente.");
  });
}

async function requestCapture(mode) {
  setStatus("Capturando pantalla…");
  await chrome.runtime.sendMessage({
    type: "snapqr:request-capture",
    payload: { mode, openPage: page !== "capture" },
  });
  if (page === "popup") {
    window.close();
  }
}

async function loadStoredCapture() {
  const result = await chrome.storage.local.get([CAPTURE_STORAGE_KEY]);
  currentCapture = result[CAPTURE_STORAGE_KEY] ?? null;
  if (currentCapture) {
    updateThumbnail(currentCapture.dataUrl);
    enableActions();
    await processCapture();
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes[CAPTURE_STORAGE_KEY]) {
    currentCapture = changes[CAPTURE_STORAGE_KEY].newValue ?? null;
    if (currentCapture?.dataUrl) {
      updateThumbnail(currentCapture.dataUrl);
      enableActions();
      processCapture();
    }
  }
});

async function processCapture() {
  if (!currentCapture) return;

  const image = await loadImage(currentCapture.dataUrl);
  let canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return;

  let targetWidth = image.width;
  let targetHeight = image.height;

  if (currentCapture.mode === "area" && currentCapture.selection) {
    const { x, y, width, height, devicePixelRatio } = currentCapture.selection;
    const scale = devicePixelRatio || 1;
    targetWidth = Math.round(width * scale);
    targetHeight = Math.round(height * scale);
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    context.drawImage(
      image,
      Math.round(x * scale),
      Math.round(y * scale),
      targetWidth,
      targetHeight,
      0,
      0,
      targetWidth,
      targetHeight,
    );
  } else {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    context.drawImage(image, 0, 0);
  }

  const processed = await compressToFit(canvas, settings);
  processedDataUrl = processed.dataUrl;
  processedBlob = processed.blob;

  if (!processedDataUrl) {
    elements.copyImage.disabled = true;
    elements.generateQr.disabled = true;
    elements.downloadImage.disabled = true;
    elements.copyText.disabled = true;
    setStatus("No se pudo procesar la captura.");
    return;
  }

  enableActions();
  setStatus(`Imagen procesada (${processed.byteSize} bytes).`);
  if (page === "capture" && processed.autoCopy) {
    await navigator.clipboard.write([
      new ClipboardItem({ [processedBlob.type]: processedBlob }),
    ]);
    setStatus("Imagen copiada al portapapeles y lista para QR.");
  }
}

async function compressToFit(canvas, { jpegQuality, scale }) {
  let workingCanvas = canvas;
  let quality = Math.min(jpegQuality ?? 0.6, 1);
  let targetScale = scale ?? 1;
  let dataUrl = canvas.toDataURL("image/png");
  let byteSize = dataUrlSize(dataUrl);

  if (byteSize <= QR_LIMIT_BYTES) {
    const blob = await dataUrlToBlob(dataUrl);
    return { dataUrl, blob, byteSize, autoCopy: false };
  }

  quality = Math.min(quality, 0.6);
  targetScale = Math.min(targetScale, 1);

  while (byteSize > QR_LIMIT_BYTES) {
    const { canvas: resizedCanvas, width, height } = resizeCanvas(
      workingCanvas,
      targetScale,
    );
    workingCanvas = resizedCanvas;
    dataUrl = workingCanvas.toDataURL("image/jpeg", quality);
    byteSize = dataUrlSize(dataUrl);

    if (width <= 100 || height <= 100) {
      break;
    }

    if (byteSize > QR_LIMIT_BYTES) {
      targetScale = Math.max(0.25, targetScale * 0.85);
      quality = Math.max(0.4, quality - 0.05);
    }
  }

  if (byteSize > QR_LIMIT_BYTES) {
    showFallback();
    return { dataUrl: null, blob: null, byteSize };
  }

  hideFallback();
  const blob = await dataUrlToBlob(dataUrl);
  return { dataUrl, blob, byteSize, autoCopy: true };
}

async function generateQr() {
  if (!processedDataUrl) return;
  const qr = qrcode(0, "L");
  qr.addData(processedDataUrl);
  try {
    qr.make();
  } catch (error) {
    showFallback();
    setStatus("No se pudo generar el QR.");
    return;
  }
  hideFallback();
  renderQrToCanvas(qr, elements.qrCanvas);
  setStatus("QR generado y listo.");
  if (processedBlob) {
    await navigator.clipboard.write([
      new ClipboardItem({ [processedBlob.type]: processedBlob }),
    ]);
    setStatus("QR generado y la imagen está en el portapapeles.");
  }
}

function renderQrToCanvas(qr, canvas) {
  const ctx = canvas.getContext("2d");
  const size = qr.getModuleCount();
  const scale = canvas.width / size;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#0f172a";
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (qr.isDark(row, col)) {
        ctx.fillRect(col * scale, row * scale, scale, scale);
      }
    }
  }
}

function updateThumbnail(dataUrl) {
  elements.thumbnail.innerHTML = "";
  const img = document.createElement("img");
  img.src = dataUrl;
  elements.thumbnail.appendChild(img);
}

function enableActions() {
  elements.copyImage.disabled = false;
  elements.generateQr.disabled = false;
  elements.downloadImage.disabled = false;
  elements.copyText.disabled = false;
}

function applySettingsToUi() {
  elements.qualitySlider.value = settings.jpegQuality;
  elements.qualityValue.textContent = settings.jpegQuality.toFixed(1);
  elements.scaleSelect.value = settings.scale.toString();
}

async function persistSettings() {
  await chrome.runtime.sendMessage({
    type: "snapqr:set-settings",
    payload: settings,
  });
}

function setStatus(message) {
  if (elements.statusMessage) {
    elements.statusMessage.textContent = message;
  }
}

function showFallback() {
  elements.fallbackPanel?.classList.remove("hidden");
}

function hideFallback() {
  elements.fallbackPanel?.classList.add("hidden");
}

function dataUrlSize(dataUrl) {
  const base64 = dataUrl.split(",")[1] || "";
  return Math.floor((base64.length * 3) / 4);
}

function resizeCanvas(canvas, scale) {
  const width = Math.max(1, Math.round(canvas.width * scale));
  const height = Math.max(1, Math.round(canvas.height * scale));
  const resized = document.createElement("canvas");
  resized.width = width;
  resized.height = height;
  const ctx = resized.getContext("2d");
  ctx.drawImage(canvas, 0, 0, width, height);
  return { canvas: resized, width, height };
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

async function dataUrlToBlob(dataUrl) {
  const response = await fetch(dataUrl);
  return response.blob();
}
