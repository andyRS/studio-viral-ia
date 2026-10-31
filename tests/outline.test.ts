// Prueba de la lógica del proyecto largo (sin red ni navegador): npm test
import { validarCita, validarCitas } from "../src/lib/biblia";
import { bibliaTexto } from "../src/lib/personajes";
import { canonAvisos, detectarEscenarios, lugarDe, normOutline, replaceNode, snapshot, restore, saveScript, rhythm, isProtected, diffLines, lineOf, mapNode, allScenes } from "../src/lib/outline";
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

// Fase 3: citas, canon, escenarios y biblia del personaje
ok(validarCita("Daniel 10:13").ok && !validarCita("Daniel 10:40").ok, "Daniel 10:13 existe y Daniel 10:40 no");
ok(validarCita("Judas 14-15").cita?.texto === "Judas 14-15" && validarCita("Apocalipsis 12:7").ok, "libros de un capítulo y Apocalipsis");
ok(/tradición/.test(validarCita("Enoc 6:1").error || ""), "Enoc se señala como texto extrabíblico");
ok(validarCitas("Daniel 10:2-4 y 10:13").every(v => v.ok && v.cita!.libro === "Daniel"), "varias citas con el libro sobreentendido");
let c = normOutline({ acts: [{ title: "A", sequences: [{ title: "S", scenes: [
  { heading: "EXT. RÍO TIGRIS - AMANECER", summary: "x", source: "Daniel 10:4" },
  { heading: "EXT. RÍO TIGRIS - NOCHE", summary: "y", source: "Daniel 10:99" }] }] }] }, "s", 3, 20);
let av = canonAvisos(c);
ok(av.some(a => /no es válida/.test(a.texto)) && av.some(a => /sin registrar/.test(a.texto)), "avisa de cita inválida y de pasaje sin registrar");
c = { ...c, canon: { nivel: "fundamentada", fuentes: [{ id: "f1", tipo: "biblia", titulo: "Daniel 10", ref: "Daniel 10:1-21" }], afirmaciones: [] } };
ok(!canonAvisos(c).some(a => /sin registrar/.test(a.texto)), "un pasaje registrado cubre las escenas que caen dentro");
ok(lugarDe("EXT. RÍO TIGRIS - AMANECER") === "Río tigris", "el escenario sale del encabezado");
const d = detectarEscenarios(c);
ok(d.escenarios!.length === 1 && allScenes(d).every(s => s.envId === d.escenarios![0].id), "dos escenas en el mismo lugar comparten escenario");
const t = bibliaTexto({ name: "Daniel", visualES: "joven hebreo", bible: { negativo: "ropa moderna", candado: true, vestuario: ["túnica de lino"] } });
ok(/nunca: ropa moderna/.test(t) && /BLOQUEADA/.test(t) && /túnica de lino/.test(t), "la biblia del personaje llega completa a la IA");
if (fallos) { console.log(`${fallos} prueba(s) fallaron`); process.exit(1); }
