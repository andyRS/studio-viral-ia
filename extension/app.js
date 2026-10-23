// Estudio Viral → Flow · puente en la app.
// Recibe el lote que manda la página (window.postMessage) y lo guarda para la pestaña de Flow.
(() => {
  const announce = () => window.postMessage({ source: "ev-extension", type: "EV_EXTENSION_READY", version: "1.0.2" }, window.location.origin);
  announce();
  window.addEventListener("message", (event) => {
    // Solo mensajes de esta misma página (nunca de iframes u otros orígenes).
    if (event.source !== window || event.origin !== window.location.origin) return;
    const msg = event.data || {};
    if (msg.source !== "estudio-viral") return;
    if (msg.type === "EV_PING") announce();
    if (msg.type === "EV_FLOW_BATCH" && msg.batch && Array.isArray(msg.batch.scenes)) {
      const batch = { ...msg.batch, receivedAt: Date.now(), done: [] };
      chrome.storage.local.set({ evFlowBatch: batch }, () => {
        const error = chrome.runtime.lastError ? chrome.runtime.lastError.message : null;
        window.postMessage({ source: "ev-extension", type: "EV_FLOW_BATCH_OK", error, scenes: batch.scenes.length }, window.location.origin);
      });
    }
  });
})();
