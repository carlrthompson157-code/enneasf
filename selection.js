(() => {
  if (window.__snapqrSelectionActive) {
    return;
  }
  window.__snapqrSelectionActive = true;

  const overlay = document.createElement("div");
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.cursor = "crosshair";
  overlay.style.background = "rgba(0, 0, 0, 0.15)";
  overlay.style.zIndex = "999999";

  const box = document.createElement("div");
  box.style.position = "absolute";
  box.style.border = "2px dashed #22c55e";
  box.style.background = "rgba(34, 197, 94, 0.15)";
  overlay.appendChild(box);

  document.body.appendChild(overlay);

  let startX = 0;
  let startY = 0;
  let dragging = false;

  const cleanup = () => {
    overlay.remove();
    window.__snapqrSelectionActive = false;
  };

  overlay.addEventListener("mousedown", (event) => {
    dragging = true;
    startX = event.clientX;
    startY = event.clientY;
    box.style.left = `${startX}px`;
    box.style.top = `${startY}px`;
    box.style.width = "0px";
    box.style.height = "0px";
  });

  overlay.addEventListener("mousemove", (event) => {
    if (!dragging) return;
    const endX = event.clientX;
    const endY = event.clientY;
    const left = Math.min(startX, endX);
    const top = Math.min(startY, endY);
    const width = Math.abs(endX - startX);
    const height = Math.abs(endY - startY);
    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
    box.style.width = `${width}px`;
    box.style.height = `${height}px`;
  });

  overlay.addEventListener("mouseup", (event) => {
    if (!dragging) return;
    dragging = false;
    const endX = event.clientX;
    const endY = event.clientY;
    const left = Math.min(startX, endX);
    const top = Math.min(startY, endY);
    const width = Math.abs(endX - startX);
    const height = Math.abs(endY - startY);

    cleanup();

    if (width < 5 || height < 5) {
      chrome.runtime.sendMessage({ type: "snapqr:selection-cancel" });
      return;
    }

    chrome.runtime.sendMessage({
      type: "snapqr:selection-complete",
      payload: {
        x: left,
        y: top,
        width,
        height,
        devicePixelRatio: window.devicePixelRatio || 1,
      },
    });
  });

  overlay.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    cleanup();
    chrome.runtime.sendMessage({ type: "snapqr:selection-cancel" });
  });

  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      cleanup();
      chrome.runtime.sendMessage({ type: "snapqr:selection-cancel" });
    }
  });

  overlay.tabIndex = -1;
  overlay.focus();
})();
