// Estudio Viral → Flow · panel dentro de Google Flow.
// Para cada escena: adjunta como ingredientes las fichas aprobadas de sus personajes, pega el prompt
// y (solo si el usuario elige modo automático) pulsa «Iniciar generación». Se detiene ante un reCAPTCHA, un error o falta de créditos:
// nunca intenta saltarse una verificación.
(() => {
  if (window.__evFlowLoaded) return; window.__evFlowLoaded = true;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const state = { batch: null, running: false, stopRequested: false, mode: "asistido", delay: 12, attached: "", prepared: "", snapshot: null };

  // ---------- Controles de Flow (comprobados en la versión de Flow de octubre 2026) ----------
  const promptBox = () => document.querySelector('[role="textbox"][contenteditable="true"]');
  const composer = () => { let c = promptBox(); for (let i = 0; i < 6 && c; i++) c = c.parentElement; return c; };
  const generateButton = () => [...document.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === "Iniciar generación");
  const ingredientImages = () => [...(composer()?.querySelectorAll("img") || [])].filter((i) => /ingrediente/i.test(i.alt || ""));
  const ingredientRemoveButtons = () => [...(composer()?.querySelectorAll("button") || [])].filter((b) => /^ingrediente$/i.test((b.getAttribute("aria-label") || b.innerText || "").trim()));

  // ¿Hay una verificación reCAPTCHA visible o un aviso de error/créditos? Entonces se para.
  function blocker() {
    const challenge = [...document.querySelectorAll('iframe[src*="recaptcha"][src*="bframe"], iframe[title*="desafío"], iframe[title*="challenge"]')]
      .find((f) => { const r = f.getBoundingClientRect(); return r.width > 50 && r.height > 50 && getComputedStyle(f).visibility !== "hidden"; });
    if (challenge) return "Flow pide una verificación (reCAPTCHA). Resuélvela tú y pulsa «Continuar».";
    const alerts = [...document.querySelectorAll('[role="alert"], [aria-live="assertive"], [aria-live="polite"]')].map((a) => a.innerText || "").join(" ");
    if (/sin créditos|no tienes (suficientes )?créditos|créditos insuficientes|out of credits/i.test(alerts)) return "Flow dice que no quedan créditos suficientes.";
    if (/no se pudo|se produjo un error|algo salió mal|error al generar|policy|política/i.test(alerts)) return "Flow mostró un error: " + alerts.trim().slice(0, 160);
    return "";
  }

  async function dataUrlToFile(url, name) {
    if (!/^data:image\/(?:png|jpeg|webp);base64,/i.test(url || "")) throw new Error(`La ficha de ${name} no es una imagen compatible.`);
    const blob = await (await fetch(url)).blob();
    const ext = (blob.type.split("/")[1] || "png").replace("jpeg", "jpg");
    return new File([blob], `${name}.${ext}`, { type: blob.type || "image/png" });
  }

  function paste(target, data) {
    target.focus();
    target.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }

  // Escribe el prompt: si ya hay texto, se selecciona SOLO el contenido del cuadro y se reemplaza.
  // (Con el cuadro vacío, «seleccionar todo + borrar» deja al editor de Flow sin sitio para pegar.)
  const normalizePrompt = (value) => (value || "").replace(/\s+/g, " ").trim();
  async function setPromptText(text) {
    const box = promptBox(); if (!box) return false;
    box.focus();
    if (box.innerText.trim()) window.getSelection().selectAllChildren(box);
    const dt = new DataTransfer(); dt.setData("text/plain", text); paste(box, dt);
    await sleep(400);
    // Flow normaliza los saltos de línea. Un segundo método de inserción aquí duplicaba
    // el prompt cuando el primer pegado sí había funcionado pero su texto no era idéntico.
    return normalizePrompt(box.innerText) === normalizePrompt(text);
  }
  async function clearText() {
    const box = promptBox(); if (!box || !box.innerText.trim()) return;
    const clear = [...document.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === "Borrar instrucción");
    if (clear) { clear.click(); await sleep(200); if (!box.innerText.trim()) return; }
    box.focus(); window.getSelection().selectAllChildren(box); document.execCommand("delete"); await sleep(200);
  }

  async function clearComposer() {
    for (let i = 0; i < 12 && ingredientRemoveButtons().length; i++) { ingredientRemoveButtons()[0].click(); await sleep(250); }
    await clearText();
    state.attached = "";
  }

  // ---------- Selector de activos de Flow («+»): reutiliza la ficha ya subida en vez de subirla otra vez ----------
  const PAGE_LOAD = String(Date.now());
  const sheetFileName = (sheet) => `Ficha ${sheet.name} v${sheet.version || 1}`;
  const addButton = () => document.querySelector('button[aria-label="Agregar ingredientes al cuadro de instrucción"]');
  const searchInput = () => document.querySelector('input[aria-label="Buscar activos"]');
  const assetOptions = () => [...document.querySelectorAll('button[role="option"].asset-item')];
  const optionName = (o) => (o.innerText || "").split("\n")[0].trim().replace(/\.(png|jpe?g|webp)$/i, "");
  async function openPicker() {
    if (searchInput()) return true;
    addButton()?.click();
    for (let t = 0; t < 20 && !searchInput(); t++) await sleep(150);
    return !!searchInput();
  }
  async function closePicker() {
    if (!searchInput()) return;
    addButton()?.click(); await sleep(300);
    if (searchInput()) { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await sleep(300); }
  }
  // Busca la ficha entre las cargas del proyecto y la adjunta con un clic. No crea copias en la galería.
  async function pickExisting(fileBase) {
    if (!(await openPicker())) return false;
    const tab = [...document.querySelectorAll('[role="tab"]')].find((t) => /Cargas/.test(t.innerText || ""));
    if (tab) { tab.click(); await sleep(500); }
    const inp = searchInput();
    if (inp) { inp.value = fileBase; inp.dispatchEvent(new Event("input", { bubbles: true })); }
    let opt;
    for (let t = 0; t < 12 && !opt; t++) { await sleep(250); opt = assetOptions().find((o) => optionName(o) === fileBase); }
    if (!opt) { await closePicker(); return false; }
    const before = ingredientImages().length;
    opt.click();
    for (let t = 0; t < 40 && ingredientImages().length <= before; t++) await sleep(250);
    await closePicker();
    return ingredientImages().length > before;
  }
  // ---------- Nombre de las imágenes generadas: «001», «001-2»… (menú «Cambiar nombre» de Flow) ----------
  const tiles = () => [...document.querySelectorAll("flow-grid-tile-container")];
  const tileId = (t) => t.querySelector("[data-media-id]")?.getAttribute("data-media-id") || "";
  const tileName = (t) => (t.getAttribute("aria-label") || "").trim();
  const snapshotTiles = () => new Set(tiles().map(tileId).filter(Boolean));
  // Generadas después de preparar la escena: no estaban antes, ya tienen imagen y no son fichas ni escenas ya nombradas.
  const newTiles = (before) => tiles().filter((t) => { const id = tileId(t); return id && !before.has(id) && !/^Ficha |^\d{3}(-\d+)?$/.test(tileName(t)); });
  async function renameTile(tile, name) {
    const r = tile.getBoundingClientRect();
    tile.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + 20, button: 2 }));
    let item; for (let t = 0; t < 12 && !item; t++) { await sleep(150); item = [...document.querySelectorAll('[role="menuitem"]')].find((m) => /Cambiar nombre/.test(m.innerText || "")); }
    if (!item) { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); return false; }
    item.click();
    let input; for (let t = 0; t < 12 && !input; t++) { await sleep(150); input = document.querySelector(".rename-tile-overlay input"); }
    if (!input) return false;
    input.focus(); input.value = name; input.dispatchEvent(new Event("input", { bubbles: true })); await sleep(200);
    document.querySelector('.rename-tile-overlay button[aria-label="Listo"]')?.click();
    for (let t = 0; t < 12 && document.querySelector(".rename-tile-overlay"); t++) await sleep(150);
    return tileName(tile) === name;
  }
  async function nameGenerated(sceneId, before, waitMs = 0) {
    if (!before) return 0;
    for (let t = 0; t < waitMs / 1000 && !newTiles(before).length; t++) await sleep(1000);
    if (waitMs) await sleep(2000);                        // deja que terminen las 4 variantes
    const fresh = newTiles(before).slice(0, 8);
    let n = 0;
    for (const [i, tile] of fresh.entries()) if (await renameTile(tile, i ? `${sceneId}-${i + 1}` : sceneId)) n++;
    return n;
  }

  // Fichas subidas por la extensión en cada proyecto: { "/project/…": { "Ficha X v1": idDeCarga } }.
  const getUploads = () => new Promise((r) => chrome.storage.local.get("evFlowUploads", (v) => r(v.evFlowUploads || {})));
  async function markUploaded(fileBase) {
    const all = await getUploads();
    (all[location.pathname] ||= {})[fileBase] = PAGE_LOAD;
    await chrome.storage.local.set({ evFlowUploads: all });
  }

  // Adjunta las fichas de la escena. Si ya están las mismas adjuntas (de la escena anterior), no se tocan.
  // Cada ficha se sube a Flow UNA sola vez por proyecto; después se toma del selector de activos.
  async function attachRefs(refs) {
    const key = refs.slice().sort().join("|");
    if (key && key === state.attached && ingredientImages().length === refs.length) return;
    for (const name of refs) if (!state.batch.sheets.some((s) => s.name === name)) throw new Error(`Falta la ficha aprobada de ${name} en el lote.`);
    if (!state.attached && (promptBox()?.innerText.trim() || ingredientImages().length) && !confirm("Flow ya tiene un prompt o ingredientes. ¿Reemplazarlos por esta escena?")) throw new Error("Preparación cancelada; el contenido de Flow se conservó.");
    await clearComposer();
    for (const name of refs) {
      const sheet = state.batch.sheets.find((s) => s.name === name);
      if (!sheet) throw new Error(`Falta la ficha aprobada de ${name} en el lote.`);
      const fileBase = sheetFileName(sheet);
      if (await pickExisting(fileBase)) { await sleep(400); continue; }
      // Flow solo refresca su lista de cargas al recargar la página: si se subió en esta misma carga, no se sube otra copia.
      if ((await getUploads())[location.pathname]?.[fileBase] === PAGE_LOAD) {
        state.attached = "";
        throw new Error(`La ficha de ${name} ya está subida a este proyecto. Recarga Flow (F5) y pulsa «Preparar» otra vez: la extensión la tomará de tus cargas sin subir otra copia.`);
      }
      const before = ingredientImages().length;
      const dt = new DataTransfer(); dt.items.add(await dataUrlToFile(sheet.dataUrl, fileBase));
      paste(promptBox(), dt);
      for (let t = 0; t < 60 && ingredientImages().length <= before; t++) await sleep(250);   // hasta 15 s por subida
      if (ingredientImages().length <= before) throw new Error(`No se pudo adjuntar la ficha de ${name}.`);
      await markUploaded(fileBase);
      await sleep(600);
    }
    state.attached = key;
  }

  async function sendScene(scene) {
    const b = blocker(); if (b) throw Object.assign(new Error(b), { pause: true });
    if (!promptBox()) throw new Error("No encuentro el cuadro del prompt. Abre un proyecto de Flow.");
    state.snapshot = snapshotTiles();                     // para reconocer después lo que se genere con esta escena
    await attachRefs(scene.refs || []);
    if (!(await setPromptText(scene.prompt))) throw new Error("El prompt quedó incompleto en Flow; revisa el cuadro antes de generar.");
    if (state.mode !== "auto") return "listo";            // modo asistido: tú pulsas generar
    let gen = generateButton();
    for (let t = 0; t < 20 && (!gen || gen.disabled); t++) { await sleep(250); gen = generateButton(); }
    if (!gen || gen.disabled) throw new Error("El botón «Iniciar generación» no se activó.");
    gen.click();
    // Enviado cuando el cuadro se vacía; si aparece una verificación o un error, se para.
    for (let t = 0; t < 80; t++) {
      await sleep(250);
      const bl = blocker(); if (bl) throw Object.assign(new Error(bl), { pause: true });
      if (!promptBox()?.innerText.trim()) {
        message = `${scene.id} enviada. Esperando las imágenes para ponerles su nombre…`; render();
        await nameGenerated(scene.id, state.snapshot, 120000);
        return "enviada";
      }
    }
    throw new Error("Flow no confirmó el envío: el prompt sigue en el cuadro. Revisa la escena antes de reintentar.");
  }

  // ---------- Panel ----------
  const panel = document.createElement("div");
  panel.id = "ev-flow-panel";
  panel.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647;width:340px;max-height:70vh;overflow:auto;background:#151C2B;color:#e2e8f0;border:1px solid rgba(255,159,28,.45);border-radius:16px;font:13px system-ui,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.5)";
  document.documentElement.appendChild(panel);
  // Flow exige Trusted Types: nada de innerHTML. El panel se construye con createElement.
  const h = (tag, props = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "style") el.style.cssText = v; else if (k === "text") el.textContent = v;
      else if (k === "selected" || k === "disabled") el[k] = !!v; else el.setAttribute(k, v);
    }
    for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid instanceof Node ? kid : String(kid));
    return el;
  };
  const btn = (bg, color = "#fff") => `background:${bg};color:${color};border:0;border-radius:8px;padding:6px 10px;font-weight:600;cursor:pointer`;
  let collapsed = false, message = "";

  function render() {
    const b = state.batch;
    const done = new Set(b?.done || []);
    const head = h("div", { style: "display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.08)" },
      h("b", { style: "color:#FF9F1C", text: "Estudio Viral → Flow" }),
      h("button", { "data-a": "toggle", style: "margin-left:auto;background:none;border:0;color:#94a3b8;cursor:pointer", text: collapsed ? "▲" : "▼" }));
    if (collapsed) { panel.replaceChildren(head); return; }
    if (!b) { panel.replaceChildren(head, h("p", { style: "padding:12px;margin:0", text: "No hay ningún lote. En Estudio Viral abre el episodio → 2 · Imágenes → Enviar a Flow." })); return; }
    const onProject = /\/project\//.test(location.pathname);
    const pending = b.scenes.filter((s) => !done.has(s.id)).length;
    const auto = state.mode === "auto";
    const body = h("div", { style: "padding:10px 12px" },
      h("div", { style: "font-weight:600", text: b.title }),
      h("div", { style: "color:#94a3b8;font-size:12px", text: `${b.scenes.length} escenas · ${b.sheets.length} fichas · ${pending} pendientes` }),
      onProject ? null : h("p", { style: "color:#fcd34d", text: "Abre o crea un proyecto en Flow para enviar las escenas." }),
      h("div", { style: "display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;align-items:center" },
        h("select", { "data-a": "mode", style: "background:#0b1220;color:#e2e8f0;border:1px solid #334155;border-radius:8px;padding:4px" },
          h("option", { value: "asistido", selected: !auto, text: "Asistido (tú generas)" }), h("option", { value: "auto", selected: auto, text: "Automático (usa créditos)" })),
        auto ? h("label", { style: "font-size:12px;color:#94a3b8" }, "pausa ", h("input", { "data-a": "delay", type: "number", min: "5", max: "120", value: String(state.delay), style: "width:48px;background:#0b1220;color:#e2e8f0;border:1px solid #334155;border-radius:6px;padding:2px 4px" }), " s") : null),
      h("div", { style: "display:flex;gap:6px;margin-top:8px;flex-wrap:wrap" },
        state.running ? h("button", { "data-a": "stop", style: btn("#ef4444"), text: "Pausar" })
          : state.prepared && !auto ? h("button", { "data-a": "confirm", style: btn("#34D399", "#111"), text: `Marcar ${state.prepared} generada` })
          : h("button", { "data-a": "all", disabled: !(onProject && pending), style: btn("#FF9F1C", "#111"), text: auto ? "Enviar todas" : "Preparar siguiente" }),
        h("button", { "data-a": "reset", style: btn("#334155"), text: "Reiniciar estado" }),
        h("button", { "data-a": "clear", style: btn("#334155"), text: "Borrar lote" })),
      message ? h("p", { style: "margin:8px 0 0;color:#fcd34d", text: message }) : null,
      h("ol", { style: "margin:8px 0 0;padding-left:0;list-style:none" }, b.scenes.map((s) => h("li", { style: "display:flex;gap:6px;align-items:center;padding:3px 0;border-top:1px solid rgba(255,255,255,.05)" },
        h("span", { style: `font-weight:700;color:${done.has(s.id) ? "#34D399" : "#FF9F1C"}`, text: s.id }),
        h("span", { style: "flex:1;color:#cbd5e1;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap", title: s.title || "", text: `${s.title || ""} · ${(s.refs || []).join(", ") || "sin fichas"}` }),
        done.has(s.id) ? h("span", { style: "color:#34D399;font-size:11px", text: "✓" })
          : h("button", { "data-a": "one", "data-id": s.id, disabled: state.running || !onProject || !!state.prepared, style: btn("#1f2937") + ";padding:2px 8px;font-size:11px", text: auto ? "Enviar" : "Preparar" })))),
      h("p", { style: "margin:8px 0 0;color:#94a3b8;font-size:11px", text: auto ? "Enviar usa tus créditos de Flow. La extensión se detiene si aparece una verificación o error." : "Preparar adjunta las fichas (se suben a Flow una sola vez por proyecto y luego se reutilizan) y pega el texto sin generar. Genera en Flow y marca la escena." }));
    panel.replaceChildren(head, body);
  }

  async function save() { await chrome.storage.local.set({ evFlowBatch: state.batch }); }

  async function run(onlyId) {
    if (state.running || !state.batch) return;
    state.running = true; state.stopRequested = false; message = ""; render();
    try {
      const done = new Set(state.batch.done || []);
      const queue = state.batch.scenes.filter((s) => (onlyId ? s.id === onlyId : !done.has(s.id)));
      for (const [i, scene] of queue.entries()) {
        if (state.stopRequested) { message = "Pausado."; break; }
        message = `Enviando ${scene.id}…`; render();
        const res = await sendScene(scene);
        if (res === "enviada") { state.batch.done = [...new Set([...(state.batch.done || []), scene.id])]; await save(); }
        if (state.mode !== "auto") { state.prepared = scene.id; message = `${scene.id} lista en Flow. Revisa las fichas y el prompt, genera allí y después confirma esta escena.`; break; }
        if (i < queue.length - 1) for (let s = state.delay; s > 0 && !state.stopRequested; s--) { message = `${scene.id} enviada. Siguiente en ${s} s…`; render(); await sleep(1000); }
      }
      if (!state.stopRequested && state.mode === "auto" && !onlyId) message = "Lote enviado. Revisa las imágenes en Flow.";
    } catch (e) {
      message = (e && e.message) || String(e);
    } finally { state.running = false; render(); }
  }

  panel.addEventListener("click", async (ev) => {
    const a = ev.target.closest("[data-a]")?.getAttribute("data-a");
    if (!a) return;
    if (a === "toggle") { collapsed = !collapsed; render(); }
    if (a === "all") run();
    if (a === "one") run(ev.target.closest("[data-id]").getAttribute("data-id"));
    if (a === "confirm" && state.batch && state.prepared) {
      state.batch.done = [...new Set([...(state.batch.done || []), state.prepared])];
      const named = await nameGenerated(state.prepared, state.snapshot);
      message = `${state.prepared} marcada como generada.` + (named ? ` ${named} imagen(es) renombrada(s) a «${state.prepared}» en Flow.` : " No encontré imágenes nuevas que renombrar (¿aún se están generando?).");
      state.prepared = ""; await save(); render();
    }
    if (a === "stop") { state.stopRequested = true; message = "Pausando al terminar la escena actual…"; render(); }
    if (a === "reset" && state.batch) { state.batch.done = []; state.prepared = ""; await save(); message = ""; render(); }
    if (a === "clear" && confirm("¿Borrar el lote de la extensión? Las imágenes ya creadas en Flow no se tocan.")) { await chrome.storage.local.remove("evFlowBatch"); state.batch = null; state.prepared = ""; render(); }
  });
  panel.addEventListener("change", (ev) => {
    const a = ev.target.getAttribute("data-a");
    if (a === "mode") { state.mode = ev.target.value; state.prepared = ""; render(); }
    if (a === "delay") { state.delay = Math.min(120, Math.max(5, Number(ev.target.value) || 12)); chrome.storage.local.set({ evFlowDelay: state.delay }); }
  });

  chrome.storage.local.get(["evFlowBatch", "evFlowDelay"], (v) => {
    state.batch = v.evFlowBatch || null; state.mode = "asistido"; state.delay = v.evFlowDelay || 12; render();
  });
  chrome.storage.onChanged.addListener((changes) => { if (changes.evFlowBatch && !state.running) {
    const next = changes.evFlowBatch.newValue || null;
    if (next?.receivedAt !== state.batch?.receivedAt) { state.mode = "asistido"; state.prepared = ""; }
    const isNewBatch = next?.receivedAt !== state.batch?.receivedAt;
    state.batch = next;
    if (isNewBatch) message = state.batch ? "Lote nuevo recibido." : "";
    render();
  } });
  // Flow es una SPA: al cambiar de proyecto se vuelve a pintar el panel.
  let path = location.pathname; setInterval(() => { if (location.pathname !== path) { path = location.pathname; state.attached = ""; render(); } }, 1000);
})();
