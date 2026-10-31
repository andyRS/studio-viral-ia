// Proyecto largo (Facebook / YouTube, 15-25 min): actos → secuencias → escenas, con candado por pieza,
// regeneración parcial que respeta lo bloqueado, guion por escena con historial y análisis de ritmo.
// Lógica pura (sin React ni red): la usan StoryArchitect y la ruta /api/outline.
import { validarCitas, type Cita } from "./biblia";

export type ScriptElement = { type: "accion" | "dialogo" | "off" | "visual" | "sonido" | "nota"; speaker?: string; text: string };
export type ScriptVersion = { at: string; label: string; elements: ScriptElement[] };
export type OutlineScene = {
  id: string; heading: string; summary: string; objective: string; obstacle: string; consequence: string;
  tension: number; minutes: number; source?: string; locked?: boolean; envId?: string;
  script?: ScriptElement[]; scriptApproved?: boolean; scriptHistory?: ScriptVersion[];
  tomas?: import("./tomas").Toma[];   // fase 4: tomas de la escena (storyboard)
};
export type OutlineSequence = { id: string; title: string; goal: string; locked?: boolean; scenes: OutlineScene[] };
export type OutlineAct = { id: string; title: string; goal: string; locked?: boolean; sequences: OutlineSequence[] };
export type OutlineSnapshot = { at: string; label: string; acts: OutlineAct[] };
// Fuentes y canon: lo que sustenta la historia y de qué tipo es cada afirmación (texto bíblico, interpretación,
// tradición extrabíblica o invención cinematográfica). Solo fuentes propias (sin buscadores de pago).
export type Fuente = { id: string; tipo: "biblia" | "historica" | "documental" | "tradicion" | "otra"; ref?: string; titulo: string; url?: string; texto?: string; version?: string; nota?: string };
export type Categoria = "texto" | "interpretacion" | "tradicion" | "invencion";
export type Afirmacion = { id: string; texto: string; categoria: Categoria; fuentes: string[]; incertidumbre?: string };
export type Nivel = "textual" | "fundamentada" | "amplia";
export type Canon = { nivel: Nivel; fuentes: Fuente[]; afirmaciones: Afirmacion[]; revision?: { at: string; avisos: { sceneId: string; aviso: string }[] } };
// Escenarios: el decorado fijo de cada lugar; las escenas que lo usan respetan su ficha y sus cambios.
export type Escenario = {
  id: string; nombre: string; periodo: string; arquitectura: string; geografia: string; materiales: string; luz: string; clima: string;
  persistentes: string; atmosfera: string; objetos: string; imagenes: string[]; locked?: boolean;
  versiones: { at: string; nota: string }[];
};
export type Outline = {
  id?: string; seriesId: string; structure: 3 | 5; targetMinutes: number; acts: OutlineAct[];
  history?: OutlineSnapshot[]; updatedAt?: string; canon?: Canon; escenarios?: Escenario[];
  produccion?: import("./tomas").Produccion;   // fase 4: motor elegido, perfiles y tarifas
};
export const NIVELES: Record<Nivel, string> = {
  textual: "Estrictamente textual: solo lo que dice el texto; cada escena con su pasaje",
  fundamentada: "Interpretación fundamentada: se completa lo que el texto sugiere, sin contradecirlo",
  amplia: "Dramatización cinematográfica amplia: se inventan escenas y diálogos, marcados como invención",
};
export const CATEGORIAS: Record<Categoria, string> = { texto: "Texto bíblico", interpretacion: "Interpretación", tradicion: "Tradición extrabíblica", invencion: "Invención cinematográfica" };
export type NodeKind = "act" | "sequence" | "scene";

const clean = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
export const newId = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
const num = (v: unknown, d: number, min: number, max: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };

// ---------- Normalizar lo que devuelve la IA (ids nuevos, valores por defecto, nada fuera de rango) ----------
const ELEMENT_TYPES = new Set(["accion", "dialogo", "off", "visual", "sonido", "nota"]);
export function normScript(raw: unknown): ScriptElement[] {
  return (Array.isArray(raw) ? raw : []).map((e: any) => {
    const t = clean(e?.type).toLowerCase().replace("acción", "accion").replace("diálogo", "dialogo");
    const type = (ELEMENT_TYPES.has(t) ? t : e?.speaker ? "dialogo" : "accion") as ScriptElement["type"];
    return { type, ...(type === "dialogo" || type === "off" ? { speaker: clean(e?.speaker) || (type === "off" ? "Narrador" : "") } : {}), text: clean(e?.text) };
  }).filter(e => e.text);
}
export function normScene(r: any): OutlineScene {
  return {
    id: newId("esc"), heading: clean(r?.heading) || "INT. LUGAR - DÍA", summary: clean(r?.summary),
    objective: clean(r?.objective), obstacle: clean(r?.obstacle), consequence: clean(r?.consequence),
    tension: num(r?.tension, 5, 1, 10), minutes: num(r?.minutes, 1.2, 0.2, 6),
    ...(clean(r?.source) ? { source: clean(r?.source) } : {}),
  };
}
export function normSequence(r: any): OutlineSequence {
  return { id: newId("sec"), title: clean(r?.title) || "Secuencia", goal: clean(r?.goal), scenes: (Array.isArray(r?.scenes) ? r.scenes : []).map(normScene) };
}
export function normAct(r: any, i = 0): OutlineAct {
  return { id: newId("acto"), title: clean(r?.title) || `Acto ${i + 1}`, goal: clean(r?.goal), sequences: (Array.isArray(r?.sequences) ? r.sequences : []).map(normSequence) };
}
export function normOutline(raw: any, seriesId: string, structure: 3 | 5, targetMinutes: number): Outline {
  return { seriesId, structure, targetMinutes, acts: (Array.isArray(raw?.acts) ? raw.acts : []).map(normAct), history: [] };
}

// ---------- Recorrer y localizar piezas ----------
export const allScenes = (o: Outline) => o.acts.flatMap(a => a.sequences.flatMap(s => s.scenes));
export function findNode(o: Outline, id: string): { kind: NodeKind; node: any; act: OutlineAct; seq?: OutlineSequence } | null {
  for (const act of o.acts) {
    if (act.id === id) return { kind: "act", node: act, act };
    for (const seq of act.sequences) {
      if (seq.id === id) return { kind: "sequence", node: seq, act, seq };
      for (const sc of seq.scenes) if (sc.id === id) return { kind: "scene", node: sc, act, seq };
    }
  }
  return null;
}
// Una pieza está protegida si ella o alguna de sus contenedoras está bloqueada.
export function isProtected(o: Outline, id: string) {
  const f = findNode(o, id); if (!f) return false;
  return !!(f.node.locked || (f.kind !== "act" && f.act.locked) || (f.kind === "scene" && f.seq?.locked));
}

// ---------- Copia profunda y cambios inmutables ----------
const copy = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
export function mapNode(o: Outline, id: string, fn: (node: any) => any): Outline {
  const n = copy(o);
  n.acts = n.acts.map(a => a.id === id ? fn(a) : { ...a, sequences: a.sequences.map(s => s.id === id ? fn(s) : { ...s, scenes: s.scenes.map(sc => sc.id === id ? fn(sc) : sc) }) });
  return n;
}

// Regeneración parcial: la pieza nueva sustituye a la vieja, pero todo lo bloqueado que había dentro se queda
// tal cual y en su sitio (la IA nunca pisa una escena aprobada). Lo bloqueado conserva su id.
function keepLocked<T extends { id: string; locked?: boolean }>(oldItems: T[], newItems: T[]): T[] {
  const out = [...newItems];
  oldItems.forEach((it, i) => { if (it.locked) out.splice(Math.min(i, out.length), 0, it); });
  return out;
}
export function replaceNode(o: Outline, id: string, fresh: any): Outline {
  const f = findNode(o, id); if (!f) return o;
  if (isProtected(o, id)) throw new Error("Esa pieza está bloqueada: desbloquéala para regenerarla.");
  return mapNode(o, id, old => {
    if (f.kind === "scene") return { ...normScene(fresh), id: old.id, script: old.script, scriptHistory: old.scriptHistory };
    if (f.kind === "sequence") { const s = normSequence(fresh); return { ...s, id: old.id, scenes: keepLocked(old.scenes, s.scenes) }; }
    const a = normAct(fresh);
    const seqs = a.sequences.map((s, i) => ({ ...s, scenes: keepLocked(old.sequences[i]?.locked ? [] : old.sequences[i]?.scenes || [], s.scenes) }));
    return { ...a, id: old.id, sequences: keepLocked(old.sequences, seqs) };
  });
}

// ---------- Historial (versiones del proyecto y de cada guion) ----------
export function snapshot(o: Outline, label: string): Outline {
  const n = copy(o);
  const acts = copy(o.acts).map(a => ({ ...a, sequences: a.sequences.map(s => ({ ...s, scenes: s.scenes.map(({ scriptHistory: _h, ...sc }) => sc) })) }));
  n.history = [{ at: new Date().toISOString(), label, acts }, ...(o.history || [])].slice(0, 20);
  return n;
}
export function restore(o: Outline, at: string): Outline {
  const snap = (o.history || []).find(h => h.at === at); if (!snap) return o;
  const n = snapshot(o, "Antes de volver a una versión anterior");
  // Los historiales de guion de cada escena se conservan (no van en las versiones del proyecto).
  const hist = new Map(allScenes(o).map(s => [s.id, s.scriptHistory]));
  n.acts = copy(snap.acts).map(a => ({ ...a, sequences: a.sequences.map(s => ({ ...s, scenes: s.scenes.map(sc => ({ ...sc, scriptHistory: hist.get(sc.id) || [] })) })) }));
  return n;
}
export function saveScript(o: Outline, sceneId: string, elements: ScriptElement[], label: string): Outline {
  return mapNode(o, sceneId, sc => {
    const prev = sc.script?.length ? [{ at: new Date().toISOString(), label: `Antes de: ${label}`, elements: sc.script }] : [];
    return { ...sc, script: elements, scriptHistory: [...prev, ...(sc.scriptHistory || [])].slice(0, 15) };
  });
}

// Comparar dos versiones de un guion línea a línea (LCS): qué se quitó y qué se añadió.
export const lineOf = (e: ScriptElement) => `${e.type === "dialogo" || e.type === "off" ? `${(e.speaker || "").toUpperCase()}${e.type === "off" ? " (OFF)" : ""}: ` : e.type === "accion" ? "" : `[${e.type.toUpperCase()}] `}${e.text}`;
export function diffLines(a: string[], b: string[]): { op: "=" | "-" | "+"; text: string }[] {
  const m = a.length, n = b.length, L = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: { op: "=" | "-" | "+"; text: string }[] = [];
  let i = 0, j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) { out.push({ op: "=", text: a[i] }); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) out.push({ op: "-", text: a[i++] });
    else out.push({ op: "+", text: b[j++] });
  }
  while (i < m) out.push({ op: "-", text: a[i++] });
  while (j < n) out.push({ op: "+", text: b[j++] });
  return out;
}

// Duración estimada de un guion: diálogo a ~2,5 palabras/s y unos 2 s por cada línea de acción o visual.
export function scriptSeconds(els: ScriptElement[] = []) {
  return Math.round(els.reduce((t, e) => t + (e.type === "dialogo" || e.type === "off" ? e.text.split(/\s+/).length / 2.5 + 0.6 : e.type === "nota" ? 0 : 2), 0));
}

// ---------- Análisis de ritmo (sin IA: cálculo directo sobre la estructura) ----------
const IDEAL: Record<3 | 5, number[]> = { 3: [25, 50, 25], 5: [12, 22, 30, 22, 14] };
const words = (t: string) => new Set(t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-zñ]+/).filter(w => w.length > 3));
export function rhythm(o: Outline) {
  const sc = allScenes(o);
  const total = sc.reduce((t, s) => t + s.minutes, 0);
  const acts = o.acts.map((a, i) => {
    const min = a.sequences.reduce((t, s) => t + s.scenes.reduce((u, x) => u + x.minutes, 0), 0);
    const pct = total ? Math.round((min / total) * 100) : 0;
    const ideal = IDEAL[o.structure]?.[i] ?? Math.round(100 / o.acts.length);
    return { id: a.id, title: a.title, minutes: Math.round(min * 10) / 10, pct, ideal, desvio: pct - ideal };
  });
  const avisos: string[] = [];
  if (total && Math.abs(total - o.targetMinutes) > o.targetMinutes * 0.15) avisos.push(`Suma ${total.toFixed(1)} min y el objetivo es ${o.targetMinutes} min: ${total > o.targetMinutes ? "recorta o fusiona escenas" : "añade escenas o alarga las secuencias"}.`);
  for (const a of acts) if (Math.abs(a.desvio) > 10) avisos.push(`«${a.title}» ocupa el ${a.pct} % (lo habitual es ~${a.ideal} %): ${a.desvio > 0 ? "está largo" : "está corto"}.`);
  const tension = sc.map(s => s.tension);
  const maxI = tension.indexOf(Math.max(...tension, 0));
  if (sc.length >= 6 && maxI < sc.length * 0.6) avisos.push("El momento de más tensión llega demasiado pronto: el clímax debería estar en el último tercio.");
  const sinConflicto = sc.filter(s => !s.obstacle || !s.objective).length;
  if (sinConflicto) avisos.push(`${sinConflicto} escena(s) sin objetivo u obstáculo: una escena sin conflicto se siente de relleno.`);
  // Escenas redundantes: resúmenes que comparten la mayoría de sus palabras.
  const redundantes: [string, string][] = [];
  for (let i = 0; i < sc.length; i++) for (let j = i + 1; j < sc.length; j++) {
    const A = words(`${sc[i].summary} ${sc[i].objective}`), B = words(`${sc[j].summary} ${sc[j].objective}`);
    const inter = Array.from(A).filter(w => B.has(w)).length, uni = new Set([...Array.from(A), ...Array.from(B)]).size;
    if (uni >= 6 && inter / uni >= 0.5) redundantes.push([sc[i].id, sc[j].id]);
  }
  if (redundantes.length) avisos.push(`${redundantes.length} pareja(s) de escenas parecen repetir lo mismo: fusiónalas o dale a una un giro distinto.`);
  return { total: Math.round(total * 10) / 10, acts, tension, avisos, redundantes, escenas: sc.length, conGuion: sc.filter(s => s.script?.length).length, aprobadas: sc.filter(s => s.scriptApproved).length };
}

// ---------- Avisos de canon (sin IA): citas que no existen, fuentes sin registrar, afirmaciones mal clasificadas ----------
export function canonAvisos(o: Outline) {
  const canon = o.canon || { nivel: "fundamentada" as Nivel, fuentes: [], afirmaciones: [] };
  // Pasajes registrados como fuente: una escena está respaldada si su cita cae dentro de alguno.
  const registradas: Cita[] = canon.fuentes.filter(f => f.tipo === "biblia" && f.ref).flatMap(f => validarCitas(f.ref!).filter(v => v.ok).map(v => v.cita!));
  const cubre = (r: Cita, c: Cita) => r.libro === c.libro && r.cap === c.cap
    && (r.desde === undefined || (c.desde !== undefined && c.desde >= r.desde && (c.hasta ?? c.desde) <= (r.hasta ?? r.desde)));
  const avisos: { sceneId?: string; texto: string }[] = [];
  for (const f of canon.fuentes) if (f.tipo === "biblia" && f.ref) for (const v of validarCitas(f.ref)) if (!v.ok) avisos.push({ texto: `Fuente «${f.titulo || f.ref}»: ${v.error}` });
  for (const sc of allScenes(o)) {
    if (sc.source) {
      for (const v of validarCitas(sc.source)) {
        if (!v.ok) avisos.push({ sceneId: sc.id, texto: `${sc.heading}: la cita «${v.original}» no es válida (${v.error})` });
        else if (!registradas.some(r => cubre(r, v.cita!))) avisos.push({ sceneId: sc.id, texto: `${sc.heading}: cita ${v.cita!.texto} sin registrar en las fuentes del proyecto` });
      }
    } else if (canon.nivel === "textual") avisos.push({ sceneId: sc.id, texto: `${sc.heading}: en modo estrictamente textual, cada escena necesita su pasaje` });
  }
  const bibl = new Set(canon.fuentes.filter(f => f.tipo === "biblia").map(f => f.id));
  for (const a of canon.afirmaciones) {
    if (a.categoria === "texto" && !a.fuentes.some(id => bibl.has(id))) avisos.push({ texto: `«${a.texto.slice(0, 60)}»: marcada como texto bíblico, pero sin un pasaje bíblico que la respalde` });
    if (a.categoria === "tradicion" && !a.fuentes.some(id => !bibl.has(id))) avisos.push({ texto: `«${a.texto.slice(0, 60)}»: es tradición extrabíblica; regístrale su fuente (p. ej. Libro de Enoc)` });
  }
  for (const r of canon.revision?.avisos || []) avisos.push({ sceneId: r.sceneId, texto: `Posible contradicción con la fuente: ${r.aviso}` });
  return avisos;
}

// Escenarios a partir de los encabezados del guion («EXT. RIBERA DEL TIGRIS - AMANECER» → «Ribera del Tigris»).
export function lugarDe(heading: string) {
  const t = heading.replace(/^(INT\.?\/EXT\.?|EXT\.?\/INT\.?|INT\.?|EXT\.?)\s*/i, "").split(/\s+[-–]\s+/)[0].replace(/\(.*?\)/g, "").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : "";
}
export function nuevoEscenario(nombre: string): Escenario {
  return { id: newId("lugar"), nombre, periodo: "", arquitectura: "", geografia: "", materiales: "", luz: "", clima: "", persistentes: "", atmosfera: "", objetos: "", imagenes: [], versiones: [] };
}
export function detectarEscenarios(o: Outline): Outline {
  const n = copy(o);
  const lista = [...(n.escenarios || [])];
  const porNombre = new Map(lista.map(e => [e.nombre.toLowerCase(), e]));
  for (const a of n.acts) for (const s of a.sequences) for (const sc of s.scenes) {
    if (sc.envId && lista.some(e => e.id === sc.envId)) continue;
    const nombre = lugarDe(sc.heading); if (!nombre) continue;
    let e = porNombre.get(nombre.toLowerCase());
    if (!e) { e = nuevoEscenario(nombre); lista.push(e); porNombre.set(nombre.toLowerCase(), e); }
    sc.envId = e.id;
  }
  n.escenarios = lista;
  return n;
}
// Texto compacto de un escenario para la IA (y, en la fase 4, para los prompts de imagen y vídeo).
export const escenarioTexto = (e: Escenario) => [e.nombre, e.periodo && `época: ${e.periodo}`, e.arquitectura && `arquitectura: ${e.arquitectura}`, e.geografia && `geografía: ${e.geografia}`,
  e.materiales && `materiales: ${e.materiales}`, e.luz && `luz: ${e.luz}`, e.clima && `clima: ${e.clima}`, e.persistentes && `siempre presente: ${e.persistentes}`,
  e.atmosfera && `atmósfera: ${e.atmosfera}`, e.objetos && `objetos importantes: ${e.objetos}`, e.versiones.length ? `cambios: ${e.versiones.map(v => v.nota).join("; ")}` : ""].filter(Boolean).join(" · ");
