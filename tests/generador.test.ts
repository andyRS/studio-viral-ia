// Generador: cantidad de escenas elegida y formato 16:9 de las series largas. npm test
import assert from "node:assert/strict";
import { buildProduction, escenasEnTexto, sceneCountFor, MAX_SCENES, NARRATOR } from "../src/lib/production";
import { adaptarPersonajesLocal, personajesSinIA, escenasDelGuion, escenasDeJson, guionExternoSinIA, templateSeries, templateNext } from "../src/lib/story";
let checks = 0;
const ok = (c: boolean, m: string) => { assert.ok(c, m); checks++; console.log(`ok · ${m}`); };

ok(sceneCountFor(88) === 20, "sin elegir, 88 s son 20 escenas");
ok(sceneCountFor(88, 28) === 28, "las escenas elegidas mandan sobre la duración");
ok(sceneCountFor(88, 99) === MAX_SCENES && sceneCountFor(88, 2) === 8, "las escenas elegidas se limitan a 8–30");
ok(escenasEnTexto("88 segundos distribuidos en 20 tomas cinematográficas") === 20 && escenasEnTexto("una historia") === null, "se detecta la cantidad que pide el texto");

const idea = "Daniel ora 21 días; el príncipe de Persia resiste al mensajero hasta que llega Miguel. 88 segundos en 20 tomas.";
const largo = templateSeries({ idea, style: "epica", duration: 88, scenes: 28, formato: "largo" });
// Respuesta de la IA con 30 escenas: se conservan las elegidas (28), no las 20 de la duración.
const raw = { title: "Ep", scenes: Array.from({ length: 30 }, (_, i) => ({ speaker: i === 29 ? NARRATOR : i % 2 ? "Daniel" : "Mensajero", setting: `lugar ${i}`, emotion: "fe", line: `Frase distinta número ${i + 1} aquí.` })) };
const cast = largo.characters;
ok(buildProduction(raw, { style: "epica", duration: 88, scenes: 28, characters: cast, idea }).scenes.length === 28, "con 28 escenas elegidas el episodio tiene 28 aunque la duración sea 88 s");
ok(buildProduction(raw, { style: "epica", duration: 88, characters: cast, idea }).scenes.length === 20, "sin elegir, se queda en las 20 de la duración");
const textos = (x: unknown) => JSON.stringify(x);
ok(!/9:16/.test(textos(largo.episode)) && /16:9/.test(String(largo.episode.scenes[0].imagePromptFlow)) && /16:9/.test(String(largo.episode.scenes[0].animationPrompt)), "serie larga: escenas y animación en 16:9, nada en 9:16");
ok(largo.characters.every((c: any) => /16:9/.test(String(c.flowPrompt || "16:9")) && !/9:16/.test(String(c.flowPrompt || ""))), "serie larga: las fichas de personajes en 16:9");
const corto = templateSeries({ idea, style: "epica", duration: 88, formato: "corto" });
ok(/vertical 9:16/.test(String(corto.episode.scenes[0].imagePromptFlow)), "serie corta: sigue en vertical 9:16");
const sig = templateNext({ style: "epica", duration: 88, scenes: 24, formato: "largo", characters: largo.characters, series: { title: "Daniel" }, partNumber: 2 });
ok(!/9:16/.test(textos(sig.episode)), "el episodio siguiente de una serie larga también sale en 16:9");
ok(largo.characters.every((c: any) => !/1990s Dominican romance/.test(String(c.flowPrompt || ""))), "la ficha de la épica bíblica no usa el look de los 90");
// Guion de otra IA sin IA disponible: «NOMBRE: frase» → escenas con ese hablante; acotaciones fuera.
const otro = `ESCENA 1 — EXT. RÍO TIGRIS — AMANECER
Cámara: plano general lento.
DANIEL (débil): Señor, ¿por qué callas?
MENSAJERO: Fui enviado desde el primer día.
Narrador: Veintiún días de guerra invisible.
MIGUEL: Yo pelearé contra el príncipe de Persia.`;
const esc = guionExternoSinIA(otro, 20);
ok(esc.map(e => e.speaker).join() === "DANIEL,MENSAJERO,Narrador,MIGUEL" && esc[0].line === "Señor, ¿por qué callas?", "sin IA, el guion externo se convierte en escenas con sus hablantes");
const adaptada = templateSeries({ style: "epica", duration: 88, formato: "largo", guionExterno: otro });
ok(adaptada.characters.map((c: any) => c.name.toUpperCase()).includes("MIGUEL") && adaptada.episode.scenes.some((s: any) => /príncipe de Persia/.test(s.line)), "crear serie desde un guion externo usa sus personajes y diálogos");
const adaptNext = templateNext({ style: "epica", duration: 88, guionExterno: otro, characters: adaptada.characters, series: { title: "Daniel" }, partNumber: 1 });
ok(adaptNext.episode.scenes.some((s: any) => /primer día/.test(s.line)), "adaptar un episodio existente con un guion externo");
// Guion en JSON con distintas formas.
const j1 = escenasDeJson(JSON.stringify({ titulo: "Daniel", escenas: [{ descripcion: "Río Tigris al amanecer", camara: "plano general", dialogos: [{ personaje: "Daniel", texto: "Señor, ¿por qué callas?" }] }, { narracion: "Veintiún días de guerra." }, { descripcion: "Tormenta", dialogos: [{ personaje: "Miguel", texto: "Yo pelearé." }] }] }));
ok(!!j1 && j1.map(e => e.speaker).join() === "Daniel,Narrador,Miguel" && j1[0].setting === "Río Tigris al amanecer" && j1[0].shot === "plano general", "JSON con escenas y diálogos anidados");
const j2 = escenasDeJson(JSON.stringify({ scenes: [{ speaker: "Ana", line: "Hola.", emotion: "miedo" }] }));
ok(!!j2 && j2[0].speaker === "Ana" && j2[0].emotion === "miedo", "JSON en inglés (scenes/speaker/line)");
const j3 = escenasDeJson(JSON.stringify({ clips: [[["DANIEL", "Señor, escucha."]], [["MIGUEL", "Aquí estoy."]]] }));
ok(!!j3 && j3.map(e => e.line).join("|") === "Señor, escucha.|Aquí estoy.", "el guion.json de la app (clips) también se lee");
ok(escenasDeJson("DANIEL: hola") === null, "un texto que no es JSON sigue por la vía de líneas");
const desdeJson = templateSeries({ style: "epica", duration: 88, guionExterno: JSON.stringify({ escenas: [{ dialogos: [{ personaje: "Daniel", texto: "Señor, ¿por qué callas?" }, { personaje: "Gabriel", texto: "Fui enviado desde el primer día." }] }] }) });
ok(desdeJson.characters.some((c: any) => /gabriel/i.test(c.name)) && desdeJson.episode.scenes.some((s: any) => /primer día/.test(s.line)), "crear serie desde un guion JSON");
ok(escenasDelGuion(JSON.stringify({ clips: Array.from({ length: 28 }, (_, i) => [["DANIEL", `frase ${i}`]]) })) === 28, "se cuentan las escenas de un guion.json (28)");
ok(escenasDelGuion(otro) === 4 && escenasDelGuion("Una historia de 24 escenas sobre Daniel") === 24 && escenasDelGuion("") === null, "se cuentan los diálogos de un guion en texto o la cifra que menciona");
// Personajes de otra IA.
const pj1 = personajesSinIA(JSON.stringify({ personajes: [{ nombre: "Daniel", edad: 85, apariencia: "anciano de barba blanca", vestuario: "túnica gris", voz: "grave y cansada" }, { name: "Gabriel", description: "tall angel", outfit: "white robe" }] }));
ok(pj1.length === 2 && pj1[0].visualES === "anciano de barba blanca" && pj1[0].clothing === "túnica gris" && pj1[1].clothing === "white robe", "personajes en JSON (español o inglés)");
const pj2 = personajesSinIA(`## Daniel\nAnciano profeta de barba blanca.\nRopa: túnica de lino.\nVoz: grave.\n\n## Miguel\nArcángel de armadura dorada.`);
ok(pj2.length === 2 && pj2[0].clothing === "túnica de lino" && /barba blanca/.test(pj2[0].visualES) && /armadura dorada/.test(pj2[1].visualES), "personajes en texto con encabezados");
const pj3 = personajesSinIA("DANIEL: anciano de barba blanca y túnica gris\nMIGUEL: arcángel con armadura dorada");
ok(pj3.map(p => p.name).join() === "DANIEL,MIGUEL", "personajes en líneas «NOMBRE: descripción»");
const pjL = adaptarPersonajesLocal({ texto: "DANIEL: anciano de barba blanca\nMIGUEL: arcángel de armadura dorada", style: "epica", formato: "largo" });
ok(pjL.characters.length === 2 && pjL.characters.every((c: any) => /16:9/.test(c.flowPrompt) && /barba blanca|armadura/.test(c.visualES)), "sin IA, las fichas se adaptan al elenco con prompt 16:9");
console.log(`${checks} comprobaciones del generador correctas.`);
