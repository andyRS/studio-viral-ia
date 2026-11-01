// Pruebas de integración en el navegador (modo sin sesión, datos aislados en un contexto nuevo por prueba).
// Uso: npm run build && npm run test:e2e   (arranca `next start` en el puerto 3100, o usa E2E_URL).
const { chromium } = require("playwright");
const { spawn } = require("child_process");

const URL = process.env.E2E_URL || "http://localhost:3100";
let fallos = 0;
const ok = (c, m) => { console.log(`${c ? "ok" : "FALLA"} · ${m}`); if (!c) fallos++; };
const esperar = ms => new Promise(r => setTimeout(r, ms));

async function servidor() {
  if (process.env.E2E_URL) return null;
  const p = spawn("npx", ["next", "start", "-p", "3100"], { stdio: "ignore", detached: true });
  for (let i = 0; i < 60; i++) { try { const r = await fetch(URL); if (r.ok) return p; } catch {} await esperar(1000); }
  throw new Error("next start no arrancó");
}
async function abrir(b, semilla) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  page.on("pageerror", e => { console.log("ERROR DE PÁGINA:", e.message); fallos++; });
  await page.goto(URL);
  if (semilla) { await page.evaluate(semilla); await page.reload(); }
  await page.waitForTimeout(1200);
  return { ctx, page };
}
const ir = async (page, espacio, modulo) => {
  await page.getByRole("button", { name: new RegExp(espacio) }).first().click(); await page.waitForTimeout(400);
  if (modulo) { await page.getByRole("button", { name: new RegExp(`^${modulo}`) }).first().click(); await page.waitForTimeout(900); }
};

(async () => {
  const srv = await servidor();
  const b = await chromium.launch();
  try {
    // 1. Crear y recuperar tras recargar.
    { const { ctx, page } = await abrir(b);
      await ir(page, "Creative Studio", "Personajes");
      await page.fill("#new-series-title", "Serie E2E");
      await page.getByRole("button", { name: "Crear serie" }).click(); await page.waitForTimeout(600);
      await page.reload(); await page.waitForTimeout(1200);
      await ir(page, "Creative Studio", "Personajes");
      ok(await page.getByText("Serie E2E").count() > 0, "una serie creada sigue ahí después de recargar");
      await ctx.close(); }

    // 2. Almacenamiento lleno: el fallo se ve, no se finge guardado.
    { const { ctx, page } = await abrir(b);
      await page.evaluate(() => { const blk = "x".repeat(256 * 1024); try { for (let i = 0; i < 100; i++) localStorage.setItem("relleno" + i, blk); } catch {} Object.defineProperty(window, "indexedDB", { value: undefined, configurable: true }); });
      await ir(page, "Creative Studio", "Personajes");
      await page.fill("#new-series-title", "Grande " + "z".repeat(300000));
      await page.getByRole("button", { name: "Crear serie" }).click(); await page.waitForTimeout(800);
      ok(await page.getByText(/Sin guardar en este navegador/).count() > 0, "almacenamiento lleno: aviso «Sin guardar» visible");
      ok(await page.getByRole("button", { name: /Descargar copia/ }).count() > 0, "almacenamiento lleno: se ofrece descargar la copia");
      await ctx.close(); }

    // 3. Borradores: la premisa de la mesa y la idea del formulario sobreviven a cambiar de módulo y a recargar.
    { const { ctx, page } = await abrir(b);
      await ir(page, "Creative Studio", "Generador");
      await page.fill("#studio-premise", "Una abuela que esconde una carta en la Biblia"); await page.waitForTimeout(700);
      await ir(page, "Publish & Grow"); await ir(page, "Creative Studio", "Generador");
      ok((await page.locator("#studio-premise").inputValue()).includes("abuela"), "la premisa a medio escribir vuelve al regresar al módulo");
      await page.reload(); await page.waitForTimeout(1200); await ir(page, "Creative Studio", "Generador");
      ok((await page.locator("#studio-premise").inputValue()).includes("abuela"), "la premisa sobrevive a recargar");
      await page.getByRole("button", { name: /Crear$/ }).first().click(); await page.waitForTimeout(900);
      const idea = page.locator("#generator-idea");
      if (await idea.count()) {
        await idea.fill("Un hijo rico niega a su madre"); await page.waitForTimeout(700);
        await page.reload(); await page.waitForTimeout(1200); await ir(page, "Creative Studio", "Generador");
        await page.getByRole("button", { name: /Crear$/ }).first().click(); await page.waitForTimeout(900);
        ok((await page.locator("#generator-idea").inputValue()).includes("niega"), "la idea del formulario sobrevive a recargar");
      } else ok(false, "no se abrió el formulario de creación (#generator-idea)");
      await ctx.close(); }

    // 4. Calendario: añadir una entrada y conservar el borrador del título.
    { const { ctx, page } = await abrir(b);
      await ir(page, "Publish & Grow", "Calendario");
      await page.fill("#calendar-title", "Entrada E2E"); await page.waitForTimeout(600);
      await ir(page, "Creative Studio"); await ir(page, "Publish & Grow", "Calendario");
      ok((await page.locator("#calendar-title").inputValue()) === "Entrada E2E", "el título a medio escribir del calendario se recupera");
      await page.locator("#calendar-title").press("Enter"); await page.waitForTimeout(700);
      ok(await page.getByText(/se añadió al plan/).count() > 0, "la entrada se añade al plan");
      await ctx.close(); }

    // 5. Generación interrumpida por recarga: se avisa (y no se confunde con otra pestaña viva).
    { const { ctx, page } = await abrir(b, () => {
        localStorage.setItem("estudio-viral:generaciones", JSON.stringify([{ id: "x", ruta: "/api/series", etiqueta: "Crear la serie y el episodio 1", inicio: Date.now() - 30000, pagina: "pagina-cerrada" }]));
      });
      ok(await page.getByText(/se interrumpió/).count() > 0, "una generación cortada al recargar se avisa");
      await page.getByRole("button", { name: "Entendido" }).click(); await page.waitForTimeout(300);
      await page.reload(); await page.waitForTimeout(1200);
      ok(await page.getByText(/se interrumpió/).count() === 0, "tras «Entendido» el aviso no vuelve");
      await ctx.close(); }

    // 6. Reordenar escenas de un episodio corto con el teclado: revisiones y diálogo siguen a su escena.
    { const sc = n => ({ n, durationSec: 8, setting: `Lugar ${n}`, speaker: "Fresa", line: `Frase ${n}`, emotion: "calma", title: `Escena ${n}`, imagePromptFlow: "", animationPrompt: "" });
      const { ctx, page } = await abrir(b, () => {
        const S = (k, v) => localStorage.setItem("estudio-viral:" + k, JSON.stringify(v));
        S("series", [{ id: "s1", title: "Serie Orden", description: "x" }]);
        S("episodes", [{ id: "e1", seriesId: "s1", title: "Episodio Orden", status: "Guion", createdAt: new Date().toISOString(), versions: [],
          output: { title: "Episodio Orden", mode: "llm", cast: [{ name: "Fresa", subtitleColor: "#ff4d6d" }], seriesBible: { style: "frutinovela" },
            scenes: [1, 2, 3].map(n => ({ n, durationSec: 8, setting: `Lugar ${n}`, speaker: "Fresa", line: `Frase ${n}`, emotion: "calma", title: `Escena ${n}`, imagePromptFlow: "", animationPrompt: "" })),
            guionJson: { colores: { Fresa: "FF4D6D" }, clips: [1, 2, 3].map(n => [["Fresa", `Frase ${n}`]]) } } }]);
        S("clipChecks", [{ id: "c1", episodeId: "e1", clipIndex: 0, approved: true, notes: "" }]);
      });
      void sc;
      await ir(page, "Creative Studio", "Generador");
      await page.getByRole("button", { name: /Abrir episodio/ }).first().click(); await page.waitForTimeout(1200);
      const rail = page.getByRole("button", { name: /^Escena 1/ }).first();
      if (await rail.count()) {
        await rail.focus(); await page.keyboard.press("Alt+ArrowRight"); await page.waitForTimeout(1200);
        const datos = await page.evaluate(() => ({ ep: JSON.parse(localStorage.getItem("estudio-viral:episodes"))[0], checks: JSON.parse(localStorage.getItem("estudio-viral:clipChecks")) }));
        ok(datos.ep.output.scenes[1].line === "Frase 1" && datos.ep.output.scenes[1].n === 2, "Alt+→ mueve la escena 1 a la posición 2 y la renumera");
        ok(datos.ep.output.guionJson.clips[1][0][1] === "Frase 1", "el diálogo del montaje sigue a su escena");
        ok(datos.checks[0].clipIndex === 1, "la revisión aprobada sigue a su escena");
        ok(datos.ep.versions.length === 1, "el orden anterior queda en el historial del episodio");
      } else ok(false, "no se encontró la barra de escenas del episodio");
      await ctx.close(); }

    // 7. Director de escenas: la selección cambia el inspector, editar guarda, duplicar y deshacer conservan las revisiones.
    { const { ctx, page } = await abrir(b, () => {
        const S = (k, v) => localStorage.setItem("estudio-viral:" + k, JSON.stringify(v));
        S("series", [{ id: "s1", title: "Serie Director", description: "x" }]);
        S("episodes", [{ id: "e1", seriesId: "s1", title: "Episodio Director", status: "Guion", createdAt: new Date().toISOString(), versions: [],
          output: { title: "Episodio Director", mode: "llm", cast: [{ name: "Fresa" }, { name: "Mango" }], seriesBible: { style: "frutinovela" },
            scenes: [1, 2, 3].map(n => ({ n, durationSec: 8, title: `Beat ${n}`, location: "Colmado", setting: `Acción ${n}`, speaker: n === 2 ? "Mango" : "Fresa", line: `Frase ${n}`, emotion: "calma", imagePromptFlow: "x", animationPrompt: "y" })),
            guionJson: { clips: [1, 2, 3].map(n => [[n === 2 ? "Mango" : "Fresa", `Frase ${n}`]]) } } }]);
        S("clipChecks", [{ id: "c3", episodeId: "e1", clipIndex: 2, approved: false, notes: "rehacer" }]);
      });
      await ir(page, "Creative Studio", "Generador");
      await page.getByRole("button", { name: /Abrir episodio/ }).first().click(); await page.waitForTimeout(1200);
      await page.locator("#sd-card-2").click(); await page.waitForTimeout(300);
      ok((await page.locator(".sd-canvas blockquote").innerText()).includes("Frase 2"), "seleccionar una escena actualiza el lienzo y el inspector");
      await page.locator("#sd-line-2").fill("Frase editada"); await page.locator("#sd-emotion-2").click(); await page.waitForTimeout(900);
      let ep = await page.evaluate(() => JSON.parse(localStorage.getItem("estudio-viral:episodes"))[0]);
      ok(ep.output.scenes[1].line === "Frase editada" && ep.output.guionJson.clips[1][0][1] === "Frase editada", "editar en el inspector guarda la escena y el diálogo del montaje");
      ok(/Guardado/.test(await page.locator(".sd-save").innerText()), "el estado de guardado se muestra");
      await page.getByRole("button", { name: "⧉ Duplicar" }).click(); await page.waitForTimeout(900);
      let ck = await page.evaluate(() => JSON.parse(localStorage.getItem("estudio-viral:clipChecks"))[0]);
      ep = await page.evaluate(() => JSON.parse(localStorage.getItem("estudio-viral:episodes"))[0]);
      ok(ep.output.scenes.length === 4 && ck.clipIndex === 3, "duplicar añade la escena y la revisión siguiente cambia de número");
      await page.getByRole("button", { name: "Deshacer" }).click(); await page.waitForTimeout(900);
      ck = await page.evaluate(() => JSON.parse(localStorage.getItem("estudio-viral:clipChecks"))[0]);
      ep = await page.evaluate(() => JSON.parse(localStorage.getItem("estudio-viral:episodes"))[0]);
      ok(ep.output.scenes.length === 3 && ck.clipIndex === 2, "deshacer devuelve las escenas y la revisión a su sitio");
      await page.locator(".sd-views").getByRole("button", { name: "Guion" }).click(); await page.waitForTimeout(300);
      await page.locator(".sd-script article").nth(2).click(); await page.getByRole("button", { name: /Ver en el director/ }).click(); await page.waitForTimeout(300);
      ok((await page.locator(".sd-canvas blockquote").innerText()).includes("Frase 3"), "del guion al director se conserva la escena elegida");
      await ctx.close(); }

    // 8. Director del proyecto largo: actos → escenas, editar, mover respetando candados e ir a las tomas.
    { const { ctx, page } = await abrir(b, () => {
        const S = (k, v) => localStorage.setItem("estudio-viral:" + k, JSON.stringify(v));
        const esc = (id, h, extra = {}) => ({ id, heading: h, summary: "x", objective: "o", obstacle: "b", consequence: "c", tension: 5, minutes: 2, ...extra });
        S("series", [{ id: "s1", title: "Serie Larga", description: "x", format: "largo", style: "epica" }]);
        S("storyOutlines", [{ id: "o1", seriesId: "s1", structure: 3, targetMinutes: 20, acts: [
          { id: "a1", title: "Acto I", goal: "", sequences: [{ id: "q1", title: "Sec 1", goal: "", scenes: [esc("e1", "EXT. RÍO", { locked: true }), esc("e2", "INT. CASA"), esc("e3", "EXT. CIELO", { tomas: [{ id: "t1", personajes: [], accion: "a", plano: "", lente: "", movimiento: "", composicion: "", luz: "", vfx: "", expresion: "", sonido: "", musica: "", duracion: 5, frameInicial: "", frameFinal: "", transicion: "corte", estado: "aprobado" }] })] }] }] }]);
      });
      await ir(page, "Creative Studio", "Generador");
      const serie = page.getByRole("button", { name: /Serie Larga/ }).first(); if (await serie.count()) { await serie.click(); await page.waitForTimeout(700); }
      const mesa = page.getByRole("button", { name: /Mesa de dirección/ }).first(); if (await mesa.count() && (await mesa.getAttribute("aria-expanded")) === "false") { await mesa.click(); await page.waitForTimeout(600); }
      ok(await page.locator('section[aria-label="Director del proyecto largo"]').count() === 1, "el proyecto largo se abre en el Director");
      await page.locator("#ld-e2").click(); await page.locator("#ld-summary-e2").fill("Resumen nuevo"); await page.locator("#ld-objective-e2").click(); await page.waitForTimeout(800);
      let o = await page.evaluate(() => JSON.parse(localStorage.getItem("estudio-viral:storyOutlines"))[0]);
      ok(o.acts[0].sequences[0].scenes[1].summary === "Resumen nuevo", "editar una escena larga la guarda");
      await page.locator("#ld-e3").focus(); await page.keyboard.press("Alt+ArrowUp"); await page.waitForTimeout(800);
      o = await page.evaluate(() => JSON.parse(localStorage.getItem("estudio-viral:storyOutlines"))[0]);
      ok(o.acts[0].sequences[0].scenes.map(s => s.id).join() === "e1,e3,e2" && (o.history || []).length === 1, "Alt+↑ mueve la escena en su secuencia y guarda una versión");
      await page.locator("#ld-e3").focus(); await page.keyboard.press("Alt+ArrowUp"); await page.waitForTimeout(600);
      o = await page.evaluate(() => JSON.parse(localStorage.getItem("estudio-viral:storyOutlines"))[0]);
      ok(o.acts[0].sequences[0].scenes[0].id === "e1" && /bloquead|Desbloquea/i.test(await page.locator(".sd-save").innerText()), "no atraviesa una escena bloqueada y lo explica");
      await page.locator("#ld-e1").click(); await page.waitForTimeout(200);
      ok(await page.locator("#ld-heading-e1").count() === 0, "una escena bloqueada es de solo lectura en el inspector");
      await page.locator("#ld-e3").click(); await page.getByRole("button", { name: /Abrir tomas/ }).click(); await page.waitForTimeout(600);
      ok(await page.getByRole("tab", { name: "Tomas y storyboard", selected: true }).count() === 1, "«Abrir tomas» lleva a Tomas y storyboard con esa escena");
      await ctx.close(); }

    // 9. Integridad de los directores: dos ediciones en el mismo instante no se pisan, y deshacer un detalle
    //    no borra el guion guardado después por el editor de guion.
    { const { ctx, page } = await abrir(b, () => {
        const S = (k, v) => localStorage.setItem("estudio-viral:" + k, JSON.stringify(v));
        const esc = (id, h) => ({ id, heading: h, summary: "original", objective: "obj original", obstacle: "b", consequence: "c", tension: 5, minutes: 2 });
        S("series", [{ id: "s1", title: "Serie Integridad", description: "x", format: "largo", style: "epica" }]);
        S("storyOutlines", [{ id: "o1", seriesId: "s1", structure: 3, targetMinutes: 20, acts: [{ id: "a1", title: "Acto I", goal: "", sequences: [{ id: "q1", title: "Sec", goal: "", scenes: [esc("e1", "EXT. RÍO"), esc("e2", "INT. CASA")] }] }] }]);
        S("episodes", [{ id: "ep1", seriesId: "s9", title: "Ep corto", status: "Guion", createdAt: new Date().toISOString(), versions: [],
          output: { title: "Ep corto", mode: "llm", cast: [{ name: "A" }, { name: "B" }], seriesBible: { style: "frutinovela" }, scenes: [1, 2].map(n => ({ n, title: "T" + n, speaker: "A", line: "L" + n, emotion: "calma", imagePromptFlow: "x" })), guionJson: { clips: [[["A", "L1"]], [["A", "L2"]]] } } }]);
        S("series", [{ id: "s1", title: "Serie Integridad", description: "x", format: "largo", style: "epica" }, { id: "s9", title: "Serie Corta", description: "y" }]);
      });
      await ir(page, "Creative Studio", "Generador");
      const serie = page.getByRole("button", { name: /Serie Integridad/ }).first(); if (await serie.count()) { await serie.click(); await page.waitForTimeout(700); }
      const mesa = page.getByRole("button", { name: /Mesa de dirección/ }).first(); if (await mesa.count() && (await mesa.getAttribute("aria-expanded")) === "false") { await mesa.click(); await page.waitForTimeout(600); }
      await page.locator("#ld-e1").click(); await page.waitForTimeout(200);
      // Dos ediciones disparadas en el mismo instante (antes de que React repinte).
      await page.evaluate(() => {
        const a = document.getElementById("ld-summary-e1"), c = document.getElementById("ld-objective-e1");
        a.value = "resumen rápido"; c.value = "objetivo rápido";
        a.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); c.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
      });
      await page.waitForTimeout(1200);
      let o = await page.evaluate(() => JSON.parse(localStorage.getItem("estudio-viral:storyOutlines"))[0]);
      let sc = o.acts[0].sequences[0].scenes[0];
      ok(sc.summary === "resumen rápido" && sc.objective === "objetivo rápido", "dos ediciones simultáneas del director largo se guardan las dos");
      // Editar un detalle → escribir el guion en el editor de guion → deshacer el detalle.
      await page.locator("#ld-consequence-e1").fill("consecuencia editada"); await page.locator("#ld-summary-e1").click(); await page.waitForTimeout(700);
      await page.getByRole("tab", { name: "Guion" }).click(); await page.waitForTimeout(200);
      await page.getByRole("button", { name: "+ Línea" }).click();
      await page.getByLabel("Contenido de la línea 1").fill("Daniel se arrodilla.");
      await page.getByRole("button", { name: "Guardar cambios" }).click(); await page.waitForTimeout(800);
      await page.getByRole("button", { name: "Deshacer" }).click(); await page.waitForTimeout(900);
      o = await page.evaluate(() => JSON.parse(localStorage.getItem("estudio-viral:storyOutlines"))[0]);
      sc = o.acts[0].sequences[0].scenes[0];
      ok(sc.consequence === "c", "deshacer revierte el detalle editado en el director");
      ok(sc.script?.[0]?.text === "Daniel se arrodilla." && sc.summary === "resumen rápido", "deshacer no borra el guion guardado después ni otros cambios");
      // Director corto: dos ediciones simultáneas.
      await page.reload(); await page.waitForTimeout(1200);
      await ir(page, "Creative Studio", "Generador");
      await page.getByRole("button", { name: /Abrir episodio/ }).first().click(); await page.waitForTimeout(1200);
      if (await page.locator("#sd-line-1").count()) {
        await page.evaluate(() => {
          const a = document.getElementById("sd-line-1"), c = document.getElementById("sd-emotion-1");
          a.value = "frase rápida"; c.value = "emoción rápida";
          a.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); c.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
        });
        await page.waitForTimeout(1500);
        const ep = await page.evaluate(() => JSON.parse(localStorage.getItem("estudio-viral:episodes")).find(e => e.id === "ep1"));
        ok(ep.output.scenes[0].line === "frase rápida" && ep.output.scenes[0].emotion === "emoción rápida", "dos ediciones simultáneas del director corto se guardan las dos");
      } else ok(false, "no se abrió el episodio corto");
      await ctx.close(); }

    // 10. Panel de Tomas: plano e iluminación de una toma editados en el mismo instante se guardan los dos.
    { const { ctx, page } = await abrir(b, () => {
        const S = (k, v) => localStorage.setItem("estudio-viral:" + k, JSON.stringify(v));
        const toma = { id: "t1", personajes: [], accion: "a", plano: "general", lente: "", movimiento: "", composicion: "", luz: "día", vfx: "", expresion: "", sonido: "", musica: "", duracion: 5, frameInicial: "", frameFinal: "", transicion: "corte", estado: "pendiente" };
        S("series", [{ id: "s1", title: "Serie Tomas", description: "x", format: "largo", style: "epica" }]);
        S("storyOutlines", [{ id: "o1", seriesId: "s1", structure: 3, targetMinutes: 20, acts: [{ id: "a1", title: "Acto I", goal: "", sequences: [{ id: "q1", title: "Sec", goal: "", scenes: [{ id: "e1", heading: "EXT. RÍO", summary: "x", objective: "", obstacle: "", consequence: "", tension: 5, minutes: 2, tomas: [toma] }] }] }] }]);
      });
      await ir(page, "Creative Studio", "Generador");
      const serie = page.getByRole("button", { name: /Serie Tomas/ }).first(); if (await serie.count()) { await serie.click(); await page.waitForTimeout(700); }
      const mesa = page.getByRole("button", { name: /Mesa de dirección/ }).first(); if (await mesa.count() && (await mesa.getAttribute("aria-expanded")) === "false") { await mesa.click(); await page.waitForTimeout(600); }
      await page.getByRole("tab", { name: "Tomas y storyboard" }).click(); await page.waitForTimeout(500);
      await page.getByRole("button", { name: "Editar" }).first().click(); await page.waitForTimeout(400);
      const hecho = await page.evaluate(() => {
        const campo = texto => Array.from(document.querySelectorAll("label")).find(l => l.firstChild?.textContent?.trim() === texto)?.querySelector("textarea");
        const plano = campo("Plano"), luz = campo("Iluminación");
        if (!plano || !luz) return false;
        plano.value = "primer plano"; luz.value = "atardecer";
        plano.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); luz.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
        return true;
      });
      await page.waitForTimeout(1200);
      const o = await page.evaluate(() => JSON.parse(localStorage.getItem("estudio-viral:storyOutlines"))[0]);
      const t = o.acts[0].sequences[0].scenes[0].tomas[0];
      ok(hecho && t.plano === "primer plano" && t.luz === "atardecer", "Tomas: plano y luz editados a la vez se guardan los dos");
      await ctx.close(); }

    // 11. Canal de la serie: conectar una cuenta nueva sin salir de la creación (con y sin cuentas previas).
    { const { ctx, page } = await abrir(b);
      await ir(page, "Creative Studio", "Generador");
      await page.getByRole("button", { name: /Crear$/ }).first().click(); await page.waitForTimeout(900);
      const canal = page.getByLabel("Canal de la serie");
      await canal.selectOption({ label: "＋ Conectar una cuenta nueva…" }); await page.waitForTimeout(300);
      await page.locator("#nueva-cuenta-red").selectOption("YouTube");
      await page.locator("#nueva-cuenta-nombre").fill("Canal E2E YouTube");
      await page.getByRole("button", { name: "Conectar y usar esta cuenta" }).click(); await page.waitForTimeout(800);
      const cuentas = await page.evaluate(() => JSON.parse(localStorage.getItem("estudio-viral:accounts") || "[]"));
      const nueva = cuentas.find(a => a.name === "Canal E2E YouTube");
      ok(!!nueva && nueva.platform === "YouTube", "se registra la cuenta nueva desde el canal de la serie");
      ok((await page.getByLabel("Canal de la serie").inputValue()) === nueva?.id, "la cuenta nueva queda elegida como canal");
      ok(await page.getByRole("button", { name: /Largo · 16:9/ }).isEnabled(), "con YouTube se puede elegir el formato largo");
      await ctx.close(); }
    { const { ctx, page } = await abrir(b, () => { localStorage.setItem("estudio-viral:accounts", "[]"); });
      await ir(page, "Creative Studio", "Generador");
      await page.getByRole("button", { name: /Crear$/ }).first().click(); await page.waitForTimeout(900);
      ok(await page.locator("#nueva-cuenta-nombre").count() === 1, "sin cuentas, el formulario de cuenta nueva aparece directamente");
      await page.locator("#nueva-cuenta-nombre").fill("Primera cuenta"); await page.locator("#nueva-cuenta-nombre").press("Enter"); await page.waitForTimeout(800);
      ok((await page.getByLabel("Canal de la serie").count()) === 1 && (await page.evaluate(() => JSON.parse(localStorage.getItem("estudio-viral:accounts")).length)) === 1, "Intro guarda la primera cuenta y vuelve al selector");
      await ctx.close(); }
  } finally {
    await b.close();
    if (srv) try { process.kill(-srv.pid); } catch {}
  }
  if (fallos) { console.log(`${fallos} prueba(s) fallaron`); process.exit(1); }
  console.log("Todas las pruebas de integración pasaron.");
})().catch(e => { console.error(e); process.exit(1); });
