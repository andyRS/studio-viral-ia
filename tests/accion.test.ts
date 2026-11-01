// Cinematic Action Director: secuencias, bloqueo, coreografía, cámara, VFX, prompts y aprobación. npm test
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { importarFiel, redirigirEpisodio } from "../src/lib/importacion";
import { aplicarAccion, costeEstimado, planificarAccion, transicionesDe, verificarContinuidad } from "../src/lib/accion";
import { conAspecto, refreshPrompts } from "../src/lib/production";
import { motorDe } from "../src/lib/tiempos";

let checks = 0;
const ok = (c: boolean, m: string) => { assert.ok(c, m); checks++; console.log(`ok · ${m}`); };
const capTxt = readFileSync("tests/fixtures/daniel_ep01_capitulo.json", "utf8");
const pjTxt = readFileSync("tests/fixtures/daniel_ep01_personajes.json", "utf8");
const orig = JSON.parse(capTxt);
const imp: any = importarFiel({ capitulo: capTxt, personajes: pjTxt, formato: "largo" });
const ep: any = redirigirEpisodio(imp.episode, imp.characters, "epica", "16:9").propuesta;
const antes = JSON.stringify(ep);
const plan = planificarAccion(ep.scenes, imp.characters);
const T = (n: number) => plan.tomas.find(t => t.escena === n)!;
const batalla = plan.secuencias.find(s => s.escenas.includes(11))!;

// Reconocimiento y secuencias.
ok(batalla.escenas.join() === "4,5,6,9,10,11,12,13,14" && batalla.intercaladas.join() === "7,8" && batalla.oposicion.join() === "Príncipe de Persia" && batalla.aliados.includes("Miguel") && batalla.aliados.includes("Mensajero Celestial"), "la batalla es una secuencia (4–14) con la oración de Daniel (7–8) intercalada; Persia es la oposición");
ok(batalla.maximaTension === 11 && batalla.progresion.find(p => p.escena === 5)!.ventaja === "oposicion" && batalla.progresion.find(p => p.escena === 14)!.ventaja === "aliados" && /persiste/.test(batalla.consecuencia), "progresión: la oposición domina, Miguel cambia el equilibrio y el mensajero avanza sin victoria definitiva");
ok(!!batalla.interpretacion && /Revísalo/.test(batalla.interpretacion), "el montaje paralelo es una interpretación que el usuario revisa");
ok(plan.secuencias.find(s => s.escenas.includes(15))!.tipo === "manifestacion-celestial" && plan.secuencias.find(s => s.escenas.includes(20))!.tipo === "amenaza", "15 es una manifestación celestial y 20 una amenaza, cada una en su secuencia");
ok(!T(19) && !T(16) && !T(2) && !T(7), "una frase sobre luchar (19), la debilidad (16) y las oraciones no se toman como acción");

// 12. Príncipe de Grecia solo en la anticipación.
ok(plan.tomas.every(t => t.escena === 20 || !t.visibles.includes("Príncipe de Grecia")) && !batalla.participantes.includes("Príncipe de Grecia"), "12 · el príncipe de Grecia no entra en la batalla: solo en la anticipación de la escena 20");

// 1/6. Continuidad espacial y eje.
const ts = plan.tomas.filter(t => t.secuencia === batalla.id);
ok(ts.every(t => t.continuidad.every(c => /correcta|Primera/.test(c))), "1 · continuidad espacial correcta en toda la batalla: nadie cambia de lado sin transición");
ok(ts.every(t => t.final.filter(e => e.nombre === "Príncipe de Persia").every(e => e.x > 0.7 && e.mira === "izquierda")) && ts.filter(t => t.visibles.includes("Mensajero Celestial")).every(t => t.final.find(e => e.nombre === "Mensajero Celestial")!.desplaza === "derecha" || t.final.find(e => e.nombre === "Mensajero Celestial")!.desplaza === "quieto"), "6 · eje coherente: Persia a la derecha mirando a la izquierda; el mensajero avanza de izquierda a derecha");
const m12 = T(12).final.find(e => e.nombre === "Miguel")!, p13 = T(13).final.find(e => e.nombre === "Príncipe de Persia")!;
ok(m12.x < p13.x && T(14).inicial.find(e => e.nombre === "Miguel")!.x === m12.x, "1 · Miguel queda entre el mensajero y Persia y conserva su posición de una toma a otra");
const roto = JSON.parse(JSON.stringify(plan.tomas)); roto.find((t: any) => t.escena === 14).inicial.find((e: any) => e.nombre === "Miguel").x = 0.95;
roto.find((t: any) => t.escena === 13).final.push({ ...roto.find((t: any) => t.escena === 13).final[0], nombre: "Miguel", x: 0.3 });
verificarContinuidad(plan.secuencias, roto);
ok(roto.find((t: any) => t.escena === 14).continuidad.some((c: string) => /cambia de lado|invierten/.test(c)), "1 · si Miguel salta al otro lado sin transición, la continuidad lo detecta");

// Coreografía y cámara.
ok(T(11).fase === "preparacion" && T(12).fase === "accion" && T(13).fase === "reaccion" && T(14).fase === "transicion", "coreografía: llegada (preparación) → intervención (acción) → reacción de Persia → transición del mensajero");
ok(/Grúa/.test(T(11).camara.movimiento) && /escala monumental/.test(T(11).camara.razon) && /Primer plano/.test(T(13).camara.plano) && /Travelling/.test(T(14).camara.movimiento) && plan.tomas.every(t => t.camara.razon.length > 20), "cada plano tiene una razón: grúa para la llegada, primer plano para la reacción, travelling para el avance");
ok(plan.tomas.every(t => !/orbit|órbita/i.test(t.camara.movimiento)), "no se piden órbitas que el motor no ejecuta con fiabilidad");
ok(plan.tomas.every(t => t.vfx.every(v => v.proposito.length > 10)) && T(11).vfx.some(v => /llegada/.test(v.proposito)), "cada efecto tiene un propósito narrativo");
ok(!!T(11).dividir && !/8 s/.test(String(ep.scenes[10].tomaSeg)), "la llegada propone dividir o alargar la toma, sin aplicarlo");

// 3/2. Fichas canónicas y personajes.
const aprobado: any = conAspecto(refreshPrompts(aplicarAccion(ep, plan, batalla.escenas), "epica"), "16:9");
ok(JSON.stringify(aprobado.cast) === JSON.stringify(ep.cast) && aprobado.scenes.every((s: any) => (s.visibleCharacters || []).every((n: string) => { const m = imp.characters.find((c: any) => c.name === n); return s.imagePromptFlow.includes(`${m.visualEN || m.visualES}; outfit: ${m.clothing}`); })), "3 · las fichas maestras no cambian y cada prompt usa la ficha exacta");
ok(aprobado.scenes.every((s: any, i: number) => JSON.stringify(s.visibleCharacters) === JSON.stringify(ep.scenes[i].visibleCharacters)), "2 · la dirección de acción no cambia quién está en cuadro");
// 4. Escena ≠ toma ≠ clip.
ok(plan.tomas.length < ep.scenes.length && plan.tomas.every(t => ep.scenes.some((s: any) => s.n === t.escena)) && aprobado.scenes.length === 20, "4 · una toma de producción por escena narrativa con acción; las escenas no se dividen");
// 5. Sin acciones duplicadas.
ok(new Set(ts.map(t => t.accionPrincipal)).size === ts.length && new Set(ts.map(t => `${t.camara.plano}|${t.camara.movimiento}`)).size >= ts.length - 2, "5 · ninguna acción principal se repite dentro de la batalla");
// 7. Imagen estática y vídeo independientes.
const s11 = aprobado.scenes[10];
ok(/Blocking \(screen positions\)/.test(s11.imagePromptFlow) && !/CAMERA:|END STATE/.test(s11.imagePromptFlow) && /END STATE:/.test(s11.animationPrompt) && /SCREEN DIRECTION/.test(s11.animationPrompt) && /CAMERA: Grúa/.test(s11.animationPrompt), "7 · la imagen lleva bloqueo y estado inicial; el vídeo, cámara, dirección de pantalla y estado final");
// 8. Duraciones del proveedor.
ok(aprobado.scenes.every((s: any) => motorDe("seedance").duraciones.includes(Number((s.animationPrompt.match(/(\d+) seconds/) || [])[1]))), "8 · todas las tomas piden duraciones que Seedance admite");
// 9. Sin generaciones ni cambios sin aprobación.
ok(JSON.stringify(ep) === antes && JSON.stringify(aplicarAccion(ep, plan, [])) !== "" && aplicarAccion(ep, plan, []).scenes.every((s: any, i: number) => s === ep.scenes[i]), "9 · planificar no modifica el episodio y sin tomas aprobadas no cambia ninguna escena");
const src = readFileSync("src/lib/accion.ts", "utf8");
ok(!/fetch\(|postApi|callLLM|askJson/.test(src), "9 · el director de acción no llama a la IA ni a ningún servicio (sin créditos)");
// 10. Versiones (la aprobación guarda la anterior; se puede volver).
ok(aprobado.accionDirector.aprobadas.join() === batalla.escenas.join() && JSON.parse(antes).scenes[10].blocking === undefined, "10 · la aprobación queda registrada y la versión previa sigue intacta para restaurarla");
// 11. Diálogos.
ok(aprobado.scenes.every((s: any, i: number) => s.line === orig.clips[i][0][1]), "11 · los 20 diálogos de Daniel se conservan");
// 13. Narrador.
ok(plan.tomas.every(t => !t.visibles.some(v => /narrador/i.test(v)) && !t.inicial.some(e => /narrador/i.test(e.nombre))), "13 · el Narrador nunca tiene posición ni estado: es voz en off");
// Costes: solo con tarifa configurada.
ok(costeEstimado(121, { creditosSegundo: null, usdCredito: null, reintentos: 1.5 }).creditos === null && costeEstimado(121, { creditosSegundo: 2, usdCredito: 0.01, reintentos: 1.5 }).creditos === 363, "los costes solo se calculan con la tarifa configurada (nunca inventada)");

// 14. Otros géneros.
const genero = (style: string, formato: string, clips: [string, string][], pjs: any[]) => { const x: any = importarFiel({ capitulo: JSON.stringify({ clips: clips.map(c => [c]) }), personajes: JSON.stringify({ personajes: pjs }), style, formato }); return { x, p: planificarAccion(x.episode.scenes, x.characters) }; };
const aventura = genero("cine90", "largo", [["Narrador", "Lucía corre por el puente mientras el cazador la persigue."], ["Lucía", "¡No me alcanzarás!"], ["Cazador", "Ríndete."], ["Narrador", "El puente se derrumba a sus espaldas."], ["Lucía", "Lo logré."]],
  [{ nombre: "Lucía", rol: "Protagonista aventurera", descripcion_maestra: "Mujer joven, pelo corto. Chaqueta de cuero." }, { nombre: "Cazador", rol: "Antagonista que la persigue", descripcion_maestra: "Hombre alto. Abrigo negro, rifle." }]);
ok(aventura.p.secuencias[0]?.tipo !== undefined && aventura.p.tomas.some(t => t.tipo === "persecucion") && aventura.p.secuencias[0].oposicion.includes("Cazador"), "14 · aventura: persecución con el cazador como oposición");
const scifi = genero("cine90", "largo", [["Narrador", "La nave de Kira esquiva los disparos del dron."], ["Dron", "Objetivo localizado."], ["Kira", "Activa el escudo."], ["Narrador", "El dron ataca de nuevo y la nave cae."]],
  [{ nombre: "Kira", rol: "Piloto protagonista", descripcion_maestra: "Mujer, casco plateado. Traje de vuelo azul." }, { nombre: "Dron", rol: "Enemigo autónomo", descripcion_maestra: "Dron negro con cañón láser." }]);
ok(scifi.p.secuencias.length >= 1 && scifi.p.tomas.every(t => t.continuidad.every(c => /correcta|Primera/.test(c))) && scifi.p.tomas.some(t => t.inicial.some(e => e.arma)), "14 · ciencia ficción: combate con armas de la ficha y continuidad correcta");
const drama = genero("cine90", "corto", [["Rosa", "Julio, tenemos que hablar."], ["Julio", "Ahora no puedo."], ["Rosa", "Te vi con ella."]],
  [{ nombre: "Rosa", descripcion_maestra: "Mujer de 30 años. Vestido rojo." }, { nombre: "Julio", descripcion_maestra: "Hombre de 35 años. Camisa blanca." }]);
ok(drama.p.secuencias.length === 0 && drama.p.tomas.length === 0, "14 · drama sin acción física: no se inventan secuencias de acción");
const fruta: any = importarFiel({ capitulo: JSON.stringify({ clips: [[["Narrador", "Platanito corre y salta la cerca del colmado."]], [["Platanito", "¡Me escapé!"]]] }), personajes: JSON.stringify({ personajes: [{ nombre: "Platanito", descripcion_maestra: "Personaje con piel de plátano." }] }), style: "frutinovela", formato: "corto" });
const pf = planificarAccion(fruta.episode.scenes, fruta.characters);
ok(pf.tomas.length >= 1 && pf.tomas[0].tipo !== undefined && /vertical 9:16/.test(fruta.episode.scenes[0].imagePromptFlow), "14 · telenovela animada: la acción física se reconoce sin cambiar su formato 9:16");

// Transiciones del montaje: paso por negro al cambiar de secuencia y de lugar; nunca dentro del montaje paralelo
// ni donde ya hay tarjeta de tiempo.
const tr = transicionesDe(ep.scenes, plan, ep.guionJson.tarjetas);
ok(tr.map(t => t.antes).join() === "3,15", "transiciones: paso por negro antes de la escena 4 (oración → misión) y de la 16 (fin del recuerdo)");
ok(!tr.some(t => [6, 7, 8].includes(t.antes)) && !tr.some(t => ep.guionJson.tarjetas.some((k: any) => k.antes === t.antes)), "transiciones: el montaje paralelo (7–8) y las tarjetas de tiempo siguen a corte");
ok(ep.scenes.slice(15, 19).every((s: any) => /Orillas del río/.test(s.location)), "tras la visión, 16–19 siguen a orillas del río (no en casa ni entre nubes)");
ok(transicionesDe(ep.scenes, null).length === 0, "sin plan de acción no se inventan transiciones");

console.log(`${checks} comprobaciones del director de acción correctas.`);
