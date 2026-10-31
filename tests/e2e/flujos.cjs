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
  } finally {
    await b.close();
    if (srv) try { process.kill(-srv.pid); } catch {}
  }
  if (fallos) { console.log(`${fallos} prueba(s) fallaron`); process.exit(1); }
  console.log("Todas las pruebas de integración pasaron.");
})().catch(e => { console.error(e); process.exit(1); });
