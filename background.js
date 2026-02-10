const DEFAULT_SETTINGS = {
  jpegQuality: 0.6,
  scale: 1
};

async function getSettings() {
  const stored = await chrome.storage.local.get(["settings"]);
  return { ...DEFAULT_SETTINGS, ...(stored.settings || {}) };
}

async function captureVisibleTab() {
  const dataUrl = await chrome.tabs.captureVisibleTab(undefined, { format: "png" });
  await chrome.storage.local.set({
    lastCapture: {
      dataUrl,
      capturedAt: Date.now()
    }
  });
  return dataUrl;
}

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get(["settings"]);
  if (!stored.settings) {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "capture-screenshot") {
    await captureVisibleTab();
    chrome.runtime.sendMessage({ type: "capture-updated" });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "capture-tab") {
    captureVisibleTab()
      .then((dataUrl) => sendResponse({ dataUrl }))
      .catch((error) => sendResponse({ error: error.message }));
    return true;
  }

  if (message.type === "get-settings") {
    getSettings().then((settings) => sendResponse({ settings }));
    return true;
  }

  if (message.type === "set-settings") {
    chrome.storage.local.set({ settings: message.settings }).then(() => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === "area-selected") {
    chrome.storage.local.set({
      cropArea: message.rect
    }).then(() => sendResponse({ ok: true }));
    return true;
  }

  return false;
});
