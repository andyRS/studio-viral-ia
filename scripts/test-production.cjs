// Pruebas del elenco de frutas y la producción. Uso:
//   node scripts/test-production.cjs          -> solo pruebas locales (sin IA)
//   node scripts/test-production.cjs --live   -> también con la IA real (.env.local)
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => {
  const out = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename }).outputText;
  module._compile(out, filename);
};
const live = process.argv.includes("--live");
if (live) for (const l of fs.readFileSync(path.join(__dirname, "../.env.local"), "utf8").split(/\r?\n/)) { const i = l.indexOf("="); if (i > 0 && !process.env[l.slice(0, i)]) process.env[l.slice(0, i)] = l.slice(i + 1); }
else delete process.env.LLM_API_KEY;

const { templateSeries, generateSeries, generateNextEpisode } = require("../src/lib/story.ts");
const { normalizeCast } = require("../src/lib/cast.ts");
const GENERIC = /^(protagonista|antagonista|personaje)/i;
const FORBIDDEN = /\b(santos?|virgen|vírgen|altar(es)?|velas? votivas?|rosarios?)\b/i;
const GUARD = "sin imágenes de santos ni de la Virgen, sin altares";

function checkFruitEpisode(r, label, fruitsExpected = []) {
  assert.ok(r.characters.length >= 3 && r.characters.length <= 6, `${label}: elenco de 3 a 6 (${r.characters.length})`);
  for (const c of r.characters) {
    assert.ok(c.fruit && c.fruitEmoji && c.headES, `${label}: ${c.name} sin fruta/emoji/cabeza`);
    assert.ok(!GENERIC.test(c.name), `${label}: nombre genérico ${c.name}`);
    assert.match(c.subtitleColor, /^#[0-9A-F]{6}$/);
    assert.match(c.flowPrompt, /Personaje 3D cinematográfico realista.*rostro y cuerpo humanos.*piel de .*Nunca una fruta entera como cabeza/s, `${label}: flowPrompt de ${c.name}`);
    assert.doesNotMatch(c.flowPrompt + c.visualES, /nunca cara humana|cabeza (es )?entera de/i, `${label}: ${c.name} conserva la regla antigua`);
  }
  assert.equal(new Set(r.characters.map(c => c.subtitleColor)).size, r.characters.length, `${label}: colores repetidos`);
  for (const f of fruitsExpected) assert.ok(r.characters.some(c => c.fruit.includes(f)), `${label}: falta ${f} (${r.characters.map(c => c.fruit)})`);
  const s = r.episode.scenes;
  assert.ok(s.length >= 8 && s.length <= 16, `${label}: ${s.length} escenas`);
  for (const sc of s) {
    // Seedance solo en el prompt de Dola; las escenas son para Pavo IA / Flow.
    assert.doesNotMatch(sc.animationPrompt, /Seedance/, `${label}: escena ${sc.n} menciona Seedance`);
    assert.match(sc.animationPrompt, /primer fotograma/, `${label}: escena ${sc.n} sin "primer fotograma"`);
    assert.match(sc.animationPrompt, /PRONUNCIACIÓN OBLIGATORIA/, `${label}: escena ${sc.n} sin PRONUNCIACIÓN`);
    assert.match(sc.animationPrompt, /nunca una fruta entera como cabeza/);
    assert.match(sc.animationPrompt, /ESTILO FIJO: .*Nunca acción real, nunca fotorrealista/, `${label}: escena ${sc.n} sin bloqueo de estilo`);
    assert.doesNotMatch(sc.animationPrompt, /\brealistas?\b/i, `${label}: escena ${sc.n} pide realismo en el vídeo`);
    assert.ok(sc.imagePromptFlow && sc.line, `${label}: escena ${sc.n} incompleta`);
    assert.doesNotMatch(sc.line, /\b(pa|vamo|ta|e)'/, `${label}: contracción en "${sc.line}"`);
  }
  assert.equal(r.episode.guionJson.clips.length, s.length, `${label}: un clip por escena`);
  assert.equal(r.episode.guionJson.gancho.length, 2);
  assert.equal(r.episode.platformAdaptations.length, 4);
  assert.match(r.episode.dolaPrompt, /^Usa Seedance 2\.5\./, `${label}: Dola sin Seedance`);
  assert.ok(r.episode.cover && r.episode.cover.lines.length === 2 && /^PARTE \d+$/.test(r.episode.cover.part), `${label}: portada`);
  assert.ok(r.episode.platformAdaptations.every(p => p.title && p.description && p.bestTime && p.cta && p.pinnedComment), `${label}: publicación incompleta`);
  for (const name of new Set(s.map(x => x.speaker))) assert.ok(r.episode.guionJson.colores[name], `${label}: sin color para ${name}`);
}
function checkChristian(r, label) {
  for (const sc of r.episode.scenes) {
    assert.doesNotMatch(`${sc.setting} ${sc.line}`, FORBIDDEN, `${label}: escena ${sc.n} menciona algo prohibido`);
    assert.doesNotMatch(sc.animationPrompt.replace(GUARD, "").replace(/sin imágenes de santos ni de la virgen, sin altares/i, ""), FORBIDDEN, `${label}: prompt ${sc.n} prohibido`);
    assert.ok(sc.animationPrompt.toLowerCase().includes(GUARD.toLowerCase()), `${label}: escena ${sc.n} sin la prohibición explícita`);
  }
  assert.match(r.episode.scenes.at(-1).line, /escribe am[eé]n/i, `${label}: el final no pide "Escribe AMÉN"`);
}

(async () => {
  const motor = "Un motoconchista se enamora de una muchacha rica de Piantini y el papá no lo acepta";
  const dulces = "Una hija niega a su madre que vende dulces frente al colegio";

  // Sin IA: la plantilla también da elenco de frutas.
  const t1 = templateSeries({ idea: motor, style: "frutinovela", duration: 90 });
  checkFruitEpisode(t1, "plantilla frutinovela", ["plátano", "coco"]);
  const t2 = templateSeries({ idea: dulces, style: "cristiana", duration: 90 });
  checkFruitEpisode(t2, "plantilla cristiana", ["aguacate"]);
  checkChristian(t2, "plantilla cristiana");
  const t3 = templateSeries({ idea: "Una cantante reconoce al hombre que la dejó en el altar", style: "cine90", duration: 90 });
  assert.ok(t3.characters.every(c => !c.fruit), "cine90 sin frutas");
  assert.ok(t3.episode.scenes[0].imagePromptFlow.startsWith("Cinematic 1990s"), "cine90: imagen en inglés");
  // Lote para Flow: instrucción + fichas [P01..] + escenas [001..], con identificadores de 5 caracteres.
  const { buildFlowBatch } = require("../src/lib/production.ts");
  const lote = buildFlowBatch(t1.episode);
  // Fase 2: el lote asume las fichas ya aprobadas (Fase 1) y solo trae las escenas; las fichas van aparte.
  assert.ok(lote.full.startsWith("Adjunta en Flow las fichas maestras"), "lote sin instrucción");
  assert.equal(lote.count.fichas, t1.characters.length);
  assert.equal(lote.count.escenas, t1.episode.scenes.length);
  assert.ok(lote.fichas.includes("[P01]\n") && lote.full.includes("[001]\n") && !lote.full.includes("[P01]\n"), "identificadores en su propia línea; fichas aparte");
  // Referencias fuera del prompt: ningún prompt individual lleva identificadores.
  assert.ok(t1.episode.scenes.every(s => !/^\[/.test(s.imagePromptFlow) && !/\[(P\d\d|\d{3})\]/.test(s.animationPrompt)), "IDs dentro del prompt");
  // Ficha de escena y de episodio.
  const sc = t1.episode.scenes;
  assert.equal(sc[0].title, "Gancho"); assert.equal(sc.at(-1).title, "Resolución");
  assert.ok(sc.every(s => s.goal && s.shot && s.sfx && s.music && s.transition && s.nextLink && Array.isArray(s.references)), "ficha de escena incompleta");
  assert.ok(t1.episode.ficha.synopsis && t1.episode.ficha.hookText, "ficha de episodio");
  assert.equal(t1.episode.social.hooks.length >= 1, true); assert.ok(t1.episode.social.question && t1.episode.social.coverIdea, "paquete redes");
  const shots = t1.episode.scenes.map(s => s.imagePromptFlow.match(/Encuadre: ([^.]+)/)[1]);
  assert.ok(shots.every((s, i) => i === 0 || s !== shots[i - 1]), "encuadre repetido en escenas seguidas");
  assert.match(t1.episode.scenes[0].animationPrompt, /0–2 s: .*2–5 s: .*5–8 s: /s, "microescenas");
  // Reparación en el código: nombres genéricos -> fruta por rol.
  const fixed = normalizeCast([{ name: "Protagonista", role: "motoconchista humilde" }, { name: "Antagonista", role: "papá rico" }], "frutinovela");
  assert.deepEqual(fixed.map(c => c.fruit), ["plátano", "coco"]);
  assert.ok(fixed.every(c => !GENERIC.test(c.name)), fixed.map(c => c.name).join());
  console.log("OK pruebas locales:", t1.characters.map(c => `${c.fruitEmoji} ${c.name}`).join(", "), "·", t1.episode.scenes.length, "escenas");

  if (!live) return;
  const report = (r, t0) => `${((Date.now() - t0) / 1000).toFixed(1)} s · modo ${r.mode}${r.notice ? " · AVISO: " + r.notice : ""}`;
  let t0 = Date.now();
  const g1 = await generateSeries({ idea: motor, style: "frutinovela", duration: 90 });
  console.log("IA frutinovela:", report(g1, t0)); console.log("  elenco:", g1.characters.map(c => `${c.fruitEmoji} ${c.name} (${c.fruit}, ${c.role})`).join(" | "));
  checkFruitEpisode(g1, "IA frutinovela", ["plátano", "coco"]);
  console.log("  escena 1:", g1.episode.scenes[0].speaker, "→", g1.episode.scenes[0].line);
  console.log("  ficha IA:", JSON.stringify({ conflicto: g1.episode.ficha.conflict, climax: g1.episode.ficha.climax }).slice(0, 220));
  console.log("  escena 1 IA:", JSON.stringify({ t: g1.episode.scenes[0].title, sfx: g1.episode.scenes[0].sfx, musica: g1.episode.scenes[0].music }));
  console.log("  redes IA:", JSON.stringify(g1.episode.social).slice(0, 260));
  console.log("  portada IA:", JSON.stringify(g1.episode.cover));
  console.log("  autoevaluación IA:", JSON.stringify(g1.episode.selfScore));
  console.log("  Facebook IA:", JSON.stringify((({ title, hashtags, bestTime, pinnedComment }) => ({ title, hashtags, bestTime, pinnedComment }))(g1.episode.platformAdaptations.find(p => p.platform === "Facebook"))));
  t0 = Date.now();
  const g2 = await generateSeries({ idea: dulces, style: "cristiana", duration: 90 });
  console.log("IA cristiana:", report(g2, t0)); console.log("  elenco:", g2.characters.map(c => `${c.fruitEmoji} ${c.name} (${c.fruit})`).join(" | "));
  checkFruitEpisode(g2, "IA cristiana"); checkChristian(g2, "IA cristiana");
  console.log("  final:", g2.episode.scenes.at(-1).line);
  t0 = Date.now();
  const n = await generateNextEpisode({ style: "frutinovela", duration: 90, partNumber: 2, series: { title: g1.series.title }, characters: g1.characters, history: [{ part: 1, summary: g1.episode.summary }], wish: "El papá descubre que su hija se ve a escondidas con el motoconchista" });
  console.log("IA continuación:", report(n, t0));
  const castNow = [...g1.characters];
  for (const c of g1.characters) {
    const used = n.episode.cast.find(x => x.name === c.name);
    assert.ok(used && used.fruit === c.fruit && used.clothing === c.clothing, `continuación cambió a ${c.name}`);
  }
  assert.ok(n.episode.scenes.length >= 8);
  console.log("  mismos personajes, misma fruta y ropa ✓ · nuevos:", (n.newCharacters || []).map(c => `${c.fruitEmoji} ${c.name}`).join(", ") || "ninguno");
  console.log("OK pruebas con IA");
})().catch(e => { console.error("FALLO:", e.message); process.exit(1); });
