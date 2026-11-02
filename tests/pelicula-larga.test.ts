// Película larga (hasta 330 tomas ≈ 40 min): importación sin tope de 30 y montaje por partes de 80. npm test
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { importarFiel } from "../src/lib/importacion";
import { MAX_ESCENAS_PELICULA } from "../src/lib/production";
import { guionDeParte, partesDeMontaje } from "../src/lib/partes";

let checks = 0;
const ok = (c: boolean, m: string) => { assert.ok(c, m); checks++; console.log(`ok · ${m}`); };
// Capítulo de 220 tomas: el de Daniel repetido 11 veces (mismos personajes), con tarjetas cada 55.
const base = JSON.parse(readFileSync("tests/fixtures/daniel_ep01_capitulo.json", "utf8"));
const clips = Array.from({ length: 220 }, (_, i) => base.clips[i % base.clips.length]);
const cap = { ...base, clips, tarjetas: [{ antes: 55, texto: "ACTO II" }, { antes: 110, texto: "ACTO III" }, { antes: 162, texto: "ACTO IV" }] };
const pj = readFileSync("tests/fixtures/daniel_ep01_personajes.json", "utf8");
const imp: any = importarFiel({ capitulo: JSON.stringify(cap), personajes: pj, formato: "largo" });
ok(imp.episode.scenes.length === 220, "un guion JSON de 220 tomas se importa entero (antes se cortaba en 30)");
ok(imp.episode.scenes.every((s: any, i: number) => s.line === clips[i][0][1] && s.speaker === clips[i][0][0]), "en modo fidelidad las 220 frases, hablantes y orden quedan intactos");
ok(imp.episode.guionJson.clips.length === 220 && imp.episode.scenes.every((s: any) => /16:9/.test(s.animationPrompt) && !/9:16/.test(s.animationPrompt)), "las 220 tomas tienen prompt 16:9 y bloque de montaje");
const grande = { ...cap, clips: Array.from({ length: 400 }, (_, i) => base.clips[i % base.clips.length]), tarjetas: [] };
const imp400: any = importarFiel({ capitulo: JSON.stringify(grande), personajes: pj, formato: "largo" });
ok(imp400.episode.scenes.length === MAX_ESCENAS_PELICULA && /trae 400/.test(JSON.stringify(imp400)), `el máximo es ${MAX_ESCENAS_PELICULA} tomas (≈ 40 min) y se avisa de lo que sobra`);

// Montaje por partes.
const P = partesDeMontaje(220, [55, 110, 162]);
ok(P.length === 3 && P.every(p => p.hasta - p.desde <= 80) && P[0].desde === 0 && P.at(-1)!.hasta === 220 && P.every((p, k) => k === 0 || p.desde === P[k - 1].hasta), "220 tomas → 3 partes de 80 como mucho, seguidas y sin huecos");
ok(partesDeMontaje(60).length === 1 && partesDeMontaje(80).length === 1 && partesDeMontaje(81).length === 2, "hasta 80 tomas es una sola parte, como antes");
ok(partesDeMontaje(330).every(p => p.hasta - p.desde <= 80 && p.hasta - p.desde >= 10) && partesDeMontaje(330).length === 5, "330 tomas (40 min) → 5 partes");
const P2 = partesDeMontaje(150, [72]);
ok(P2[0].hasta === 72 && partesDeMontaje(160, [79])[0].hasta === 80, "si hay un cambio de secuencia cerca del corte ideal, la parte se corta ahí (si el resto cabe en 80)");
const g = { clips, formato: "16:9", titulo_pelicula: { titulo: "Daniel" }, titulo_tras: 3, gancho: ["a", "b"], cierre: "FIN", tarjetas: cap.tarjetas,
  transiciones: [{ antes: 3, tipo: "blanco" }, { antes: 100, tipo: "negro" }], tiempos: [{ clip: 5, margen: 2 }, { clip: 120, margen: 3 }], recursos_plan: [{ n: 1, clip: 0, tipo: "lugar" }, { n: 101, clip: 100, tipo: "lugar" }] };
const g1 = guionDeParte(g, P[0], P.length), g2 = guionDeParte(g, P[1], P.length), g3 = guionDeParte(g, P[2], P.length);
ok(g1.clips.length + g2.clips.length + g3.clips.length === 220 && g2.clips[0] === clips[P[1].desde], "cada parte lleva solo sus clips");
ok(g1.titulo_pelicula && g1.titulo_tras === 3 && !g2.titulo_pelicula && !g2.titulo_tras && g2.gancho.length === 0, "el título solo en la primera parte; las demás siguen sin gancho ni título");
ok(!g1.cierre && !g2.cierre && g3.cierre === "FIN", "la tarjeta final solo en la última parte");
ok(g2.transiciones.every((t: any) => t.antes > 0 && t.antes < g2.clips.length) && g2.tiempos.every((t: any) => t.clip < g2.clips.length) && g2.recursos_plan.every((r: any) => r.clip >= 0 && r.clip < g2.clips.length),
  "transiciones, tiempos y recursos se renumeran dentro de su parte");
ok(g2.transiciones.some((t: any) => t.antes === 100 - P[1].desde) || P[1].desde > 100 || P[1].hasta <= 100, "una transición cae en la parte que la contiene");
console.log(`${checks} comprobaciones de la película larga correctas.`);
