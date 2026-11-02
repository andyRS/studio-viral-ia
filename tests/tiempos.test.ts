// Tiempos del montaje: vídeo, voz y montaje por escena; recomendaciones, detección y aplicación con aprobación. npm test
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { importarFiel, redirigirEpisodio } from "../src/lib/importacion";
import { aplicarTiempos, planTiempos } from "../src/lib/tiempos";
import { vozEnMuestras } from "../src/lib/medirAudio";
import { conAspecto, refreshPrompts } from "../src/lib/production";
import { clasificarFrase, type Fuente } from "../src/lib/fuentes";

let checks = 0;
const ok = (c: boolean, m: string) => { assert.ok(c, m); checks++; console.log(`ok · ${m}`); };
const capTxt = readFileSync("tests/fixtures/daniel_ep01_capitulo.json", "utf8");
const pjTxt = readFileSync("tests/fixtures/daniel_ep01_personajes.json", "utf8");
const orig = JSON.parse(capTxt);
const imp: any = importarFiel({ capitulo: capTxt, personajes: pjTxt, formato: "largo" });
const ep: any = redirigirEpisodio(imp.episode, imp.characters, "epica", "16:9").propuesta;
// Episodio guardado antes de los 8 s por defecto: dato de toma a 8 s pero prompts a 5 s (sin toma por escena).
const guardado = { ...ep, scenes: ep.scenes.map((s: any) => ({ ...s, durationSec: 8, tomaSeg: undefined, animationPrompt: String(s.animationPrompt).replace(/\b8 seconds\b/, "5 seconds") })) };
const opts = { tomaBase: 5, tarjetas: ep.guionJson.tarjetas, cierre: true };
const P = planTiempos(guardado.scenes, opts);
const F = (n: number) => P.filas[n - 1];

// 1. Tres duraciones distintas.
ok(P.filas.every(f => f.video === 5) && P.totales.video === 100 && P.totales.voz === 65.1 && P.totales.montaje === 92, "1 · vídeo (100 s, lo que piden los prompts), voz (65,1 s) y montaje (~92 s) se calculan por separado");
// 2. No se recorta al terminar la voz.
ok(F(5).montaje > F(5).voz + 0.4 + 1 && F(5).montaje === Math.round((0.3 + F(5).voz + F(5).margenDeseado) * 10) / 10, "2 · en modo cinematográfico se conserva el margen de acción tras la voz (escena 5: 1,5 s)");
ok(planTiempos(guardado.scenes, { ...opts, modo: "viral" }).totales.montaje < P.totales.montaje, "2 · el modo viral sigue disponible y corta antes");
// 3. Duración por escena dentro de lo que admite el motor.
ok(P.duraciones.join() === "5,8,10" && planTiempos([{ ...guardado.scenes[0], tomaSeg: 7 }], opts).filas[0].problemas.some(p => p.codigo === "fuera-de-motor"), "3 · las tomas se eligen entre las del motor (Seedance: 5, 8, 10 s) y se avisa si no");
// 4. Escena 19: 8 s.
ok(F(19).problemas.some(p => p.codigo === "voz-truncada") && F(19).tomaMinima === 8 && F(19).tomaRecomendada === 8, "4 · escena 19: la voz no cabe en 5 s; se recomienda 8 s");
// 5. Escenas 1, 11 y 18.
ok([1, 11, 18].every(n => F(n).margen === 0.1 && F(n).problemas.some(p => p.codigo === "al-limite") && F(n).tomaRecomendada === 8), "5 · escenas 1, 11 y 18: solo 0,1 s tras la voz; se recomienda 8 s para una narración natural y la acción");
// 6. Llegada de Miguel: impacto.
ok(F(11).beat === "llegada" && F(11).margenDeseado === 3 && F(11).problemas.some(p => p.codigo === "accion-incompleta"), "6 · llegada de Miguel: pide 3 s de acción tras la narración y en 5 s se cortaría");
const con8 = planTiempos(guardado.scenes.map((s: any, i: number) => i === 10 ? { ...s, tomaSeg: 8 } : s), opts).filas[10];
ok(con8.margen >= 3 && con8.montaje >= 7.9 && !con8.problemas.length, "6 · con 8 s la llegada conserva más de 3 s de impacto tras la voz");
// 7. Duración real de la voz.
const medida = planTiempos(guardado.scenes, { ...opts, mediciones: { 19: { video: 5.04, vozInicio: 0.2, vozFin: 5.0 } } }).filas[18];
ok(medida.vozFuente === "medida" && medida.voz === 4.8 && medida.video === 5 && medida.problemas.some(p => p.codigo === "voz-truncada"), "7 · con el clip medido se usa la voz real (4,8 s) y se detecta la frase cortada");
const sr = 16000, sig = new Float32Array(sr * 5);
for (let i = Math.round(sr * 0.4); i < sr * 3.6; i++) sig[i] = 0.4 * Math.sin(i / 7);
for (let i = 0; i < sig.length; i++) sig[i] += 0.004 * Math.sin(i / 3);
const v = vozEnMuestras(sig, sr);
ok(v.inicio !== null && Math.abs(v.inicio - 0.4) <= 0.04 && v.fin !== null && Math.abs(v.fin - 3.6) <= 0.04, "7 · la medición encuentra el inicio y el final de la voz en el audio (0,4–3,6 s) ignorando el ambiente");
ok(vozEnMuestras(new Float32Array(sr), sr).inicio === null, "7 · un clip sin voz se reconoce como tal");
// 9. Detección: truncados, acción incompleta y superposiciones.
ok(P.filas.filter(f => f.problemas.some(p => p.codigo === "accion-incompleta")).map(f => f.n).join() === "1,6,11,14,15,18", "9 · clips que terminarían antes de completar su acción: 1, 6, 11, 14, 15 y 18");
const sup = planTiempos([{ n: 1, speaker: "Ana", line: "una dos tres cuatro cinco seis siete ocho nueve diez once doce", tomaSeg: 5 }, { n: 2, speaker: "Luis", line: "Hola." }], { tomaBase: 5, mediciones: { 1: { video: 5, vozInicio: 0.3, vozFin: 4.9 }, 2: { video: 5, vozInicio: 0.1, vozFin: 1 } } });
ok(sup.filas[0].problemas.some(p => p.codigo === "superposicion"), "9 · se detecta el riesgo de superponer dos voces en un encadenado");

// Aplicar solo con aprobación: tiempos, sin tocar guion, personajes ni dirección.
const decisiones = P.filas.map(f => ({ n: f.n, toma: f.n === 19 ? 8 : f.video, margen: f.margenDeseado }));
const antes = JSON.stringify(guardado);
const nuevo: any = refreshPrompts(aplicarTiempos(guardado, decisiones, "cinematografico", 95), "epica");
ok(JSON.stringify(guardado) === antes, "proponer o aplicar no muta el episodio original (se guarda como versión nueva)");
ok(nuevo.scenes.every((s: any, i: number) => s.line === orig.clips[i][0][1] && s.speaker === guardado.scenes[i].speaker && s.visualAction === guardado.scenes[i].visualAction && JSON.stringify(s.visibleCharacters) === JSON.stringify(guardado.scenes[i].visibleCharacters)), "guion, hablantes, dirección y presencia intactos");
ok(nuevo.scenes[18].durationSec === 8 && /8 seconds/.test(nuevo.scenes[18].animationPrompt) && /5 seconds/.test(nuevo.scenes[0].animationPrompt) && nuevo.duration === 103 && nuevo.editDuration === 95, "la escena 19 pide 8 s en su prompt; el resto sigue a 5 s; duración 103 s y montaje 95 s");
ok(/keeps going for 3 s after the line/.test(nuevo.scenes[10].animationPrompt) && nuevo.guionJson.montaje.modo === "accion" && nuevo.guionJson.tiempos[10].margen === 3, "el prompt de la llegada pide 3 s de acción tras la frase y el guion.json lleva el modo y el margen por clip");
ok(JSON.stringify(nuevo.cast) === JSON.stringify(guardado.cast), "los seis personajes canónicos no cambian");

// 10. Escena 18 → Daniel 10:12 y 10:20.
const fuente: Fuente = JSON.parse(readFileSync("src/data/fuentes/daniel-10-rv1909.json", "utf8"));
const c18 = clasificarFrase(orig.clips[17][0][1], fuente);
ok(c18.clase === "parafrasis" && c18.refs.join() === "Daniel 10:12,Daniel 10:20", "10 · escena 18: paráfrasis de Daniel 10:12 y 10:20 (Persia/persas se reconocen)");

// Formato del episodio: un episodio en 16:9 sigue en 16:9 en cualquier camino que rehaga los prompts,
// aunque la serie figure como corta (caso real: tomas de 8 s aprobadas → prompt «vertical 9:16, 8 seconds»).
ok(ep.aspecto === "16:9", "formato · el episodio importado guarda su formato (16:9)");
const rehecho: any = conAspecto(refreshPrompts(aplicarTiempos(ep, [{ n: 1, toma: 8, margen: 0.8 }], "cinematografico"), "epica"), ep.aspecto);   // como hace la app: el formato del episodio
ok(/horizontal 16:9, 8 seconds/.test(rehecho.scenes[0].animationPrompt) && !/9:16/.test(JSON.stringify(rehecho.scenes)), "formato · con tomas de 8 s aprobadas el prompt dice «horizontal 16:9, 8 seconds», nunca 9:16");
const soloRefresh: any = refreshPrompts({ ...ep, scenes: ep.scenes.map((s: any) => ({ ...s, tomaSeg: 8 })) }, "epica");
ok(!/9:16/.test(JSON.stringify(soloRefresh.scenes)), "formato · Actualizar prompts conserva 16:9 por sí solo (el formato es del episodio)");
const vertical: any = refreshPrompts(conAspecto(ep, "9:16"), "epica");
ok(vertical.aspecto === "9:16" && /vertical 9:16/.test(vertical.scenes[0].animationPrompt) && !/16:9/.test(JSON.stringify(vertical.scenes)) && !/16:9/.test(JSON.stringify(vertical.cast)), "formato · cambiar el episodio a vertical rehace escenas y fichas en 9:16");
ok(conAspecto({ scenes: [{ imagePromptFlow: "vertical 9:16" }] }, "9:16").scenes[0].imagePromptFlow === "vertical 9:16", "formato · una serie corta no se toca");
ok(ep.guionJson.formato === "16:9" && soloRefresh.guionJson.formato === "16:9" && vertical.guionJson.formato === undefined, "formato · el guion del montaje lleva «formato: 16:9» (1920x1080) y se quita al pasar a vertical");

console.log(`${checks} comprobaciones de tiempos correctas.`);
