// Correcciones en JSON de otra IA sobre la revisión de dirección. npm test
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { correccionesDeJson, importarFiel, redirigirEpisodio } from "../src/lib/importacion";

let checks = 0;
const ok = (c: boolean, m: string) => { assert.ok(c, m); checks++; console.log(`ok · ${m}`); };
const capTxt = readFileSync("tests/fixtures/daniel_ep01_capitulo.json", "utf8");
const imp: any = importarFiel({ capitulo: capTxt, personajes: readFileSync("tests/fixtures/daniel_ep01_personajes.json", "utf8"), formato: "largo" });
const ep = imp.episode, cast = imp.characters;
const antes = JSON.stringify(ep);
const sin = redirigirEpisodio(ep, cast, "epica", "16:9");

// 1. Dirección por escena (con nombres de campo en español).
const dir = correccionesDeJson(JSON.stringify({ escenas: [{ n: 4, visibles: ["Daniel", "Miguel"], plano: "Plano general", camara: "Grúa que sube despacio.", imagen: "Daniel de rodillas y Miguel detrás, con la espada alzada" }, { n: 30, camera: "x" }] }))!;
ok(dir.correcciones.length === 2 && dir.correcciones[0].shotType === "Plano general" && /^Grúa que sube despacio/.test(String(dir.correcciones[0].camera)), "lee la dirección por escena, también con nombres en español (plano, cámara, imagen)");
const r = redirigirEpisodio(ep, cast, "epica", "16:9", { correcciones: dir.correcciones });
const f4 = r.filas[3];
ok(f4.despues.shotType === "Plano general" && /Grúa que sube/.test(f4.despues.camera) && f4.despues.visibles.join() === "Daniel,Miguel" && f4.correccion!.includes("visibles"), "la escena 4 queda con el plano, la cámara, la imagen y quién está en cuadro del JSON");
ok(f4.despues.videoAction === sin.filas[3].despues.videoAction, "lo que el JSON no trae sigue con la dirección automática");
ok(r.filas.filter(f => f.correccion).length === 1, "las demás escenas no cambian (la 30 no existe y se ignora)");
ok(r.propuesta.scenes[3].visibleCharacters.join() === "Daniel,Miguel" && /Plano general|wide/i.test(r.propuesta.scenes[3].imagePromptFlow + r.propuesta.scenes[3].shotType), "la propuesta lleva la corrección a la escena y a sus prompts");
ok(JSON.stringify(ep) === antes, "proponer no toca el episodio guardado (se aplica solo al aprobar)");

// 2. Personaje sin ficha: no se pone en cuadro y se avisa.
const r2 = redirigirEpisodio(ep, cast, "epica", "16:9", { correcciones: [{ n: 2, visibles: ["Daniel", "Gabriel"] }] });
ok(r2.filas[1].despues.visibles.join() === "Daniel" && r2.validacion.some((v: any) => /Gabriel/.test(v.mensaje)), "un nombre sin ficha (Gabriel) no entra en cuadro y queda avisado");

// 3. capitulo.json con una frase corregida.
const cap = JSON.parse(capTxt); cap.clips[5] = [["Daniel", "Señor, sigo aquí. No me iré sin tu respuesta."]];
const fr = correccionesDeJson(JSON.stringify(cap))!;
const r3 = redirigirEpisodio(ep, cast, "epica", "16:9", { correcciones: fr.correcciones });
ok(r3.filas[5].line === "Señor, sigo aquí. No me iré sin tu respuesta." && r3.filas[5].lineaAntes === ep.scenes[5].line && r3.filas[5].correccion!.includes("line"), "un capitulo.json corrige la frase y se marca con la frase de antes");
ok(r3.filas.filter(f => f.lineaAntes || f.hablanteAntes).length === 1 && r3.propuesta.scenes[5].line.startsWith("Señor, sigo aquí") && r3.propuesta.scenes.length === ep.scenes.length, "solo cambia esa frase; la cantidad de escenas se mantiene");
ok(correccionesDeJson("no es json") === null && correccionesDeJson(JSON.stringify({ hola: 1 })) === null, "un archivo sin correcciones se rechaza con aviso");
// 4. Luz y sonido del JSON reemplazan su grupo (no se suman a lo automático).
const auto = sin.filas[0].despues;
ok(!!auto.atmosphere && !!auto.music, "(la dirección automática de la escena 1 trae ambiente y música)");
const ls = correccionesDeJson(JSON.stringify({ escenas: [{ n: 1, luz: "Luz de antorchas en la calle de la aldea", sonido: "Música contenida: cuerdas suaves" }] }))!;
const r4 = redirigirEpisodio(ep, cast, "epica", "16:9", { correcciones: ls.correcciones });
const d1 = r4.filas[0].despues, s1 = r4.propuesta.scenes[0];
ok(d1.lighting === "Luz de antorchas en la calle de la aldea" && d1.atmosphere === "" && d1.vfx === "", "la luz del JSON reemplaza luz, ambiente y efectos automáticos (no quedan dos instrucciones)");
ok(d1.sfx === "Música contenida: cuerdas suaves" && d1.music === "", "el sonido del JSON reemplaza sonido y música automáticos");
ok(!/Atmosphere:|Visual effects:|VFX:/.test(s1.imagePromptFlow + s1.animationPrompt) && /Luz de antorchas/.test(s1.imagePromptFlow), "los prompts solo llevan la luz del JSON");
const r5 = redirigirEpisodio(ep, cast, "epica", "16:9", { correcciones: [{ n: 1, lighting: "Contraluz", atmosphere: "Niebla baja" }] });
ok(r5.filas[0].despues.atmosphere === "Niebla baja" && r5.filas[0].despues.vfx === "", "si el JSON trae luz y ambiente, se quedan los dos y solo se vacía lo que no trae");
// 5. Toma de 8 s por defecto; la que ya tiene la escena se conserva.
ok(r.propuesta.scenes.every((x: any) => x.durationSec === 8 && x.tomaSeg === 8 && /\b8 seconds\b/.test(x.animationPrompt)) && !r.validacion.some((v: any) => v.codigo === "duracion-toma") && r.duraciones.noCaben.length === 0, "todas las tomas quedan en 8 s, datos y prompts de acuerdo, y todas las frases caben");
const con10 = redirigirEpisodio({ ...ep, scenes: ep.scenes.map((x: any, i: number) => i === 2 ? { ...x, tomaSeg: 10 } : x) }, cast, "epica", "16:9");
ok(con10.propuesta.scenes[2].tomaSeg === 10 && /\b10 seconds\b/.test(con10.propuesta.scenes[2].animationPrompt) && con10.propuesta.scenes[3].tomaSeg === 8, "una toma elegida a mano (10 s) se respeta");
console.log(`${checks} comprobaciones de correcciones correctas.`);
