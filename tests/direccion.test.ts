// Director cinematográfico: variedad, presencia en cuadro, beats, duración y revisión sin tocar el guion. npm test
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { estimarDuraciones, importarFiel, redirigirEpisodio, vistaPreviaRevision } from "../src/lib/importacion";
import { NARRATOR, sceneRole } from "../src/lib/production";

let checks = 0;
const ok = (c: boolean, m: string) => { assert.ok(c, m); checks++; console.log(`ok · ${m}`); };
// Parecido entre dos descripciones (palabras de 4+ letras en común / unión): detecta repeticiones encubiertas.
const palabras = (t: string) => new Set(t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z]+/).filter(w => w.length >= 4));
const parecido = (a: string, b: string) => { const x = palabras(a), y = palabras(b); const comun = Array.from(x).filter(w => y.has(w)).length; return comun / Math.max(1, new Set([...Array.from(x), ...Array.from(y)]).size); };

const capTxt = readFileSync("tests/fixtures/daniel_ep01_capitulo.json", "utf8");
const pjTxt = readFileSync("tests/fixtures/daniel_ep01_personajes.json", "utf8");
const orig = JSON.parse(capTxt);
const imp: any = importarFiel({ capitulo: capTxt, personajes: pjTxt, formato: "largo" });
const E: any[] = imp.episode.scenes;
const ve = (n: number): string[] => E[n - 1].visibleCharacters;

// --- Repetición visual ---
ok(new Set(E.map(s => s.visualAction)).size === 20, "ninguna de las 20 escenas repite la imagen");
ok([[1, 7], [2, 8], [4, 9], [5, 13]].every(([a, b]) => parecido(E[a - 1].visualAction, E[b - 1].visualAction) < 0.35), "las parejas 1/7, 2/8, 4/9 y 5/13 ya no se parecen");
ok(E.every((s, i) => i === 0 || `${s.shotType}|${s.camera}` !== `${E[i - 1].shotType}|${E[i - 1].camera}`), "dos escenas seguidas nunca repiten plano y cámara");
ok(E.every(s => s.visualAction !== s.videoAction && s.camera.split(/\.\s+/).filter(Boolean).length <= 2), "imagen fija y acción de vídeo distintas; un solo movimiento de cámara por toma");

// --- Batalla: acciones diferenciadas, sin victoria definitiva ---
ok(/lapso de tiempo/i.test(E[5].videoAction) && /muralla|bloque/i.test(E[9].visualAction) && /se abren/.test(E[10].visualAction), "6: paso de los días · 10: bloqueo · 11: aparición progresiva entre tormentas");
ok(ve(12).includes("Miguel") && ve(12).includes("Mensajero Celestial") && /hueco|paso abierto/.test(E[11].videoAction + E[11].visualAction), "12: Miguel interviene junto al mensajero y le abre un paso");
ok(/Miguel irrumpe desde fuera de cuadro/.test(E[12].visualAction) && !ve(13).includes("Miguel"), "13: la confrontación evidencia la intervención de Miguel (fuera de cuadro, sin inventar presencia)");
ok(/avanza/.test(E[13].visualAction) && /contiene/.test(E[13].visualAction) && !/victoria|derrot|vencid|vence |destruy|huye/i.test(E[9].visualAction + E[10].visualAction + E[11].visualAction + E[12].visualAction + E[13].visualAction + E[13].videoAction), "14: el mensajero avanza mientras Miguel contiene la resistencia, sin victoria definitiva");
ok(E[4].title !== E[12].title && /trono|dominio/i.test(E[4].visualAction) && /grieta/.test(E[12].visualAction), "5: presentación imperial · 13: confrontación activa (distintas)");
ok(/desciende/.test(E[3].visualAction) && /barrera|empuja/.test(E[8].visualAction), "4: presentación monumental del mensajero · 9: el mensajero choca con la resistencia");

// --- Asignaciones visuales ---
ok([17, 18, 19].every(n => ve(n).includes("Daniel") && ve(n).includes("Mensajero Celestial")), "17–19: Daniel y el mensajero en cuadro (vocativo y conversación)");
ok(ve(15).includes("Daniel") && ve(15).includes("Varón vestido de lino") && /Retrospectiva/.test(E[14].fidelityNote) && /no es un acontecimiento ni una visión nueva/.test(E[14].fidelityNote), "15: Daniel y el varón de lino, marcado como retrospectiva (no una segunda visión)");
ok(/berilo|relámpago|bronce bruñido/.test(E[14].imagePromptFlow), "15: la figura conserva los rasgos de su ficha (Daniel 10:5–6)");
ok(E.every((s, i) => (i === 19) === ve(i + 1).includes("Príncipe de Grecia")) && ve(20).length === 1, "20: el príncipe de Grecia solo en la escena final y sin nadie más en su encuadre");
ok(E.every(s => !(s.visibleCharacters || []).some((n: string) => /narrador/i.test(n))) && E.filter(s => s.speaker === NARRATOR).every(s => /^Voz en off/.test(s.emotion)), "el Narrador nunca está en cuadro y su emoción es el tono de la voz");
ok(!ve(2).includes("Príncipe de Persia") && !ve(7).includes("Príncipe de Persia"), "«Señor, …» se dirige a alguien fuera del elenco: no se añade a nadie");

// --- Beats específicos ---
const genericos = Array.from({ length: 6 }, (_, i) => sceneRole(i === 0 ? 0 : i === 5 ? 19 : i * 3, 20).goal);
ok(new Set(E.map(s => s.goal)).size === 20 && E.every(s => !genericos.includes(s.goal)), "20 beats distintos y ninguno es la etiqueta genérica por posición");

// --- Fidelidad bíblica ---
ok(/dramatizada/.test(E[4].fidelityNote) && /dramatizada/.test(E[11].fidelityNote) && !/dramatizada/.test(E[16].fidelityNote), "frases de los príncipes y de Miguel marcadas como dramatización; las del mensajero no");
ok(/Anticipación de un conflicto posterior/.test(E[19].fidelityNote), "20: anticipación de un conflicto posterior, no parte de los 21 días");

// --- Duración ---
const d = estimarDuraciones(E, 5);
ok(d.noCaben.map(f => f.n).join() === "19" && /Generar esta toma a 8 s/.test(d.noCaben[0].propuesta) && d.alLimite.map(f => f.n).join() === "1,11,18", "19 no cabe en 5 s (se propone 8 s o encadenar la voz); 1, 11 y 18 van al límite");
ok(E.every((s, i) => s.line === orig.clips[i][0][1]), "la estimación no recorta ni reescribe diálogos");
ok(estimarDuraciones([{ speaker: "Ana", line: "Hola." }], 8).noCaben.length === 0, "una frase corta cabe");

// --- Revisión de un episodio guardado: solo metadatos, nada del guion ---
{
  const viejo = JSON.parse(JSON.stringify({ ...imp.episode, scenes: imp.episode.scenes.map((s: any, i: number) => ({ ...s, tomaSeg: 5, visualAction: "Daniel de pie", setting: "Daniel de pie", title: "La confrontación", goal: sceneRole(i, 20).goal, visibleCharacters: [s.speaker].filter(x => x !== NARRATOR), characters: [s.speaker].filter(x => x !== NARRATOR) })) }));
  const antes = JSON.stringify(viejo);
  const rev = redirigirEpisodio(viejo, imp.characters, "epica", "16:9");
  ok(JSON.stringify(viejo) === antes, "proponer la revisión no modifica el episodio guardado");
  const P = rev.propuesta.scenes;
  ok(P.length === 20 && P.every((s: any, i: number) => s.line === viejo.scenes[i].line && s.speaker === viejo.scenes[i].speaker && s.n === viejo.scenes[i].n), "la revisión conserva escenas, diálogos, hablantes y orden");
  ok(JSON.stringify(rev.propuesta.cast.map((c: any) => [c.name, c.visualES, c.clothing])) === JSON.stringify(viejo.cast.map((c: any) => [c.name, c.visualES, c.clothing])), "la revisión conserva las fichas maestras");
  ok(new Set(P.map((s: any) => s.visualAction)).size === 20 && P[11].visibleCharacters.includes("Mensajero Celestial") && P.every((s: any) => (s.visibleCharacters || []).every((n: string) => s.imagePromptFlow.includes(n))), "la propuesta trae dirección variada, presencia corregida y prompts con sus fichas");
  ok(!/9:16/.test(JSON.stringify(rev.propuesta.scenes)) && rev.validacion.filter(p => p.nivel === "error").length === 0, "la propuesta respeta 16:9 y pasa la revisión de continuidad");
  const md = vistaPreviaRevision("Daniel", rev.filas, rev.duraciones, rev.validacion);
  ok(/## Escena 20/.test(md) && /no caben en su toma/.test(md) && /antes: Miguel/.test(md), "la vista previa textual lista las 20 escenas, las duraciones y los cambios de presencia");
}

// --- Otro género (drama de los 90): sin reglas especiales de Daniel ---
{
  const lineas: [string, string][] = [["Narrador", "Rosa llegó al colmado buscando a Julio."], ["Rosa", "Julio, tenemos que hablar."], ["Julio", "Ahora no puedo, Rosa."], ["Rosa", "Tú me prometiste la verdad."], ["Julio", "La verdad te va a doler."], ["Narrador", "Esa noche nadie durmió."], ["Rosa", "¿Quién es ella?"], ["Julio", "Alguien de mi pasado."], ["Rosa", "Entonces vete con ella."], ["Narrador", "Lo que Rosa no sabe es que Julio la protege."]];
  const x: any = importarFiel({ capitulo: JSON.stringify({ clips: lineas.map(l => [l]) }), personajes: JSON.stringify({ personajes: [{ nombre: "Rosa", descripcion_maestra: "Mujer de 30 años, pelo rizado. Vestido rojo." }, { nombre: "Julio", descripcion_maestra: "Hombre de 35 años, bigote. Camisa blanca." }] }), style: "cine90", formato: "corto" });
  const S: any[] = x.episode.scenes;
  ok(new Set(S.map(s => s.visualAction)).size === S.length && S.every((s, i) => i === 0 || `${s.shotType}|${s.camera}` !== `${S[i - 1].shotType}|${S[i - 1].camera}`), "otro género: ninguna imagen repetida ni plano+cámara seguidos iguales");
  ok(S[1].visibleCharacters.includes("Julio") && S[2].visibleCharacters.includes("Rosa") && S[3].visibleCharacters.includes("Julio"), "otro género: el interlocutor (vocativo o «tú») entra en cuadro");
  ok(S.every((s, i) => s.line === lineas[i][1]) && /vertical 9:16/.test(S[0].imagePromptFlow), "otro género: diálogos intactos y formato 9:16");
}

console.log(`${checks} comprobaciones del director correctas.`);
