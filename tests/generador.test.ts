// Generador: cantidad de escenas elegida y formato 16:9 de las series largas. npm test
import assert from "node:assert/strict";
import { buildProduction, escenasEnTexto, sceneCountFor, MAX_SCENES, NARRATOR } from "../src/lib/production";
import { templateSeries, templateNext } from "../src/lib/story";
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
console.log(`${checks} comprobaciones del generador correctas.`);
