// Prueba de la lógica del proyecto largo (sin red ni navegador): npm test
import { normOutline, replaceNode, snapshot, restore, saveScript, rhythm, isProtected, diffLines, lineOf, mapNode, allScenes } from "../src/lib/outline";
let fallos = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? "ok" : "FALLA"} · ${m}`); if (!c) fallos++; };
let o = normOutline({ acts: [
  { title: "Acto I · El ayuno", sequences: [{ title: "Junto al Tigris", scenes: [
    { heading: "EXT. RÍO TIGRIS - AMANECER", summary: "Daniel ayuna y llora por su pueblo", objective: "entender la visión", obstacle: "silencio del cielo", consequence: "sigue orando", tension: 3, minutes: 2, source: "Daniel 10:2-4" },
    { heading: "INT. CASA DE DANIEL - NOCHE", summary: "Día 14 sin respuesta", objective: "perseverar", obstacle: "debilidad", consequence: "sigue", tension: 4, minutes: 1.5 }] }] },
  { title: "Acto II · La batalla invisible", sequences: [{ title: "El mensajero detenido", scenes: [
    { heading: "EXT. CIELO SOBRE PERSIA - VISIÓN", summary: "El príncipe de Persia se opone al mensajero", objective: "llegar a Daniel", obstacle: "el príncipe de Persia", consequence: "Miguel viene en su ayuda", tension: 9, minutes: 3, source: "Daniel 10:13" }] }] },
] }, "serie-daniel", 3, 20);
const s0 = o.acts[0].sequences[0].scenes[0].id, s1 = o.acts[0].sequences[0].scenes[1].id;
o = mapNode(o, s0, sc => ({ ...sc, locked: true }));
ok(isProtected(o, s0) && !isProtected(o, s1), "el candado protege solo la escena bloqueada");
let err = ""; try { replaceNode(o, s0, { summary: "x" }); } catch (e: any) { err = e.message; }
ok(/bloqueada/.test(err), "no se puede regenerar una escena bloqueada");
o = snapshot(o, "antes de regenerar");
o = replaceNode(o, o.acts[0].id, { title: "Acto I · Tres semanas", sequences: [{ title: "Nueva", scenes: [{ heading: "INT. HABITACIÓN", summary: "nueva", objective: "a", obstacle: "b" }] }] });
const ids = o.acts[0].sequences[0].scenes.map(s => s.id);
ok(ids.includes(s0) && !ids.includes(s1), "regenerar el acto conserva lo bloqueado y cambia el resto");
o = saveScript(o, s0, [{ type: "accion", text: "Daniel junto al río." }], "1");
o = saveScript(o, s0, [{ type: "accion", text: "Daniel junto al río, sin comer." }], "2");
const sc = allScenes(o).find(s => s.id === s0)!;
ok(sc.scriptHistory!.length === 1, "el guion guarda la versión anterior");
ok(diffLines(sc.scriptHistory![0].elements.map(lineOf), sc.script!.map(lineOf)).filter(d => d.op !== "=").length === 2, "la comparación marca la línea cambiada");
o = restore(o, o.history![0].at);
ok(o.acts[0].title === "Acto I · El ayuno" && allScenes(o).find(s => s.id === s0)!.scriptHistory!.length === 1, "volver a una versión recupera el acto y conserva el historial del guion");
ok(rhythm(o).total === 6.5, "el ritmo suma la duración de las escenas");
if (fallos) { console.log(`${fallos} prueba(s) fallaron`); process.exit(1); }
