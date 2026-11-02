// Formato épico (16:9): título tras la primera secuencia, destello blanco en la visión y planos de recurso. npm test
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { importarFiel, redirigirEpisodio } from "../src/lib/importacion";
import { planificarAccion, transicionesDe } from "../src/lib/accion";
import { planEpico } from "../src/lib/formatoEpico";

let checks = 0;
const ok = (c: boolean, m: string) => { assert.ok(c, m); checks++; console.log(`ok · ${m}`); };
const imp: any = importarFiel({ capitulo: readFileSync("tests/fixtures/daniel_ep01_capitulo.json", "utf8"), personajes: readFileSync("tests/fixtures/daniel_ep01_personajes.json", "utf8"), formato: "largo" });
const ep: any = redirigirEpisodio(imp.episode, imp.characters, "epica", "16:9").propuesta;
const antes = JSON.stringify(ep);
const trans = transicionesDe(ep.scenes, planificarAccion(ep.scenes, ep.cast || imp.characters), ep.guionJson.tarjetas || []);
const P = planEpico(ep.scenes, trans, ep.guionJson.tarjetas || []);
console.log(P.resumen, JSON.stringify(P.transiciones.map(t => [t.antes, t.tipo])), P.recursos.map(r => `${r.n}:${r.tipo}`).join(" "));

ok(JSON.stringify(ep) === antes, "proponer el formato épico no toca el episodio (guion, escenas, personajes)");
ok(P.tituloTras !== null && P.tituloTras >= 2 && P.transiciones.some(t => t.antes === P.tituloTras), "el título va tras la primera secuencia (en el primer cambio de secuencia)");
ok(P.transiciones.length <= trans.length + 1 && P.transiciones.filter(t => t.tipo === "blanco").length <= 1, "las transiciones siguen siendo pocas: negro entre secuencias y un solo destello blanco (la entrada en la visión)");
ok(P.recursos.filter(r => r.tipo === "lugar").length >= 2 && P.recursos[0].tipo === "lugar" && P.recursos[0].clip === 0, "plano de lugar al abrir y al empezar cada secuencia");
ok(new Set(P.recursos.map(r => r.n)).size === P.recursos.length, "como mucho un plano de recurso por escena");
const encima = P.recursos.filter(r => r.tipo !== "lugar").map(r => r.clip);
ok(encima.length > 0 && encima.every((c, i) => i === 0 || c - encima[i - 1] > 1), "reacciones y detalles en frases largas, nunca en dos escenas seguidas");
ok(P.recursos.every(r => /16:9, 5 seconds/.test(r.prompt) && !/9:16/.test(r.prompt) && /no subtitles/.test(r.prompt)), "los prompts de recurso son 16:9, 5 s, sin texto");
ok(P.recursos.filter(r => r.tipo === "reaccion").every(r => /does NOT speak/.test(r.prompt) && /master reference/.test(r.prompt)), "la reacción pide boca cerrada y la identidad de la ficha");
const vision = planEpico([{ n: 1, location: "Orillas del río", line: "a" }, { n: 2, location: "Orillas del río", line: "b" }, { n: 3, location: "Visión celestial", line: "c" }], [], []);
ok(vision.transiciones.some(t => t.antes === 2 && t.tipo === "blanco"), "al entrar en una visión hay destello blanco");
ok(planEpico([], [], []).tituloTras === null && planEpico([], [], []).recursos.length === 0, "sin escenas no se propone nada");
console.log(`${checks} comprobaciones del formato épico correctas.`);
