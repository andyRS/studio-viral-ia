// Prueba de la lógica del proyecto largo (sin red ni navegador): npm test
import { validarCita, validarCitas } from "../src/lib/biblia";
import { bibliaTexto } from "../src/lib/personajes";
import { capitulos, guionDeActo } from "../src/lib/distribucion";
import { dividirEscena, duracionClip, partirToma, planProduccion, PERFILES_BASE, promptsDeToma } from "../src/lib/tomas";
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

// Fase 4: tomas, prompts por motor y plan de producción
const flow = PERFILES_BASE.find(p => p.id === "flow")!, kling = PERFILES_BASE.find(p => p.id === "kling")!, seed = PERFILES_BASE.find(p => p.id === "seedance")!;
const escena = { ...allScenes(c)[0], script: [
  { type: "accion" as const, text: "Daniel se arrodilla junto al río." }, { type: "sonido" as const, text: "agua corriendo" },
  { type: "dialogo" as const, speaker: "Daniel", text: "Señor, han pasado veintiún días y sigo esperando tu respuesta." },
  { type: "off" as const, speaker: "Narrador", text: "Y entonces alzó los ojos." }] };
const ts = dividirEscena(escena, flow);
ok(ts.length === 3 && ts[1].dialogo?.speaker === "Daniel" && ts.every(t => t.duracion <= 8), "dividir sin IA: una toma por frase y ninguna pasa del clip del motor");
ok(duracionClip(6, seed) === 8 && duracionClip(12, kling) === 10, "el clip pedido es la duración admitida más cercana por arriba");
const ctxP = { style: "epica" as any, formato: "16:9", personajes: [{ name: "Daniel", visualES: "anciano hebreo", bible: { negativo: "ropa moderna", voz: "grave" } }] };
const pf = promptsDeToma(ts[1], flow, ctxP), pk = promptsDeToma(ts[1], kling, ctxP), ps = promptsDeToma(ts[1], seed, ctxP);
ok(/Daniel dice: «Señor/.test(pf.video) && /SIN AUDIO/.test(pk.video) && !/dice:/.test(pk.video), "el diálogo va en el vídeo solo si el motor tiene audio");
ok(ps.video.startsWith("Usa Seedance 2.5.") && /nunca: ropa moderna/.test(ps.video) && /horizontal 16:9/.test(ps.video) && !/vertical 9:16/.test(ps.video), "prefijo del motor, ficha del personaje y formato 16:9");
const pa = promptsDeToma(ts[0], flow, ctxP);
ok(/anciano hebreo/.test(pa.video) && !/Nadie más/.test(pa.video) && !/\.\./.test(pa.video), "la acción que nombra a un personaje trae su ficha y sin puntos dobles");
const [t1, t2] = partirToma({ ...ts[0], duracion: 14 });
ok(t1.duracion + t2.duracion === 14 && /anterior/.test(t2.frameInicial), "partir una toma larga conserva la duración y enlaza los fotogramas");
let pl = planProduccion(c, flow);
ok(pl.creditos === null && pl.usd === null && pl.tomas > 0, "sin tarifa del usuario no hay coste inventado");
pl = planProduccion(c, { ...flow, creditosSegundo: 2, creditosImagen: 0, usdCredito: 0.01, reintentos: 1 });
ok(pl.creditos === pl.segundosClips * 2 && pl.usd === Math.round(pl.creditos! * 0.01 * 100) / 100, "con tarifa, el coste sale de los segundos generados");

// Fase 5: guion de montaje por acto y capítulos
let lp = normOutline({ acts: [
  { title: "Acto I", sequences: [{ title: "El ayuno", scenes: [{ heading: "EXT. RÍO TIGRIS - AMANECER", summary: "Daniel ora.", tension: 4, minutes: 1 }, { heading: "EXT. CIELO - VISIÓN", summary: "Tres semanas después, el ángel lucha contra el príncipe de Persia.", tension: 9, minutes: 1 }] }] },
  { title: "Acto II", sequences: [{ title: "La respuesta", scenes: [{ heading: "EXT. RÍO", summary: "El ángel llega.", tension: 6, minutes: 1 }] }] }] }, "s", 3, 20);
const [e1, e2, e3] = allScenes(lp);
lp = mapNode(lp, e1.id, n => ({ ...n, tomas: dividirEscena({ ...e1, script: escena.script }, flow) }));
lp = mapNode(lp, e2.id, n => ({ ...n, tomas: dividirEscena({ ...e2, script: [{ type: "dialogo", speaker: "Ángel", text: "El príncipe de Persia se me opuso." }] }, flow) }));
lp = mapNode(lp, e3.id, n => ({ ...n, tomas: dividirEscena({ ...e3, script: [{ type: "accion", text: "Llega la luz." }] }, flow) }));
const g1 = guionDeActo(lp, 0, { titulo: "Daniel", characters: [{ name: "Daniel", subtitleColor: "#7fd1ff" }], gancho: ["Veintiún días", "sin respuesta"] });
const g2 = guionDeActo(lp, 1, { titulo: "Daniel", characters: [] });
ok(g1.formato === "16:9" && g1.clips.length === 4 && g1.colores.DANIEL === "7FD1FF" && g1.colores["ÁNGEL"] === "FFFFFF", "guion del acto: una entrada por toma, colores en mayúsculas y 16:9");
ok(!!g1.gancho && !("cierre" in g1) && g2.cierre === "FIN" && !("gancho" in g2), "gancho solo en el primer acto y «FIN» solo en el último");
ok(g1.tarjetas?.[0]?.antes === 3 && /Tres semanas después/i.test(g1.tarjetas[0].texto), "salto de tiempo entre escenas como tarjeta");
ok(g1.recortes?.length === 1 && g1.recortes[0].desde === 3, "clip vertical de la escena de más tensión");
const cp = capitulos(lp);
ok(cp[0].startsWith("0:00 ") && cp.length === 2, "capítulos de YouTube empiezan en 0:00, uno por secuencia");
if (fallos) { console.log(`${fallos} prueba(s) fallaron`); process.exit(1); }
