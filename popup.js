const MAX_QR_BYTES = 2500;
const MIN_DIMENSION = 100;

const elements = {
  thumbnail: document.getElementById("thumbnail"),
  thumbnailPlaceholder: document.getElementById("thumbnailPlaceholder"),
  captureAll: document.getElementById("captureAll"),
  captureArea: document.getElementById("captureArea"),
  copyImage: document.getElementById("copyImage"),
  generateQr: document.getElementById("generateQr"),
  downloadImage: document.getElementById("downloadImage"),
  copyDataUrl: document.getElementById("copyDataUrl"),
  settings: document.getElementById("settings"),
  toggleSettings: document.getElementById("toggleSettings"),
  quality: document.getElementById("quality"),
  scale: document.getElementById("scale"),
  qualityValue: document.getElementById("qualityValue"),
  scaleValue: document.getElementById("scaleValue"),
  qrCanvas: document.getElementById("qrCanvas"),
  status: document.getElementById("status"),
  fallback: document.getElementById("fallback"),
  uploadOption: document.getElementById("uploadOption"),
  ocrOption: document.getElementById("ocrOption")
};

let lastCapture = null;
let processedDataUrl = null;

function updateThumbnail(dataUrl) {
  if (!dataUrl) {
    elements.thumbnail.style.display = "none";
    elements.thumbnailPlaceholder.style.display = "block";
    return;
  }
  elements.thumbnail.src = dataUrl;
  elements.thumbnail.style.display = "block";
  elements.thumbnailPlaceholder.style.display = "none";
}

function updateActionButtons(enabled) {
  elements.copyImage.disabled = !enabled;
  elements.generateQr.disabled = !enabled;
  elements.downloadImage.disabled = !enabled;
  elements.copyDataUrl.disabled = !enabled;
}

function updateStatus(message) {
  elements.status.textContent = message;
}

function showFallback(show) {
  elements.fallback.classList.toggle("hidden", !show);
}

async function loadSettings() {
  const response = await chrome.runtime.sendMessage({ type: "get-settings" });
  const settings = response.settings;
  elements.quality.value = settings.jpegQuality;
  elements.scale.value = settings.scale;
  elements.qualityValue.textContent = settings.jpegQuality.toFixed(2);
  elements.scaleValue.textContent = `${Math.round(settings.scale * 100)}%`;
}

async function saveSettings() {
  const settings = {
    jpegQuality: parseFloat(elements.quality.value),
    scale: parseFloat(elements.scale.value)
  };
  elements.qualityValue.textContent = settings.jpegQuality.toFixed(2);
  elements.scaleValue.textContent = `${Math.round(settings.scale * 100)}%`;
  await chrome.runtime.sendMessage({ type: "set-settings", settings });
}

function dataUrlSize(dataUrl) {
  const base64 = dataUrl.split(",")[1] || "";
  return Math.floor((base64.length * 3) / 4);
}

async function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

async function cropImage(dataUrl, rect) {
  if (!rect) return dataUrl;
  const img = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  const dpr = rect.dpr || 1;
  canvas.width = Math.max(1, rect.w * dpr);
  canvas.height = Math.max(1, rect.h * dpr);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(
    img,
    rect.x * dpr,
    rect.y * dpr,
    rect.w * dpr,
    rect.h * dpr,
    0,
    0,
    canvas.width,
    canvas.height
  );
  return canvas.toDataURL("image/png");
}

async function compressToFit(dataUrl, settings) {
  let img = await loadImage(dataUrl);
  let scale = settings.scale;
  let quality = settings.jpegQuality;
  let width = Math.max(1, Math.round(img.width * scale));
  let height = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  let output = dataUrl;

  const tryEncode = () => {
    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", quality);
  };

  if (dataUrlSize(dataUrl) <= MAX_QR_BYTES) {
    return dataUrl;
  }

  output = tryEncode();

  while (dataUrlSize(output) > MAX_QR_BYTES && (width > MIN_DIMENSION || height > MIN_DIMENSION)) {
    width = Math.max(MIN_DIMENSION, Math.floor(width * 0.85));
    height = Math.max(MIN_DIMENSION, Math.floor(height * 0.85));
    quality = Math.max(0.4, quality - 0.05);
    output = tryEncode();
  }

  return output;
}

async function copyImageToClipboard(dataUrl) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
}

function downloadImage(dataUrl) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = "snapqr-capture.png";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function copyText(text) {
  return navigator.clipboard.writeText(text);
}

function renderQr(data) {
  if (!window.qrcodegen || !window.qrcodegen.QrCode) {
    throw new Error("QR engine no disponible");
  }

  const qr = window.qrcodegen.QrCode.encodeText(data, window.qrcodegen.QrCode.Ecc.L);
  const size = qr.getSize();
  const canvas = elements.qrCanvas;
  const ctx = canvas.getContext("2d");
  const scale = Math.floor(canvas.width / size);
  const offset = Math.floor((canvas.width - size * scale) / 2);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#000";
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (qr.getModule(x, y)) {
        ctx.fillRect(offset + x * scale, offset + y * scale, scale, scale);
      }
    }
  }
}

async function updateCapture(dataUrl) {
  lastCapture = dataUrl;
  updateThumbnail(dataUrl);
  updateActionButtons(Boolean(dataUrl));
  updateStatus(dataUrl ? "Captura lista." : "");
  showFallback(false);
  processedDataUrl = null;
}

async function refreshFromStorage() {
  const stored = await chrome.storage.local.get(["lastCapture", "cropArea"]);
  if (stored.lastCapture?.dataUrl) {
    await updateCapture(stored.lastCapture.dataUrl);
  }
}

async function handleCaptureAll() {
  updateStatus("Capturando...");
  const response = await chrome.runtime.sendMessage({ type: "capture-tab" });
  if (response?.dataUrl) {
    await updateCapture(response.dataUrl);
  } else {
    updateStatus("No se pudo capturar la pestaña.");
  }
}

async function handleCaptureArea() {
  updateStatus("Capturando y esperando selección...");
  const response = await chrome.runtime.sendMessage({ type: "capture-tab" });
  if (!response?.dataUrl) {
    updateStatus("No se pudo capturar la pestaña.");
    return;
  }
  await updateCapture(response.dataUrl);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content-script.js"]
  });
}

chrome.runtime.onMessage.addListener(async (message) => {
  if (message.type === "capture-updated") {
    await refreshFromStorage();
  }

  if (message.type === "area-selected") {
    if (!message.rect) {
      updateStatus("Selección cancelada.");
      return;
    }
    const cropped = await cropImage(lastCapture, message.rect);
    await updateCapture(cropped);
  }
});

async function generateAndDisplayQr() {
  if (!lastCapture) return;
  updateStatus("Procesando imagen...");
  const settings = {
    jpegQuality: parseFloat(elements.quality.value),
    scale: parseFloat(elements.scale.value)
  };

  const compressed = await compressToFit(lastCapture, settings);
  processedDataUrl = compressed;

  if (dataUrlSize(compressed) > MAX_QR_BYTES) {
    updateStatus("La imagen sigue siendo demasiado grande para el QR.");
    showFallback(true);
    return;
  }

  try {
    renderQr(compressed);
    updateStatus("QR generado con corrección L.");
    showFallback(false);
    await copyImageToClipboard(compressed);
  } catch (error) {
    updateStatus("No se pudo generar el QR localmente.");
    showFallback(true);
  }
}

async function handleCopyImage() {
  if (!lastCapture) return;
  const dataUrl = processedDataUrl || lastCapture;
  await copyImageToClipboard(dataUrl);
  updateStatus("Imagen copiada al portapapeles.");
}

function handleDownload() {
  if (!lastCapture) return;
  const dataUrl = processedDataUrl || lastCapture;
  downloadImage(dataUrl);
  updateStatus("Descarga iniciada.");
}

async function handleCopyDataUrl() {
  if (!lastCapture) return;
  const dataUrl = processedDataUrl || lastCapture;
  await copyText(dataUrl);
  updateStatus("Data URL copiado.");
}

elements.captureAll.addEventListener("click", handleCaptureAll);
elements.captureArea.addEventListener("click", handleCaptureArea);
elements.copyImage.addEventListener("click", handleCopyImage);
elements.generateQr.addEventListener("click", generateAndDisplayQr);
elements.downloadImage.addEventListener("click", handleDownload);
elements.copyDataUrl.addEventListener("click", handleCopyDataUrl);
elements.toggleSettings.addEventListener("click", () => {
  elements.settings.classList.toggle("hidden");
});
elements.quality.addEventListener("input", saveSettings);
elements.scale.addEventListener("input", saveSettings);

window.addEventListener("load", async () => {
  await loadSettings();
  await refreshFromStorage();
});

elements.uploadOption.addEventListener("click", () => {
  updateStatus("Función de subida pendiente de integración.");
});

elements.ocrOption.addEventListener("click", () => {
  updateStatus("OCR pendiente de integración.");
});
