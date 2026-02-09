(() => {
  const overlay = document.createElement("div");
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.background = "rgba(0,0,0,0.35)";
  overlay.style.cursor = "crosshair";
  overlay.style.zIndex = "2147483647";

  const selection = document.createElement("div");
  selection.style.position = "absolute";
  selection.style.border = "2px dashed #4caf50";
  selection.style.background = "rgba(76, 175, 80, 0.15)";
  selection.style.pointerEvents = "none";
  overlay.appendChild(selection);

  document.body.appendChild(overlay);

  let startX = 0;
  let startY = 0;
  let isDragging = false;

  function cleanup() {
    overlay.remove();
    window.removeEventListener("keydown", onKeyDown);
  }

  function onKeyDown(event) {
    if (event.key === "Escape") {
      cleanup();
      chrome.runtime.sendMessage({ type: "area-selected", rect: null });
    }
  }

  overlay.addEventListener("mousedown", (event) => {
    isDragging = true;
    startX = event.clientX;
    startY = event.clientY;
    selection.style.left = `${startX}px`;
    selection.style.top = `${startY}px`;
    selection.style.width = "0px";
    selection.style.height = "0px";
  });

  overlay.addEventListener("mousemove", (event) => {
    if (!isDragging) return;
    const currentX = event.clientX;
    const currentY = event.clientY;
    const left = Math.min(startX, currentX);
    const top = Math.min(startY, currentY);
    const width = Math.abs(startX - currentX);
    const height = Math.abs(startY - currentY);
    selection.style.left = `${left}px`;
    selection.style.top = `${top}px`;
    selection.style.width = `${width}px`;
    selection.style.height = `${height}px`;
  });

  overlay.addEventListener("mouseup", (event) => {
    if (!isDragging) return;
    isDragging = false;
    const endX = event.clientX;
    const endY = event.clientY;
    const left = Math.min(startX, endX);
    const top = Math.min(startY, endY);
    const width = Math.abs(startX - endX);
    const height = Math.abs(startY - endY);
    cleanup();
    chrome.runtime.sendMessage({
      type: "area-selected",
      rect: { x: left, y: top, w: width, h: height, dpr: window.devicePixelRatio || 1 }
    });
  });

  window.addEventListener("keydown", onKeyDown);
})();
