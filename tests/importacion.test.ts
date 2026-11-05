// Importación cinematográfica de un capítulo externo (caso real: Daniel EP01). npm test
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { asignarPresencia, cambiosDeAdaptacion, elencoDesdeBiblioteca, importarFiel, normalizarCapitulo, normalizarPersonajes, validarImportacion } from "../src/lib/importacion";
import { buildProduction, NARRATOR } from "../src/lib/production";
import { normalizeCast } from "../src/lib/cast";

let checks = 0;
const ok = (c: boolean, m: string) => { assert.ok(c, m); checks++; console.log(`ok · ${m}`); };
const capituloTxt = readFileSync("tests/fixtures/daniel_ep01_capitulo.json", "utf8");
const personajesTxt = readFileSync("tests/fixtures/daniel_ep01_personajes.json", "utf8");
const original = JSON.parse(capituloTxt);

// --- Trazabilidad de la causa (código anterior): 20 clips → 21 escenas por el cierre del Narrador añadido. ---
{
  const cast = normalizeCast(["Daniel", "Mensajero Celestial", "Príncipe de Persia", "Miguel", "Príncipe de Grecia"].map(name => ({ name })), "epica");
  const raw = { scenes: original.clips.map((c: any) => ({ speaker: c[0][0], line: c[0][1] })) };
  const con21 = buildProduction(raw, { style: "epica", duration: 96, scenes: 21, characters: cast, idea: "Daniel" });
  ok(con21.scenes.length === 21 && con21.scenes[20].speaker === NARRATOR && con21.editDuration === 95 && /restaurar/.test(con21.scenes[20].line), "causa confirmada: el cierre del Narrador forzado en estilos bíblicos crea la escena 21 (95 s)");
  const con20 = buildProduction(raw, { style: "epica", duration: 88, scenes: 20, characters: cast, idea: "Daniel" });
  const perdidas = original.clips.filter((c: any) => !con20.scenes.some(s => s.line === c[0][1]));
  ok(con20.scenes.length === 20 && con20.scenes[19].speaker === NARRATOR && perdidas.length === 1, "causa confirmada: con 20 escenas se perdía un clip original para dejar la conclusión inventada");
  const sinMeta = normalizarCapitulo(JSON.stringify({ clips: original.clips }))!;
  const conMeta = normalizarCapitulo(capituloTxt)!;
  ok(sinMeta.clips.length === 20 && conMeta.clips.length === 20, "gancho, tarjetas y cierre no crean escenas (20 con y sin metadatos)");
}

const r: any = importarFiel({ capitulo: capituloTxt, personajes: personajesTxt, formato: "largo" });
const escenas: any[] = r.episode.scenes;
const vis = (n: number) => escenas[n - 1].visibleCharacters as string[];

// 1. Se reconocen los 20 clips originales.
ok(normalizarCapitulo(capituloTxt)!.clips.length === 20 && r.episode.adaptacion.original === 20, "1 · se reconocen los 20 clips originales");
// 2. La cantidad final coincide con la configuración (por defecto: las del guion; y si se pide otra, se respeta y se explica).
ok(escenas.length === 20 && r.episode.duration === 160 && escenas.every(x => x.durationSec === 8 && /8 seconds/.test(x.animationPrompt)) && r.episode.editDuration >= 80 && r.episode.editDuration <= 95, "2 · 20 escenas, tomas de 8 s por defecto como piden los prompts (160 s) y ~82 s de montaje estimado");
const menos: any = importarFiel({ capitulo: capituloTxt, personajes: personajesTxt, formato: "largo", scenes: 16 });
ok(menos.episode.scenes.length === 16 && menos.episode.adaptacion.avisos.some((a: string) => /pide 16 escenas/.test(a)) && menos.episode.scenes[15].line === "Mi tiempo se acerca.", "2b · si la configuración pide 16, se respeta, se conserva el cierre y se explica qué clips salen");
const mas: any = importarFiel({ capitulo: capituloTxt, personajes: personajesTxt, formato: "largo", scenes: 28 });
ok(mas.episode.scenes.length === 20 && mas.episode.adaptacion.avisos.some((a: string) => /no se inventan escenas/.test(a)), "2c · si pide 28, en fidelidad no se inventan escenas y se explica");
// 3. Seis personajes visuales canónicos.
ok(r.characters.length === 6 && ["Daniel", "Mensajero Celestial", "Príncipe de Persia", "Miguel", "Príncipe de Grecia", "Varón vestido de lino"].every(n => r.characters.some((c: any) => c.name === n)), "3 · se importan los seis personajes visuales canónicos");
ok(r.characters.every((c: any) => !/dominicana|90/.test(c.visualES)) && /barba larga gris plata/.test(r.characters.find((c: any) => c.name === "Daniel").visualES), "3b · las fichas usan la descripción maestra (no el relleno genérico)");
// 4. Narrador: solo voz en off.
ok(!r.characters.some((c: any) => /narrador/i.test(c.name)) && escenas.every(s => !(s.visibleCharacters || []).some((n: string) => /narrador/i.test(n))), "4 · el Narrador no tiene ficha ni aparece en cuadro");
ok(escenas.filter(s => s.speaker === NARRATOR).every(s => /off-screen voice only|narrador dice en voz en off|Off-screen narrator/i.test(`${s.imagePromptFlow} ${s.animationPrompt}`) && !/Narrador \(/.test(s.imagePromptFlow)), "4b · los prompts tratan al Narrador como voz en off, sin rostro ni gestos");
// 5. Varón vestido de lino en la visión (clip 15), con Daniel.
ok(vis(15).includes("Varón vestido de lino") && vis(15).includes("Daniel") && /Varón vestido de lino \[P\d\d\]/.test(escenas[14].imagePromptFlow), "5 · el Varón vestido de lino aparece en la escena de la visión con su ficha");
ok(escenas.every((s, i) => i === 14 || !vis(i + 1).includes("Varón vestido de lino")), "5b · el Varón vestido de lino no aparece en otras escenas");
// 6. Príncipe de Grecia solo en la anticipación final (aunque se le nombra en el clip 19).
ok(escenas.every((s, i) => (i === 19) === vis(i + 1).includes("Príncipe de Grecia")), "6 · el príncipe de Grecia se reserva para la anticipación final");
// 7. Daniel en las escenas narradas donde corresponde visualmente.
ok([1, 8, 15].every(n => vis(n).includes("Daniel")) && vis(3).includes("Daniel"), "7 · Daniel aparece en las escenas narradas 1, 3 (continuidad), 8 y 15");
ok(r.episode.validacion.some((p: any) => /Escena 3: la narración no nombra a nadie/.test(p.mensaje)), "7b · la presencia inferida por continuidad queda señalada para revisión");
// 8. Diálogos originales intactos en modo fidelidad.
ok(escenas.every((s, i) => s.line === original.clips[i][0][1] && (s.speaker === original.clips[i][0][0] || (original.clips[i][0][0] === "Narrador" && s.speaker === NARRATOR))), "8 · los 20 diálogos y hablantes originales se conservan en orden");
ok(escenas[19].line === "Mi tiempo se acerca." && escenas[19].speaker === "Príncipe de Grecia", "8b · el capítulo termina con el príncipe de Grecia, sin conclusión añadida");
// 9. Los prompts usan las fichas visuales correspondientes.
ok(escenas.every(s => (s.visibleCharacters || []).every((n: string) => s.imagePromptFlow.includes(n))), "9 · cada prompt de imagen incluye las fichas de quienes están en cuadro");
const miguel = r.characters.find((c: any) => c.name === "Miguel");
ok(escenas.filter(s => vis(s.n).includes("Miguel")).every(s => s.imagePromptFlow.includes(miguel.visualES)), "9b · Miguel conserva la misma ficha visual en todo el episodio");
// 10. Formato 16:9.
ok(!/9:16/.test(JSON.stringify(r.episode)) && !/9:16/.test(JSON.stringify(r.characters)) && /16:9/.test(escenas[0].imagePromptFlow), "10 · producción larga: todo en 16:9");
// 11. Sin escenas extra por metadatos; tarjetas convertidas al índice del montaje.
ok(JSON.stringify(r.episode.guionJson.tarjetas.map((t: any) => t.antes)) === "[0,10,14,19]" && r.episode.guionJson.cierre === original.cierre && r.episode.guionJson.versiculo === original.versiculo, "11 · tarjetas (1→0), cierre y versículo originales se conservan sin crear escenas");
// 12. Dirección cinematográfica: acción y cámara.
ok(escenas.every(s => s.visualAction && s.videoAction && s.camera && s.shotType), "12 · todas las escenas tienen acción visual, acción de vídeo, plano y cámara");
const llegada = escenas[10];
ok(/se abren/.test(llegada.visualAction) && /Grúa/.test(llegada.camera) && /CAMERA: Grúa/.test(llegada.animationPrompt) && /ACTION: /.test(llegada.animationPrompt), "12b · la llegada de Miguel tiene revelación progresiva, grúa y efectos en el prompt de vídeo");
ok(new Set(escenas.map(s => s.visualAction)).size === escenas.length, "12c · ninguna escena repite la imagen de otra (los momentos repetidos varían de toma)");
ok(r.episode.validacion.filter((p: any) => p.nivel === "error").length === 0, "validador: sin errores en el caso de Daniel");

// --- Casos generales: personajes silenciosos, narradores, anticipación y apariciones incompletas. ---
{
  const cap = JSON.stringify({ clips: [[["Narradora", "Ana llegó al puerto al amanecer."]], [["Ana", "¿Dónde estás?"]], [["Narrador", "Nadie respondió."]], [["Luis", "Aquí estoy, Ana."]], [["Ana", "Algún día vendrá Marcos."]]] });
  const pjs = JSON.stringify({ personajes: [
    { nombre: "Ana", descripcion_maestra: "Mujer joven de pelo negro. Vestido azul." },
    { nombre: "Guardia", tipo: "personaje_visual_sin_dialogo", descripcion_maestra: "Soldado silencioso con casco.", participa_en_clips: [2] },
    { nombre: "Marcos", rol: "Aparece únicamente al final como anticipación.", descripcion_maestra: "Hombre de capa negra.", participa_en_clips: [9] },
    { nombre: "Voz", tipo: "voz_en_off", descripcion: "Voz sin cuerpo." },
  ] });
  const x: any = importarFiel({ capitulo: cap, personajes: pjs, style: "cine90", formato: "corto" });
  const v = (n: number) => x.episode.scenes[n - 1].visibleCharacters as string[];
  ok(v(1).includes("Ana") && v(2).includes("Guardia") && !x.characters.some((c: any) => c.name === "Voz"), "personaje silencioso asignado y voz en off sin ficha visual");
  ok(x.characters.some((c: any) => c.name === "Luis") && x.episode.adaptacion.avisos.some((a: string) => /Sin ficha canónica: Luis/.test(a)), "quien habla sin ficha se añade con ficha genérica y se avisa (nunca se cambia por otro)");
  ok(!x.episode.scenes.some((s: any) => (s.visibleCharacters || []).includes("Marcos")) && x.episode.validacion.some((p: any) => /Marcos es un personaje canónico visual sin ninguna aparición/.test(p.mensaje)), "personaje de anticipación nombrado en un diálogo no entra en cuadro y se avisa si no tiene aparición");
  ok(/vertical 9:16/.test(x.episode.scenes[0].imagePromptFlow), "una serie corta conserva 9:16");
  const lib = normalizarPersonajes(pjs)!;
  ok(lib.narradores.includes("Voz") && lib.personajes.find(p => p.name === "Marcos")!.soloEnApariciones && lib.personajes.find(p => p.name === "Guardia")!.apariciones[0] === 2, "la biblioteca distingue narradores, restricciones y apariciones");
  // Lista de apariciones incompleta: la narración que nombra a alguien lo pone en cuadro igualmente.
  const pres = asignarPresencia([{ n: 1, speaker: "Narrador", line: "Ana cruza la calle." }], { ...lib, personajes: lib.personajes.map(p => ({ ...p, apariciones: [] })) }, elencoDesdeBiblioteca(lib, "cine90"));
  ok(pres[0].visibles.includes("Ana") && pres[0].origen.Ana === "narración", "con apariciones incompletas, la narración que nombra a un personaje lo pone en cuadro");
}

// --- Validador: detecta cambios de diálogo, narrador en cuadro, restricciones y formato. ---
{
  const malo = { ...r.episode, scenes: r.episode.scenes.map((s: any, i: number) => i === 0 ? { ...s, line: "Frase inventada." } : i === 1 ? { ...s, visibleCharacters: ["Narrador", "Daniel"] } : i === 4 ? { ...s, visibleCharacters: ["Príncipe de Persia", "Príncipe de Grecia"], imagePromptFlow: `${s.imagePromptFlow} Príncipe de Grecia vertical 9:16` } : s) };
  const p = validarImportacion({ episodio: malo, cast: r.characters, original: normalizarCapitulo(capituloTxt), biblioteca: normalizarPersonajes(personajesTxt), modo: "fidelidad", aspecto: "16:9" });
  const cod = new Set(p.map(x => x.codigo));
  ok(["dialogo-cambiado", "narrador-visible", "restriccion", "formato"].every(c => cod.has(c)), "el validador detecta diálogo cambiado, narrador visible, restricción y formato");
  const cambios = cambiosDeAdaptacion(normalizarCapitulo(capituloTxt)!.clips, [...escenas.slice(0, 19), { speaker: "Narrador", line: "Otra conclusión." }, { speaker: "Narrador", line: "Extra." }]);
  ok(cambios.length === 2 && /Escena 20/.test(cambios[0]) && /Escena 21 añadida/.test(cambios[1]), "la adaptación creativa lista los cambios respecto al original");
}

// --- Mejora con IA (solo dirección visual): no puede cambiar diálogos ni saltarse restricciones. ---
{
  const ia: any = importarFiel({ capitulo: capituloTxt, personajes: personajesTxt, formato: "largo", direccionIA: [
    { n: 19, visibles: ["Mensajero Celestial", "Príncipe de Grecia", "Narrador"], line: "Frase cambiada por la IA", speaker: "Miguel", camera: "Travelling circular lento alrededor del mensajero." } as any,
    { n: 11, visualAction: "Miguel irrumpe entre nubes abiertas como un muro de luz", visibles: ["Miguel"] },
  ] });
  const e19 = ia.episode.scenes[18];
  ok(e19.line === original.clips[18][0][1] && e19.speaker === "Mensajero Celestial", "la IA no puede cambiar la frase ni el hablante");
  ok(!e19.visibleCharacters.includes("Príncipe de Grecia") && !e19.visibleCharacters.includes("Narrador") && e19.camera.startsWith("Travelling circular"), "la IA no puede poner en cuadro al Narrador ni a un personaje restringido, pero sí mejorar la cámara");
  ok(ia.episode.scenes[10].visualAction.startsWith("Miguel irrumpe") && ia.episode.validacion.some((p: any) => /la IA propuso a Príncipe de Grecia/.test(p.mensaje)), "la propuesta visual válida se usa y la rechazada queda avisada");
}

console.log(`${checks} comprobaciones de importación correctas.`);

// El nombre de una historia propia no se sustituye por «Episodio 1».
{
  const historia: any = importarFiel({ capitulo: JSON.stringify({ titulo: "Mi historia · Acto II", clips: [[["Daniel", "Mi historia sigue aquí."]]] }), style: "epica", formato: "largo" });
  ok(historia.episode.title === "Mi historia · Acto II", "historia JSON: conserva el título del acto sin imponer Episodio 1");
  ok(historia.episode.scenes.length === 1 && historia.episode.scenes[0].line === "Mi historia sigue aquí.", "historia JSON: conserva las escenas y el diálogo original");
}
