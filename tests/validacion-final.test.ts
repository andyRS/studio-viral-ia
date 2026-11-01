// Validación final antes de generar: texto frente a la fuente, duraciones reales, identidad visual y apariciones. npm test
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { importarFiel, redirigirEpisodio, validarImportacion, vistaPreviaRevision } from "../src/lib/importacion";
import { clasificarFrase, fuenteDeTexto, fuenteSugerida, type Fuente } from "../src/lib/fuentes";

let checks = 0;
const ok = (c: boolean, m: string) => { assert.ok(c, m); checks++; console.log(`ok · ${m}`); };
const capTxt = readFileSync("tests/fixtures/daniel_ep01_capitulo.json", "utf8");
const pjTxt = readFileSync("tests/fixtures/daniel_ep01_personajes.json", "utf8");
const orig = JSON.parse(capTxt);
const fuente: Fuente = JSON.parse(readFileSync("src/data/fuentes/daniel-10-rv1909.json", "utf8"));
const imp: any = importarFiel({ capitulo: capTxt, personajes: pjTxt, formato: "largo" });

// Episodio guardado como estaba antes de esta revisión: tomas a 8 s en los datos, prompts a 5 s, montaje 90 s.
const guardado = JSON.parse(JSON.stringify({ ...imp.episode, duration: 160, editDuration: 90, scenes: imp.episode.scenes.map((s: any) => ({ ...s, durationSec: 8 })) }));
const maestros = imp.characters.map((c: any, i: number) => ({ ...c, id: `c${i}`, referenceApprovedAt: i < 2 ? "2026-11-01" : undefined }));
const antes = JSON.stringify(guardado);
const rev = redirigirEpisodio(guardado, maestros, "epica", "16:9", { fuente });
const F = rev.filas, P = rev.propuesta.scenes;

// --- 1. Duración ---
ok(validarImportacion({ episodio: guardado, cast: imp.characters, modo: "fidelidad", aspecto: "16:9" }).some(p => p.codigo === "duracion-toma"), "1 · se detecta la discrepancia: tomas de 8 s en los datos y prompts que piden 5 s");
ok(rev.duraciones.tomas.actual === 100 && P.every((s: any) => s.durationSec === 5) && rev.propuesta.duration === 100, "1 · fuente real: 20 tomas de 5 s = 100 s (lo que piden los prompts)");
ok(rev.duraciones.desglose.tarjetas === 3.9 && rev.duraciones.desglose.cierre === 3 && rev.duraciones.montajeActual === 80 && rev.duraciones.montaje === 82 && rev.propuesta.editDuration === 80, "1 · montaje estimado ~80 s (clips recortados a la voz + 3 tarjetas + cierre); ~82 s con la propuesta");
ok(rev.duraciones.noCaben.map(f => f.n).join() === "19" && rev.duraciones.alLimite.map(f => f.n).join() === "1,11,18", "1 · la 19 no cabe en 5 s; la 1, 11 y 18 van al límite");
ok(JSON.stringify(guardado) === antes, "1 · calcular la revisión no modifica el episodio guardado");

// --- 2. Clasificación del texto ---
const clase = (n: number) => F[n - 1].texto!.clase;
ok(F.every(f => f.texto), "2 · las 20 frases se clasifican frente a Daniel 10 (Reina-Valera 1909)");
ok([5, 10, 12, 13, 20].every(n => clase(n) === "dramatizacion"), "2 · príncipes y Miguel: dramatización (el texto no les atribuye palabras)");
ok(clase(4) === "dramatizacion" && clase(9) === "dramatizacion" && ["parafrasis", "inspirada", "cita"].includes(clase(18)) && clase(19) === "parafrasis", "2 · no todas las frases del mensajero son citas: 4 y 9 son de la obra; 18 y 19 parafrasean");
ok(F[18].texto!.refs.join() === "Daniel 10:13,Daniel 10:20" && F[17].texto!.refs.includes("Daniel 10:12"), "2 · las paráfrasis llevan sus referencias (19 → 10:13 y 10:20; 18 → 10:12)");
ok([3, 6, 8, 11].every(n => clase(n) === "narracion-apoyada") && clase(1) === "narracion-propia", "2 · narraciones apoyadas en el texto frente a narración propia de la obra");
ok(clasificarFrase("No temas, porque desde el primer día que diste tu corazón a entender fueron oídas tus palabras", fuente).clase === "cita", "2 · una frase casi literal se reconoce como cita");
ok(/Texto: Dramatización/.test(F[4].despues.fidelityNote) && !/Frase de .* dramatizada/.test(F[4].despues.fidelityNote), "2 · la nota de fidelidad usa la clasificación (no la marca genérica)");
// Reutilizable: una fuente documental cualquiera, en texto.
const doc = fuenteDeTexto("Acta 1:1 El cabildo abierto se reunió el 25 de mayo para deliberar sobre el virrey.\n2 Los vecinos exigieron la formación de una junta propia.", "Acta del cabildo")!;
ok(doc.pasajes.length === 2 && doc.pasajes[1].ref === "Acta 1:2" && clasificarFrase("Los vecinos exigieron formar una junta propia.", doc).clase === "parafrasis" && clasificarFrase("¡Viva la libertad, hermanos!", doc).clase === "dramatizacion", "2 · sirve para otros proyectos documentales (fuente en texto)");
ok(fuenteSugerida(["Daniel 10:1-4, 10:8-19"])?.version === "Reina-Valera 1909" && fuenteSugerida(["Génesis 3"]) === null, "2 · la fuente incluida se sugiere solo cuando las fichas la citan");

// --- 3. Apariciones ---
const ve = (n: number): string[] => P[n - 1].visibleCharacters;
ok(ve(3).join() === "Daniel", "3 · Daniel se conserva en la escena 3");
ok(ve(12).includes("Miguel") && ve(12).includes("Mensajero Celestial"), "3 · escena 12: Miguel y el mensajero");
ok(ve(15).includes("Daniel") && ve(15).includes("Varón vestido de lino"), "3 · escena 15: Daniel y el varón vestido de lino");
ok(ve(20).join() === "Príncipe de Grecia" && !/Mensajero Celestial/.test(P[19].imagePromptFlow) && P.every((s: any, i: number) => i === 19 || !ve(i + 1).includes("Príncipe de Grecia")), "3 · escena 20: el príncipe de Grecia solo, sin el mensajero en el encuadre");

// --- 4. Continuidad de identidad ---
const codigos = (sc: any[]) => sc.map(s => (String(s.imagePromptFlow).match(/\[P\d\d\]/g) || []).join("")).join("|");
ok(codigos(P) .length > 0 && maestros.every((m: any, k: number) => P.filter((s: any) => ve(s.n).includes(m.name)).every((s: any) => s.imagePromptFlow.includes(`${m.name} [P0${k + 1}]`))), "4 · cada personaje conserva su código de ficha [P0x]");
ok(P.every((s: any) => ve(s.n).every((n: string) => { const m = maestros.find((x: any) => x.name === n); return s.imagePromptFlow.includes(`${m.visualEN || m.visualES}; outfit: ${m.clothing}`); })), "4 · los prompts usan exactamente la descripción y el vestuario de las fichas maestras");
ok(JSON.stringify(rev.propuesta.cast.map((c: any) => [c.name, c.visualES, c.clothing, c.flowPrompt])) === JSON.stringify(guardado.cast.map((c: any) => [c.name, c.visualES, c.clothing, c.flowPrompt])), "4 · la revisión no regenera ni altera fichas ni prompts de ficha");
const alterado = { ...rev.propuesta, scenes: P.map((s: any, i: number) => i === 10 ? { ...s, imagePromptFlow: s.imagePromptFlow.replace("ojos ámbar", "ojos azules") } : s) };
ok(validarImportacion({ episodio: alterado, cast: maestros, modo: "fidelidad", aspecto: "16:9" }).some(p => p.codigo === "ficha-distinta" && p.escena === 11), "4 · si un prompt cambia un rasgo de la ficha, el validador lo detecta");
ok(rev.validacion.filter(p => p.codigo === "ficha-sin-aprobar").length === 4, "4 · se avisa de las fichas maestras sin aprobar antes de generar");

// --- 5. Validación final ---
ok(rev.validacion.filter(p => p.nivel === "error").length === 0 && P.every((s: any, i: number) => s.line === orig.clips[i][0][1]), "5 · sin errores y con los 20 diálogos originales");
const md = vistaPreviaRevision("Daniel", F, rev.duraciones, rev.validacion, "Daniel 10 · Reina-Valera 1909");
ok(/## Duración/.test(md) && /## Clasificación del texto/.test(md) && /## Avisos pendientes/.test(md) && (md.match(/## Escena \d+/g) || []).length === 20, "5 · la vista previa reúne duración, clasificación, avisos y las 20 escenas");

console.log(`${checks} comprobaciones de la validación final correctas.`);
