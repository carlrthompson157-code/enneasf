const CAPTURE_STORAGE_KEY = "snapqr:lastCapture";
const SETTINGS_KEY = "snapqr:settings";

const defaultSettings = {
  jpegQuality: 0.6,
  scale: 1,
  autoCopyOnQr: true,
};

const capturePageUrl = chrome.runtime.getURL("capture.html");

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "snapqr-capture",
    title: "SnapQR: Capturar pantalla",
    contexts: ["page", "all"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "snapqr-capture" && tab?.id) {
    await triggerCapture(tab.id, { mode: "full" });
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "capture-visible") {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await triggerCapture(tab.id, { mode: "full" });
    }
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "snapqr:get-settings") {
    chrome.storage.local.get([SETTINGS_KEY]).then((result) => {
      sendResponse(result[SETTINGS_KEY] ?? defaultSettings);
    });
    return true;
  }
  if (message?.type === "snapqr:set-settings") {
    chrome.storage.local.set({ [SETTINGS_KEY]: message.payload }).then(() => {
      sendResponse({ ok: true });
    });
    return true;
  }
  if (message?.type === "snapqr:request-capture") {
    const tabId = sender?.tab?.id;
    if (tabId) {
      triggerCapture(tabId, message.payload ?? { mode: "full" }).then(() => {
        sendResponse({ ok: true });
      });
      return true;
    }
  }
});

async function triggerCapture(tabId, payload) {
  const settings = await ensureSettings();
  const mode = payload?.mode ?? "full";
  const openPage = payload?.openPage ?? true;
  let selection = null;

  if (mode === "area") {
    selection = await requestSelection(tabId);
    if (!selection) {
      return;
    }
  }

  const dataUrl = await chrome.tabs.captureVisibleTab({ format: "png" });
  await chrome.storage.local.set({
    [CAPTURE_STORAGE_KEY]: {
      dataUrl,
      mode,
      selection,
      capturedAt: Date.now(),
    },
  });

  if (openPage) {
    await chrome.tabs.create({ url: `${capturePageUrl}?t=${Date.now()}` });
  }
}

async function requestSelection(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["selection.js"],
  });

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      chrome.runtime.onMessage.removeListener(onMessage);
      resolve(null);
    }, 15000);

    function onMessage(message, sender) {
      if (sender.tab?.id !== tabId) {
        return;
      }
      if (message?.type === "snapqr:selection-complete") {
        clearTimeout(timeout);
        chrome.runtime.onMessage.removeListener(onMessage);
        resolve(message.payload);
      }
      if (message?.type === "snapqr:selection-cancel") {
        clearTimeout(timeout);
        chrome.runtime.onMessage.removeListener(onMessage);
        resolve(null);
      }
    }

    chrome.runtime.onMessage.addListener(onMessage);
  });
}

async function ensureSettings() {
  const result = await chrome.storage.local.get([SETTINGS_KEY]);
  if (!result[SETTINGS_KEY]) {
    await chrome.storage.local.set({ [SETTINGS_KEY]: defaultSettings });
    return defaultSettings;
  }
  return result[SETTINGS_KEY];
}
