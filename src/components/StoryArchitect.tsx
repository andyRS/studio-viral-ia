"use client";
// Proyecto largo (Facebook / YouTube, 15-25 min): estructura por actos → secuencias → escenas, candados,
// regeneración parcial que respeta lo bloqueado, análisis de ritmo, versiones y editor de guion con historial.
import { useMemo, useRef, useState } from "react";
import { useData } from "@/lib/DataContext";
import { CanonPanel, EscenariosPanel } from "@/components/CanonPanels";
import { bibliaTexto } from "@/lib/personajes";
import { postApi } from "@/lib/api-client";
import {
  allScenes, canonAvisos, diffLines, findNode, isProtected, lineOf, mapNode, normOutline, replaceNode, restore, rhythm, saveScript,
  scriptSeconds, snapshot, type NodeKind, type Outline, type OutlineScene, type ScriptElement,
} from "@/lib/outline";

const TIPOS: { id: ScriptElement["type"]; label: string }[] = [
  { id: "accion", label: "Acción" }, { id: "dialogo", label: "Diálogo" }, { id: "off", label: "Narración en off" },
  { id: "visual", label: "Indicación visual" }, { id: "sonido", label: "Sonido" }, { id: "nota", label: "Nota de dirección" },
];
const mmss = (min: number) => `${Math.floor(min)}:${String(Math.round((min % 1) * 60)).padStart(2, "0")}`;

export default function StoryArchitect({ series, style, cast, characters = [], defaultOpen }: { series: any; style: string; cast: string[]; characters?: any[]; defaultOpen?: boolean }) {
  const { data, insert, update, isLocalOnly } = useData();
  const saved = (data.storyOutlines || []).find((o: any) => o.seriesId === series?.id) as Outline | undefined;
  const [open, setOpen] = useState(!!defaultOpen);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [estructura, setEstructura] = useState<3 | 5>(3);
  const [minutos, setMinutos] = useState(20);
  const [notas, setNotas] = useState("");
  const [abierta, setAbierta] = useState<string | null>(null);   // escena con el editor de guion abierto
  const [verHistorial, setVerHistorial] = useState(false);
  const [pestaña, setPestaña] = useState<"estructura" | "canon" | "escenarios">("estructura");
  const parar = useRef(false);
  const r = useMemo(() => saved?.acts.length ? rhythm(saved) : null, [saved]);
  const avisosPorEscena = useMemo(() => {
    const m = new Map<string, string[]>();
    if (saved) for (const a of canonAvisos(saved)) if (a.sceneId) m.set(a.sceneId, [...(m.get(a.sceneId) || []), a.texto]);
    return m;
  }, [saved]);
  if (!series) return null;
  // Proyecto base para poder cargar fuentes y escenarios antes de crear la estructura.
  const base: Outline = saved || { seriesId: series.id, structure: 3, targetMinutes: 20, acts: [] };

  async function guardar(o: Outline) {
    const item = { ...o, seriesId: series.id, updatedAt: new Date().toISOString() };
    if (saved?.id) await update("storyOutlines", saved.id, item); else await insert("storyOutlines", item);
  }
  async function ia(body: any) {
    const personajes = characters.map(bibliaTexto).filter(Boolean);
    const res = await postApi("/api/outline", { canon: saved?.canon, escenarios: saved?.escenarios, personajes, ...body, style, title: series.title, idea: series.description, cast });
    if (res.status === 401) throw new Error("Inicia sesión para usar la IA.");
    if (!res.json?.ok) throw new Error(res.json?.error || `HTTP ${res.status}`);
    return res.json.data;
  }
  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label); setMsg("");
    try { await fn(); } catch (e: any) { setMsg(e?.message || String(e)); } finally { setBusy(""); }
  };

  const crear = () => run("Creando la estructura…", async () => {
    const d = await ia({ action: "estructura", structure: estructura, minutes: minutos, notes: notas });
    const o = { ...normOutline(d, series.id, d.structure, d.minutes), id: saved?.id, canon: saved?.canon, escenarios: saved?.escenarios, history: saved?.history };
    o.acts = d.acts;
    await guardar(o);
    setMsg(`Estructura creada: ${o.acts.length} actos y ${allScenes(o).length} escenas. Revisa, bloquea lo que te guste y regenera solo lo que no.`);
  });
  const regenerar = (id: string, kind: NodeKind) => run("Regenerando…", async () => {
    if (!saved) return;
    if (isProtected(saved, id)) throw new Error("Esa pieza está bloqueada: desbloquéala para regenerarla.");
    const wish = window.prompt("¿Qué quieres cambiar? (opcional: déjalo vacío para que la IA la mejore)") ?? null;
    if (wish === null) return;
    const node = findNode(saved, id)?.node;
    const d = await ia({ action: "regenerar", kind, node, outline: saved, wish });
    await guardar(replaceNode(snapshot(saved, `Antes de regenerar «${node?.title || node?.heading}»`), id, d.node));
  });
  const revisarIA = () => run("Revisando las escenas contra las fuentes…", async () => {
    if (!saved?.acts.length) throw new Error("Primero crea la estructura.");
    if (!(saved.canon?.fuentes || []).some(f => f.texto)) throw new Error("Registra al menos una fuente con su texto (en un pasaje bíblico, pulsa «Traer el texto»).");
    const d = await ia({ action: "revisar", outline: saved });
    const canon = saved.canon || { nivel: "fundamentada" as const, fuentes: [], afirmaciones: [] };
    await guardar({ ...saved, canon: { ...canon, revision: d } });
    setMsg(d.avisos?.length ? `La revisión encontró ${d.avisos.length} posible(s) contradicción(es): aparecen en cada escena.` : "Revisión hecha: ninguna escena contradice las fuentes registradas.");
  });
  const toggleLock = (id: string) => saved && guardar(mapNode(saved, id, n => ({ ...n, locked: !n.locked })));
  const editar = (id: string, campo: string, valor: any) => saved && guardar(mapNode(saved, id, n => ({ ...n, [campo]: valor })));

  async function escribirGuion(sc: OutlineScene, wish = "") {
    if (!saved) return;
    const lista = allScenes(saved); const i = lista.findIndex(x => x.id === sc.id);
    const d = await ia({ action: "guion", scene: sc, wish, current: sc.script, before: lista[i - 1]?.summary, after: lista[i + 1]?.summary });
    return d.elements as ScriptElement[];
  }
  // Escribe el guion de todas las escenas que aún no lo tienen; se guarda escena por escena (se puede parar y seguir).
  const escribirPendientes = () => run("Escribiendo guiones…", async () => {
    if (!saved) return;
    parar.current = false;
    let o = saved; let n = 0;
    for (const sc of allScenes(o)) {
      if (parar.current) break;
      if (sc.script?.length || isProtected(o, sc.id)) continue;
      setBusy(`Escribiendo guiones… (${++n}) ${sc.heading}`);
      const els = await escribirGuion(sc);
      if (!els) continue;
      o = saveScript(o, sc.id, els, "guion escrito por la IA");
      await guardar(o);
    }
    setMsg(parar.current ? `Pausado: ${n} guion(es) escritos. Pulsa otra vez para seguir donde quedó.` : `Listo: ${n} guion(es) escritos.`);
  });

  return <section className="rounded-2xl border border-white/10 bg-[#121826]">
    <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-3 p-4 text-left">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-violet-500/20 text-violet-200">🎬</span>
      <span className="min-w-0 flex-1"><b className="block">Proyecto largo · actos y escenas</b>
        <span className="text-xs text-slate-400">{saved && r ? `${saved.acts.length} actos · ${r.escenas} escenas · ${mmss(r.total)} de ${saved.targetMinutes} min · ${r.conGuion} con guion · ${r.aprobadas} aprobadas` : "Para Facebook y YouTube (15-25 min): estructura por actos, guion por escena, candados y versiones."}</span></span>
      <span className="text-slate-400">{open ? "▲" : "▼"}</span>
    </button>
    {open && <div className="space-y-4 border-t border-white/10 p-4">
      {isLocalOnly("storyOutlines") && <p className="rounded-lg border border-amber-400/25 bg-amber-400/[.06] p-2 text-xs text-amber-100">Se guarda en este navegador hasta que ejecutes la migración supabase/migrations/20261102_story_outlines.sql.</p>}
      {busy && <p role="status" className="text-sm text-sky-200">{busy} {busy.startsWith("Escribiendo") && <button type="button" onClick={() => { parar.current = true; }} className="ml-2 rounded border border-white/20 px-2 py-0.5 text-xs">Parar</button>}</p>}
      {msg && <p role="status" className="rounded-lg bg-white/5 p-2 text-sm text-slate-200">{msg}</p>}

      <div role="tablist" className="flex flex-wrap gap-1 rounded-xl bg-white/5 p-1 text-xs">
        {([["estructura", "Estructura"], ["canon", `Fuentes y canon${saved?.canon?.fuentes?.length ? ` (${saved.canon.fuentes.length})` : ""}`], ["escenarios", `Escenarios${saved?.escenarios?.length ? ` (${saved.escenarios.length})` : ""}`]] as const).map(([id, label]) =>
          <button key={id} type="button" role="tab" aria-selected={pestaña === id} onClick={() => setPestaña(id)} className={`rounded-lg px-3 py-1.5 ${pestaña === id ? "bg-violet-500 font-semibold text-white" : "text-slate-300"}`}>{label}</button>)}
      </div>
      {pestaña === "canon" && <CanonPanel outline={base} guardar={guardar} revisarIA={revisarIA} busy={!!busy} />}
      {pestaña === "escenarios" && <EscenariosPanel outline={base} guardar={guardar} busy={!!busy} />}

      {pestaña === "estructura" && !saved?.acts.length && <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs text-slate-300">Estructura<select value={estructura} onChange={e => setEstructura(Number(e.target.value) as 3 | 5)} className="mt-1"><option value={3}>3 actos</option><option value={5}>5 actos</option></select></label>
        <label className="text-xs text-slate-300">Duración del episodio<select value={minutos} onChange={e => setMinutos(Number(e.target.value))} className="mt-1">{[10, 15, 20, 25, 30].map(m => <option key={m} value={m}>{m} min</option>)}</select></label>
        <label className="text-xs text-slate-300 sm:col-span-3">Notas para la IA (opcional)<textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2} className="mt-1" placeholder="Ej.: fuente principal Daniel 10; anticipar el conflicto con el príncipe de Grecia…" /></label>
        <button type="button" disabled={!!busy} onClick={crear} className="rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50 sm:col-span-3">Crear la estructura con IA</button>
      </div>}

      {pestaña === "estructura" && saved && r && <>
        {/* Ritmo: duración por acto frente a lo habitual, curva de tensión y avisos */}
        <div className="rounded-xl border border-white/10 p-3">
          <p className="text-xs font-semibold text-slate-300">Ritmo · {mmss(r.total)} de {saved.targetMinutes} min</p>
          <div className="mt-2 flex h-3 overflow-hidden rounded-full bg-white/5" aria-label="Duración por acto">{r.acts.map((a, i) => <div key={a.id} title={`${a.title}: ${a.pct} % (habitual ~${a.ideal} %)`} style={{ width: `${a.pct}%` }} className={["bg-sky-500", "bg-violet-500", "bg-amber-500", "bg-rose-500", "bg-emerald-500"][i % 5]} />)}</div>
          <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-slate-400">{r.acts.map(a => <span key={a.id}>{a.title}: {a.pct} % <span className={Math.abs(a.desvio) > 10 ? "text-amber-300" : "text-slate-500"}>(~{a.ideal} %)</span></span>)}</div>
          <div className="mt-2 flex h-10 items-end gap-0.5" aria-label="Curva de tensión">{r.tension.map((t, i) => <div key={i} title={`Escena ${i + 1}: tensión ${t}`} style={{ height: `${t * 10}%` }} className="flex-1 rounded-t bg-gradient-to-t from-violet-500/40 to-rose-400/80" />)}</div>
          {r.avisos.length > 0 && <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-amber-200">{r.avisos.map((a, i) => <li key={i}>{a}</li>)}</ul>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!!busy} onClick={escribirPendientes} className="rounded-lg bg-violet-500 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Escribir los guiones pendientes ({r.escenas - r.conGuion})</button>
          <button type="button" onClick={() => setVerHistorial(!verHistorial)} className="rounded-lg border border-white/15 px-3 py-2 text-xs text-slate-200">Versiones del proyecto ({saved.history?.length || 0})</button>
        </div>
        {verHistorial && <ul className="space-y-1 rounded-xl border border-white/10 p-3 text-xs">{(saved.history || []).map(h => <li key={h.at} className="flex flex-wrap items-center gap-2">
          <span className="text-slate-400">{new Date(h.at).toLocaleString("es-DO")}</span><span className="text-slate-200">{h.label}</span>
          <button type="button" onClick={() => { if (confirm("¿Volver a esta versión? La actual se guarda en el historial.")) void guardar(restore(saved, h.at)); }} className="text-sky-300 underline">Volver a esta versión</button></li>)}
          {!saved.history?.length && <li className="text-slate-500">Aún no hay versiones anteriores: se guardan solas antes de cada regeneración.</li>}</ul>}

        {saved.acts.map((act, ai) => <div key={act.id} className="rounded-xl border border-white/10">
          <Cabecera titulo={act.title} meta={act.goal} locked={!!act.locked} busy={!!busy} onLock={() => toggleLock(act.id)} onRegen={() => regenerar(act.id, "act")} onTitulo={v => editar(act.id, "title", v)} etiqueta={`Acto ${ai + 1}`} />
          <div className="space-y-2 p-3 pt-0">{act.sequences.map(seq => <div key={seq.id} className="rounded-lg border border-white/5 bg-white/[.02]">
            <Cabecera titulo={seq.title} meta={seq.goal} locked={!!seq.locked || !!act.locked} busy={!!busy} onLock={() => toggleLock(seq.id)} onRegen={() => regenerar(seq.id, "sequence")} onTitulo={v => editar(seq.id, "title", v)} etiqueta="Secuencia" pequeño />
            <ol className="space-y-2 p-2 pt-0">{seq.scenes.map(sc => {
              const prot = isProtected(saved, sc.id);
              const redundante = r.redundantes.some(p => p.includes(sc.id));
              return <li key={sc.id} className={`rounded-lg border p-2 text-xs ${sc.locked ? "border-emerald-400/30 bg-emerald-400/[.04]" : redundante ? "border-amber-400/30" : "border-white/10"}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <b className="text-slate-100">{sc.heading}</b>
                  <span className="text-slate-500">{mmss(sc.minutes)} · tensión {sc.tension}</span>
                  {sc.source && <span className="rounded bg-amber-300/10 px-1.5 text-amber-200">📖 {sc.source}</span>}
                  {redundante && <span className="text-amber-300">parece repetida</span>}
                  {!!avisosPorEscena.get(sc.id)?.length && <span title={avisosPorEscena.get(sc.id)!.join("\n")} className="rounded bg-rose-400/15 px-1.5 text-rose-200">⚠ canon ({avisosPorEscena.get(sc.id)!.length})</span>}
                  {sc.scriptApproved && <span className="text-emerald-300">guion aprobado</span>}
                  <span className="ml-auto flex gap-2">
                    <button type="button" onClick={() => toggleLock(sc.id)} disabled={!!busy} className={sc.locked ? "text-emerald-300" : "text-slate-400"} title={sc.locked ? "Desbloquear" : "Bloquear: la IA no la cambiará"}>{sc.locked ? "🔒" : "🔓"}</button>
                    <button type="button" onClick={() => regenerar(sc.id, "scene")} disabled={!!busy || prot} className="text-sky-300 disabled:opacity-40">Regenerar</button>
                    <button type="button" onClick={() => setAbierta(abierta === sc.id ? null : sc.id)} className="font-semibold text-violet-200">{sc.script?.length ? `Guion (${scriptSeconds(sc.script)} s)` : "Escribir guion"}</button>
                  </span>
                </div>
                <Editable valor={sc.summary} disabled={prot} onSave={v => editar(sc.id, "summary", v)} className="mt-1 text-slate-300" />
                {!!avisosPorEscena.get(sc.id)?.length && <ul className="mt-1 list-disc pl-4 text-rose-200">{avisosPorEscena.get(sc.id)!.map((t, i) => <li key={i}>{t}</li>)}</ul>}
                {!!saved.escenarios?.length && <label className="mt-1 flex items-center gap-2 text-slate-400">Escenario
                  <select value={sc.envId || ""} disabled={prot} onChange={e => editar(sc.id, "envId", e.target.value || undefined)} className="w-auto py-0.5 text-xs">
                    <option value="">— sin escenario fijo —</option>{saved.escenarios.map(e => <option key={e.id} value={e.id}>{e.nombre}{e.locked ? " 🔒" : ""}</option>)}
                  </select></label>}
                <div className="mt-1 grid gap-1 text-slate-400 sm:grid-cols-3">
                  <span><b className="text-slate-300">Objetivo:</b> <Editable valor={sc.objective} disabled={prot} onSave={v => editar(sc.id, "objective", v)} /></span>
                  <span><b className="text-slate-300">Obstáculo:</b> <Editable valor={sc.obstacle} disabled={prot} onSave={v => editar(sc.id, "obstacle", v)} /></span>
                  <span><b className="text-slate-300">Consecuencia:</b> <Editable valor={sc.consequence} disabled={prot} onSave={v => editar(sc.id, "consequence", v)} /></span>
                </div>
                {abierta === sc.id && <GuionEditor escena={sc} protegido={prot} busy={!!busy}
                  onGuardar={(els, label) => guardar(saveScript(saved, sc.id, els, label))}
                  onAprobar={v => guardar(mapNode(saved, sc.id, n => ({ ...n, scriptApproved: v, locked: v ? true : n.locked })))}
                  onIA={wish => run("Escribiendo el guion…", async () => { const els = await escribirGuion(sc, wish); if (els) await guardar(saveScript(saved, sc.id, els, wish ? `IA: ${wish}` : "guion escrito por la IA")); })} />}
              </li>;
            })}</ol>
          </div>)}</div>
        </div>)}
      </>}
    </div>}
  </section>;
}

function Cabecera({ titulo, meta, locked, busy, onLock, onRegen, onTitulo, etiqueta, pequeño }: { titulo: string; meta: string; locked: boolean; busy: boolean; onLock: () => void; onRegen: () => void; onTitulo: (v: string) => void; etiqueta: string; pequeño?: boolean }) {
  return <div className={`flex flex-wrap items-center gap-2 ${pequeño ? "p-2" : "p-3"}`}>
    <span className="text-[10px] font-semibold uppercase tracking-wider text-violet-300">{etiqueta}</span>
    <Editable valor={titulo} disabled={locked} onSave={onTitulo} className={pequeño ? "text-sm font-semibold" : "text-base font-bold"} />
    {meta && <span className="text-xs text-slate-400">· {meta}</span>}
    <span className="ml-auto flex gap-2 text-xs">
      <button type="button" onClick={onLock} disabled={busy} className={locked ? "text-emerald-300" : "text-slate-400"} title={locked ? "Desbloquear" : "Bloquear: la IA no cambiará nada de dentro"}>{locked ? "🔒 Bloqueado" : "🔓"}</button>
      <button type="button" onClick={onRegen} disabled={busy || locked} className="text-sky-300 disabled:opacity-40">Regenerar</button>
    </span>
  </div>;
}

// Texto que se edita con un clic (se guarda al salir del campo).
function Editable({ valor, onSave, disabled, className = "" }: { valor: string; onSave: (v: string) => void; disabled?: boolean; className?: string }) {
  const [edit, setEdit] = useState(false);
  if (edit && !disabled) return <textarea autoFocus defaultValue={valor} rows={2} className="w-full text-xs" onBlur={e => { setEdit(false); if (e.target.value.trim() !== valor) onSave(e.target.value.trim()); }} />;
  return <span role={disabled ? undefined : "button"} tabIndex={disabled ? -1 : 0} onClick={() => !disabled && setEdit(true)} onKeyDown={e => { if (e.key === "Enter" && !disabled) setEdit(true); }} className={`${className} ${disabled ? "" : "cursor-text hover:bg-white/5"}`}>{valor || <span className="text-slate-600">—</span>}</span>;
}

// Editor de guion de una escena: elementos editables, IA, aprobar y bloquear, historial y comparación de versiones.
function GuionEditor({ escena, protegido, busy, onGuardar, onAprobar, onIA }: { escena: OutlineScene; protegido: boolean; busy: boolean; onGuardar: (els: ScriptElement[], label: string) => void; onAprobar: (v: boolean) => void; onIA: (wish: string) => void }) {
  const [els, setEls] = useState<ScriptElement[]>(escena.script || []);
  const [comparar, setComparar] = useState<number | null>(null);
  const cambiado = JSON.stringify(els) !== JSON.stringify(escena.script || []);
  const bloqueado = protegido || !!escena.scriptApproved;
  const set = (i: number, patch: Partial<ScriptElement>) => setEls(l => l.map((e, k) => k === i ? { ...e, ...patch } : e));
  const mover = (i: number, d: number) => setEls(l => { const n = [...l]; const j = i + d; if (j < 0 || j >= n.length) return l; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const hist = escena.scriptHistory || [];
  const diff = comparar !== null && hist[comparar] ? diffLines(hist[comparar].elements.map(lineOf), (escena.script || []).map(lineOf)) : null;
  return <div className="mt-2 space-y-2 rounded-lg border border-violet-400/25 bg-violet-400/[.04] p-2">
    <p className="font-mono text-[11px] text-violet-200">{escena.heading} · {scriptSeconds(els)} s estimados{bloqueado ? " · bloqueado" : ""}</p>
    {els.map((e, i) => <div key={i} className="flex flex-wrap items-start gap-1">
      <select value={e.type} disabled={bloqueado} onChange={ev => set(i, { type: ev.target.value as ScriptElement["type"] })} className="w-auto text-[11px]">{TIPOS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
      {(e.type === "dialogo" || e.type === "off") && <input value={e.speaker || ""} disabled={bloqueado} onChange={ev => set(i, { speaker: ev.target.value })} placeholder="Personaje" className="w-32 text-[11px]" />}
      <textarea value={e.text} disabled={bloqueado} onChange={ev => set(i, { text: ev.target.value })} rows={1} className="min-w-[200px] flex-1 text-xs" />
      {!bloqueado && <span className="flex gap-1 text-slate-400"><button type="button" onClick={() => mover(i, -1)} aria-label="Subir">↑</button><button type="button" onClick={() => mover(i, 1)} aria-label="Bajar">↓</button><button type="button" onClick={() => setEls(l => l.filter((_, k) => k !== i))} aria-label="Quitar" className="hover:text-rose-300">✕</button></span>}
    </div>)}
    {!els.length && <p className="text-xs text-slate-400">Sin guion todavía: escríbelo a mano o con la IA.</p>}
    <div className="flex flex-wrap gap-2 text-xs">
      {!bloqueado && <button type="button" onClick={() => setEls(l => [...l, { type: "accion", text: "" }])} className="rounded border border-white/15 px-2 py-1">+ Línea</button>}
      {!bloqueado && cambiado && <button type="button" onClick={() => onGuardar(els.filter(e => e.text.trim()), "edición manual")} className="rounded bg-violet-500 px-2 py-1 font-bold text-white">Guardar cambios</button>}
      {!bloqueado && <button type="button" disabled={busy} onClick={() => onIA(window.prompt("¿Qué quieres de la IA? (opcional: más tensión, menos explicación…)") || "")} className="rounded border border-sky-400/40 px-2 py-1 text-sky-200 disabled:opacity-50">{escena.script?.length ? "Reescribir con IA" : "Escribir con IA"}</button>}
      {!!escena.script?.length && <button type="button" onClick={() => onAprobar(!escena.scriptApproved)} className={`rounded px-2 py-1 ${escena.scriptApproved ? "border border-white/15 text-slate-300" : "bg-emerald-500 font-bold text-black"}`}>{escena.scriptApproved ? "Quitar aprobación" : "Aprobar y bloquear"}</button>}
    </div>
    {hist.length > 0 && <div className="text-xs"><p className="text-slate-400">Versiones anteriores del guion:</p>
      <ul className="mt-1 space-y-0.5">{hist.map((h, i) => <li key={h.at} className="flex flex-wrap gap-2"><span className="text-slate-500">{new Date(h.at).toLocaleString("es-DO")}</span><span>{h.label}</span>
        <button type="button" onClick={() => setComparar(comparar === i ? null : i)} className="text-sky-300 underline">{comparar === i ? "Ocultar" : "Comparar con la actual"}</button>
        {!bloqueado && <button type="button" onClick={() => onGuardar(h.elements, "volver a una versión anterior")} className="text-sky-300 underline">Recuperar</button>}</li>)}</ul>
      {diff && <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-black/40 p-2 font-mono text-[11px]">{diff.map((d, k) => <div key={k} className={d.op === "+" ? "text-emerald-300" : d.op === "-" ? "text-rose-300 line-through" : "text-slate-400"}>{d.op === "=" ? "  " : `${d.op} `}{d.text}</div>)}</pre>}
    </div>}
  </div>;
}
