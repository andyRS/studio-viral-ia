"use client";
// Fase 4 del proyecto largo: tomas y storyboard por escena (con prompts por motor) y plan de producción
// con las tarifas que pone el usuario. Todo se guarda dentro del proyecto.
import PromptWorkbench from "./PromptWorkbench";
import CopyButton from "./CopyButton";
import { reorderShots } from "./studio/shotOrder";
import ReferencePreview from "./ReferencePreview";
import { useMemo, useRef, useState } from "react";
import { reducir } from "@/components/CanonPanels";
import { allScenes, isProtected, mapNode, type Outline, type OutlineScene } from "@/lib/outline";
import {
  dividirEscena, duracionClip, ESTADO_LABEL, ESTADOS, maxSeg, partirToma, perfilActivo, PERFILES_BASE, planProduccion, produccionDe, promptsDeToma,
  type Estado, type PerfilModelo, type Toma,
} from "@/lib/tomas";
import type { StyleKey } from "@/lib/knowledge";

const COLOR_ESTADO: Record<Estado, string> = { pendiente: "bg-slate-500", imagen: "bg-sky-500", video: "bg-teal-700", revision: "bg-amber-500", aprobado: "bg-emerald-500", exportado: "bg-teal-300" };
const CAMPOS_TOMA: [keyof Toma, string][] = [["accion", "Acción visible"], ["plano", "Plano"], ["lente", "Lente"], ["movimiento", "Movimiento de cámara"], ["composicion", "Composición"], ["luz", "Iluminación"],
  ["vfx", "Efectos visuales"], ["expresion", "Expresión y cuerpo"], ["sonido", "Ambiente sonoro"], ["musica", "Música sugerida"], ["frameInicial", "Fotograma inicial"], ["frameFinal", "Fotograma final"], ["transicion", "Transición"]];

type Props = { outline: Outline; guardar: (o: Outline) => Promise<void>; ia: (body: any) => Promise<any>; run: (label: string, fn: () => Promise<void>) => Promise<void>; busy: boolean; style: StyleKey; characters: any[] };

export function TomasPanel({ outline, guardar, ia, run, busy, style, characters }: Props) {
  const escenas = allScenes(outline);
  const [sel, setSel] = useState<string>(escenas.find(s => !s.tomas?.length)?.id || escenas[0]?.id || "");
  const [selectedShot, setSelectedShot] = useState<string | null>(null);
  const [inspectorTab, setInspectorTab] = useState<"details" | "prompts">("details");
  const [orderMessage, setOrderMessage] = useState("");
  const [savingOrder, setSavingOrder] = useState(false);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const draggingShot = useRef<string | null>(null);
  const inspectorRef = useRef<HTMLElement | null>(null);
  const showInspector = (id: string, tab: "details" | "prompts") => {
    setSelectedShot(id); setInspectorTab(tab);
    if (window.matchMedia("(max-width: 1100px)").matches) requestAnimationFrame(() => inspectorRef.current?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }));
  };
  const [vista, setVista] = useState<"grid" | "sequence">("grid");
  const sc = escenas.find(s => s.id === sel) || escenas[0];
  const perfil = perfilActivo(outline);
  const { formato } = produccionDe(outline);
  if (!escenas.length) return <p className="text-sm text-slate-400">Primero crea la estructura y escribe el guion de las escenas.</p>;
  const tomas = sc?.tomas || [];
  const selected = tomas.find(t => t.id === selectedShot) || tomas[0];
  const prot = sc ? isProtected(outline, sc.id) : true;
  const escenario = outline.escenarios?.find(e => e.id === sc?.envId);
  const ctx = { style, formato, escenario, personajes: characters };
  const setTomas = (ts: Toma[]) => sc && guardar(mapNode(outline, sc.id, n => ({ ...n, tomas: ts })));
  const setToma = (id: string, patch: Partial<Toma>) => setTomas(tomas.map(t => t.id === id ? { ...t, ...patch } : t));
  const reorder = async (fromId: string, toId: string) => {
    if (prot || busy || savingOrder) return;
    const next = reorderShots(tomas, fromId, toId);
    if (next.reason) { setOrderMessage(next.reason); return; }
    if (!next.moved) return;
    setSavingOrder(true); setOrderMessage("Guardando el orden…");
    try { await setTomas(next.items); setSelectedShot(fromId); setOrderMessage("Orden de tomas guardado."); }
    catch (error: unknown) { setOrderMessage(error instanceof Error ? error.message : "No se pudo guardar el orden. Inténtalo de nuevo."); }
    finally { setSavingOrder(false); }
  };
  const mover = (i: number, d: number) => { const target = tomas[i + d]; if (target) void reorder(tomas[i].id, target.id); };
  const shotAt = (x: number, y: number) => {
    const card = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-shot-id]");
    return card?.dataset.sceneId === sc?.id ? card.dataset.shotId : undefined;
  };
  const conservar = (nuevas: Toma[]) => {
    // Las tomas bloqueadas se quedan donde estaban; las nuevas ocupan el resto.
    const bloqueadas = tomas.filter(t => t.locked);
    return bloqueadas.length ? [...bloqueadas, ...nuevas] : nuevas;
  };
  const conIA = (s: OutlineScene) => run("Dividiendo la escena en tomas…", async () => {
    if (tomas.some(t => !t.locked) && !confirm("Se reemplazan las tomas no bloqueadas de esta escena. ¿Seguir?")) return;
    const d = await ia({ action: "tomas", scene: s, perfil, formato, escenario: escenario ? { nombre: escenario.nombre } : undefined });
    await setTomas(conservar(d.tomas));
  });
  const sinIA = (s: OutlineScene) => {
    if (tomas.some(t => !t.locked) && !confirm("Se reemplazan las tomas no bloqueadas de esta escena. ¿Seguir?")) return;
    void setTomas(conservar(dividirEscena(s, perfil)));
  };
  const total = tomas.reduce((a, t) => a + duracionClip(t.duracion, perfil), 0);
  const todosLosPrompts = () => tomas.map((t, i) => { const p = promptsDeToma(t, perfil, ctx); return `TOMA ${i + 1} · ${p.clip} s\n\n[IMAGEN]\n${p.imagen}\n\n[VÍDEO]\n${p.video}${p.voz ? `\n\n[VOZ]\n${p.voz}` : ""}\n\n[SONIDO]\n${p.efectos}`; }).join("\n\n────────\n\n");

  return <div className="storyboard-studio space-y-3">
    <div className="flex flex-wrap items-end gap-2">
      <label className="min-w-0 flex-1 text-xs text-slate-300">Escena
        <select value={sc?.id || ""} onChange={e => { setSel(e.target.value); setSelectedShot(null); setInspectorTab("details"); setOrderMessage(""); }} className="mt-1">
          {escenas.map((s, i) => <option key={s.id} value={s.id}>{i + 1}. {s.heading} {s.tomas?.length ? `· ${s.tomas.length} tomas` : s.script?.length ? "· con guion" : "· sin guion"}</option>)}
        </select></label>
      <span className="text-xs text-slate-400">Motor: <b className="text-slate-200">{perfil.nombre}</b> (clips de {perfil.duraciones.join("/")} s, {formato})</span>
    </div>
    {sc && <div className="flex flex-wrap gap-2">
      <button type="button" disabled={busy || prot} onClick={() => conIA(sc)} className="rounded-lg bg-teal-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Dividir en tomas con IA</button>
      <button type="button" disabled={busy || prot} onClick={() => sinIA(sc)} className="rounded-lg border border-white/15 px-3 py-2 text-xs text-slate-200 disabled:opacity-50">Dividir sin IA (por el guion)</button>
      <button type="button" disabled={busy || prot} onClick={() => setTomas([...tomas, { ...dividirEscena({ ...sc, script: [{ type: "accion", text: "Nueva toma" }] }, perfil)[0] }])} className="rounded-lg border border-white/15 px-3 py-2 text-xs text-slate-200 disabled:opacity-50">+ Toma</button>
      {!!tomas.length && <CopyButton text={todosLosPrompts()} label="Copiar todos los prompts de la escena" />}
      {prot && <span className="self-center text-xs text-emerald-300">Escena bloqueada: desbloquéala para cambiar sus tomas.</span>}
      {!sc.script?.length && <span className="self-center text-xs text-amber-200">Sin guion: las tomas saldrán del resumen. Mejor escribe antes el guion.</span>}
    </div>}

    {!!tomas.length && <>
      <div className="storyboard-toolbar"><div><p className="studio-eyebrow cinematic-gold">STORYBOARD / DIRECCIÓN VISUAL</p><p className="mt-1 text-xs text-slate-400">Amplía una referencia o abre una toma para editar sus prompts.</p></div><div className="flex gap-1" role="group" aria-label="Vista del storyboard"><button type="button" aria-pressed={vista === "grid"} className="studio-secondary-action" onClick={() => setVista("grid")}>Cuadrícula</button><button type="button" aria-pressed={vista === "sequence"} className="studio-secondary-action" onClick={() => setVista("sequence")}>Secuencia</button></div></div>
      {/* Línea de tiempo: cada bloque es una toma, ancho según la duración del clip */}
      <div>
        <div className="flex h-7 overflow-hidden rounded-lg border border-white/10" aria-label="Línea de tiempo de la escena">
          {tomas.map((t, i) => <button key={t.id} type="button" onClick={() => showInspector(t.id, "details")} title={`Toma ${i + 1}: ${duracionClip(t.duracion, perfil)} s · ${ESTADO_LABEL[t.estado]}`} style={{ width: `${(duracionClip(t.duracion, perfil) / total) * 100}%` }}
            className={`border-r border-black/40 text-[10px] font-bold text-white/90 ${COLOR_ESTADO[t.estado]} ${t.duracion > maxSeg(perfil) ? "ring-2 ring-inset ring-rose-400" : ""}`}>{i + 1}</button>)}
        </div>
        <p className="mt-1 text-[11px] text-slate-400">{tomas.length} tomas · {total} s de clips · la escena estaba prevista en {Math.round(sc!.minutes * 60)} s</p>
      </div>

      {orderMessage && <p className="storyboard-order-status" role="status">{orderMessage}</p>}
      <div className="storyboard-layout">
      <ol className={vista === "grid" ? "storyboard-card-grid" : "storyboard-sequence"}>{tomas.map((t, i) => {
        const pr = promptsDeToma(t, perfil, ctx);
        return <li key={t.id} data-shot-id={t.id} data-scene-id={sc?.id} data-selected={selected?.id === t.id} className={`storyboard-shot rounded-xl border bg-white/[.02] p-2 text-xs ${dropTarget === t.id ? "shot-drop-target" : ""} ${t.locked ? "border-emerald-400/30" : pr.avisos.length ? "border-rose-400/40" : "border-white/10"}`}>
          <div className="shot-card-heading"><button type="button" className="shot-drag-handle" aria-label={`Arrastrar toma ${i + 1}; usa Mover antes o Mover después con teclado`} disabled={prot || busy || savingOrder || t.locked} onPointerDown={e => { if (e.button !== 0) return; e.preventDefault(); draggingShot.current = t.id; e.currentTarget.setPointerCapture(e.pointerId); setOrderMessage(`Moviendo toma ${i + 1}: suéltala sobre otra tarjeta.`); }} onPointerMove={e => { if (draggingShot.current) setDropTarget(shotAt(e.clientX, e.clientY) || null); }} onPointerUp={e => { const from = draggingShot.current; const to = shotAt(e.clientX, e.clientY); draggingShot.current = null; setDropTarget(null); if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); if (from && to && from !== to) void reorder(from, to); else if (from) setOrderMessage("Orden sin cambios."); }} onPointerCancel={() => { draggingShot.current = null; setDropTarget(null); setOrderMessage("Orden sin cambios."); }}>⠿</button><button type="button" onClick={() => showInspector(t.id, inspectorTab)} aria-pressed={selected?.id === t.id}>TOMA {String(i + 1).padStart(2, "0")}</button><span>{ESTADO_LABEL[t.estado]}</span></div>
          <div className="relative grid aspect-video place-items-center overflow-hidden rounded-lg bg-black/40">
            {t.imagen ? <ReferencePreview src={t.imagen} title={`Toma ${i + 1} · ${t.plano || "Storyboard"}`} landscape /> : <span className="px-2 text-center text-slate-500">{t.plano || "Sin imagen"}</span>}
            <label className="absolute bottom-1 right-1 cursor-pointer rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-slate-200">{t.imagen ? "Cambiar" : "Subir imagen"}
              <input type="file" accept="image/*" className="sr-only" disabled={busy || prot || !!t.locked} onChange={async ev => { const f = ev.target.files?.[0]; if (f) await setToma(t.id, { imagen: await reducir(f), estado: t.estado === "pendiente" ? "imagen" : t.estado }); ev.target.value = ""; }} /></label>
            <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 text-[10px] font-bold text-white">{i + 1} · {pr.clip} s</span>
          </div>
          <p className="mt-1 line-clamp-3 text-slate-200">{t.accion}</p>
          {t.dialogo && <p className="mt-0.5 text-teal-200"><b>{t.dialogo.speaker}:</b> «{t.dialogo.text}»</p>}
          <p className="mt-0.5 text-slate-500">{[t.plano, t.lente, t.movimiento].filter(Boolean).join(" · ")}</p>
          {pr.avisos.map(a => <p key={a} className="mt-0.5 text-rose-200">⚠ {a}</p>)}
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <select aria-label={`Estado de la toma ${i + 1}`} value={t.estado} disabled={busy || prot || !!t.locked} onChange={e => setToma(t.id, { estado: e.target.value as Estado })} className="w-auto py-0.5 text-[11px]">{ESTADOS.map(s => <option key={s} value={s}>{ESTADO_LABEL[s]}</option>)}</select>
            <button type="button" onClick={() => mover(i, -1)} disabled={i === 0 || prot || busy || savingOrder || t.locked || tomas[i - 1]?.locked} aria-label="Mover antes" className="px-1 text-slate-300 disabled:opacity-30">◀</button>
            <button type="button" onClick={() => mover(i, 1)} disabled={i === tomas.length - 1 || prot || busy || savingOrder || t.locked || tomas[i + 1]?.locked} aria-label="Mover después" className="px-1 text-slate-300 disabled:opacity-30">▶</button>
            <button type="button" disabled={busy || prot} onClick={() => setToma(t.id, { locked: !t.locked })} title={t.locked ? "Desbloquear" : "Bloquear: no se reemplaza al volver a dividir"} className={t.locked ? "text-emerald-300" : "text-slate-400"}>{t.locked ? "🔒" : "🔓"}</button>
            {t.duracion > maxSeg(perfil) && !t.locked && <button type="button" onClick={() => { const [a, b] = partirToma(t); void setTomas(tomas.flatMap(x => x.id === t.id ? [a, b] : [x])); }} className="text-rose-200 underline">Partir en dos</button>}
            <span className="ml-auto flex gap-2">
              <button type="button" onClick={() => showInspector(t.id, "prompts")} className="font-semibold text-teal-200">Prompts</button>
              <button type="button" onClick={() => showInspector(t.id, "details")} className="text-sky-300">Editar</button>
            </span>
          </div>

        </li>;
      })}</ol>
      {selected && <aside ref={inspectorRef} className="shot-inspector" key={selected.id}><header className="stage-panel-header"><span className="studio-eyebrow">INSPECTOR / TOMA {String(tomas.findIndex(x => x.id === selected.id) + 1).padStart(2, "0")}</span><span>{selected.locked ? "Bloqueada" : "Editable"}</span></header><div className="shot-inspector-tabs" role="group" aria-label="Inspector de la toma"><button type="button" aria-pressed={inspectorTab === "details"} onClick={() => setInspectorTab("details")}>Dirección</button><button type="button" aria-pressed={inspectorTab === "prompts"} onClick={() => setInspectorTab("prompts")}>Prompts</button></div><div className="shot-inspector-body">{(() => { const t = selected; const pr = promptsDeToma(t, perfil, ctx); return <>
          {inspectorTab === "prompts" && <div className="mt-2 space-y-2">{([["Imagen", pr.imagen], ["Vídeo", pr.video], ["Voz", pr.voz], ["Sonido", pr.efectos]] as const).filter(([, v]) => v).map(([k, v]) =>
            <PromptWorkbench key={k} title={`${k} · Toma ${tomas.findIndex(x => x.id === t.id) + 1}`} prompt={v} context={perfil.nombre} />)}</div>}
          {inspectorTab === "details" && <fieldset disabled={prot || busy || !!t.locked} className="shot-edit-fields mt-2 space-y-1.5">
            <label className="block text-slate-400">Duración (s)<input type="number" min={1} max={30} step={0.5} defaultValue={t.duracion} disabled={t.locked} onBlur={e => setToma(t.id, { duracion: Math.max(1, Number(e.target.value) || t.duracion) })} className="mt-0.5 py-1 text-xs" /></label>
            <label className="block text-slate-400">Personajes (separados por comas)<input defaultValue={t.personajes.join(", ")} disabled={t.locked} onBlur={e => setToma(t.id, { personajes: e.target.value.split(",").map(x => x.trim()).filter(Boolean) })} className="mt-0.5 py-1 text-xs" /></label>
            <label className="block text-slate-400">Diálogo (Personaje: frase)<input defaultValue={t.dialogo ? `${t.dialogo.speaker}: ${t.dialogo.text}` : ""} disabled={t.locked} onBlur={e => { const m = /^([^:]{1,60}):\s*(.+)$/.exec(e.target.value.trim()); setToma(t.id, { dialogo: m ? { speaker: m[1].trim(), text: m[2].trim() } : undefined }); }} className="mt-0.5 py-1 text-xs" /></label>
            {CAMPOS_TOMA.filter(([k]) => k === "accion" || k === "plano").map(([k, label]) => <label key={k} className="block text-slate-400">{label}
              <textarea defaultValue={String(t[k] || "")} rows={k === "accion" ? 2 : 1} disabled={t.locked} onBlur={e => { if (e.target.value !== String(t[k] || "")) setToma(t.id, { [k]: e.target.value } as any); }} className="mt-0.5 text-xs" /></label>)}
            {([["Cámara, luz y expresión", ["lente", "movimiento", "composicion", "luz", "vfx", "expresion"]], ["Sonido y continuidad", ["sonido", "musica", "frameInicial", "frameFinal", "transicion"]]] as [string, (keyof Toma)[]][]).map(([group, keys]) => <details className="shot-field-group" key={group}><summary>{group}</summary>{CAMPOS_TOMA.filter(([k]) => keys.includes(k)).map(([k, label]) => <label key={k} className="block text-slate-400">{label}<textarea defaultValue={String(t[k] || "")} rows={1} disabled={t.locked} onBlur={e => { if (e.target.value !== String(t[k] || "")) setToma(t.id, { [k]: e.target.value } as any); }} className="mt-0.5 text-xs" /></label>)}</details>)}
            <button type="button" disabled={t.locked} onClick={() => { if (confirm("¿Borrar esta toma?")) void setTomas(tomas.filter(x => x.id !== t.id)); }} className="text-rose-300 disabled:opacity-40">Borrar toma</button>
          </fieldset>}
      </>; })()}</div></aside>}
      </div>
    </>}
  </div>;
}

// ---------- Plan de producción y motores ----------
const num = (v: string) => (v.trim() === "" ? null : Math.max(0, Number(v.replace(",", "."))));
const fmt = (n: number | null, d = 0) => (n == null ? "—" : n.toLocaleString("es-DO", { maximumFractionDigits: d }));

export function PlanPanel({ outline, guardar, busy }: { outline: Outline; guardar: (o: Outline) => Promise<void>; busy: boolean }) {
  const prod = produccionDe(outline);
  const perfil = perfilActivo(outline);
  const plan = useMemo(() => planProduccion(outline, perfil), [outline, perfil]);
  const [editar, setEditar] = useState(false);
  const setProd = (patch: Partial<typeof prod>) => guardar({ ...outline, produccion: { ...prod, ...patch } });
  const setPerfil = (patch: Partial<PerfilModelo>) => setProd({ perfiles: prod.perfiles.map(p => p.id === perfil.id ? { ...p, ...patch } : p) });
  const sinTarifa = perfil.creditosSegundo == null;
  return <div className="space-y-3 text-xs">
    <div className="grid gap-2 sm:grid-cols-3">
      <label className="text-slate-300">Motor de vídeo<select value={perfil.id} disabled={busy} onChange={e => setProd({ perfilId: e.target.value })} className="mt-1">{prod.perfiles.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></label>
      <label className="text-slate-300">Formato<select value={prod.formato} disabled={busy} onChange={e => setProd({ formato: e.target.value })} className="mt-1">{["16:9", "9:16", "1:1"].map(f => <option key={f} value={f}>{f}{f === "16:9" ? " (Facebook y YouTube)" : f === "9:16" ? " (clips verticales)" : ""}</option>)}</select></label>
      <button type="button" onClick={() => setEditar(!editar)} className="self-end rounded-lg border border-white/15 px-3 py-2 text-slate-200">{editar ? "Cerrar" : "Capacidades y tarifas del motor"}</button>
    </div>

    {editar && <div className="space-y-2 rounded-xl border border-white/10 p-3">
      <p className="text-slate-400">Capacidades orientativas: los proveedores cambian a menudo. Confírmalas en su web y corrígelas aquí. Las tarifas las pones tú: la app nunca inventa un precio.</p>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="text-slate-300">Duraciones de clip (s)<input defaultValue={perfil.duraciones.join(", ")} key={`d-${perfil.id}`} onBlur={e => { const d = e.target.value.split(/[,\s]+/).map(Number).filter(n => n > 0); if (d.length) setPerfil({ duraciones: d }); }} className="mt-1 py-1" /></label>
        <label className="text-slate-300">Formatos<input defaultValue={perfil.formatos.join(", ")} key={`f-${perfil.id}`} onBlur={e => setPerfil({ formatos: e.target.value.split(/[,\s]+/).filter(Boolean) })} className="mt-1 py-1" /></label>
        <label className="text-slate-300">Resoluciones<input defaultValue={perfil.resoluciones.join(", ")} key={`r-${perfil.id}`} onBlur={e => setPerfil({ resoluciones: e.target.value.split(/[,\s]+/).filter(Boolean) })} className="mt-1 py-1" /></label>
      </div>
      <div className="flex flex-wrap gap-4 text-slate-300">
        {([["referencias", "Imágenes de referencia"], ["primerUltimo", "Fotograma inicial y final"], ["audio", "Audio nativo (voz y sonido)"]] as const).map(([k, l]) =>
          <label key={k} className="flex items-center gap-1.5"><input type="checkbox" checked={!!perfil[k]} onChange={e => setPerfil({ [k]: e.target.checked } as any)} className="h-auto w-auto" />{l}</label>)}
      </div>
      <label className="block text-slate-300">Cámara que entiende<input defaultValue={perfil.camara} key={`c-${perfil.id}`} onBlur={e => setPerfil({ camara: e.target.value })} className="mt-1 py-1" /></label>
      <label className="block text-slate-300">Restricciones del prompt<input defaultValue={perfil.restricciones} key={`x-${perfil.id}`} onBlur={e => setPerfil({ restricciones: e.target.value })} className="mt-1 py-1" /></label>
      <div className="grid gap-2 sm:grid-cols-4">
        <label className="text-slate-300">Créditos por segundo de vídeo<input inputMode="decimal" defaultValue={perfil.creditosSegundo ?? ""} key={`cs-${perfil.id}`} placeholder="tu tarifa" onBlur={e => setPerfil({ creditosSegundo: num(e.target.value) })} className="mt-1 py-1" /></label>
        <label className="text-slate-300">Créditos por imagen<input inputMode="decimal" defaultValue={perfil.creditosImagen ?? ""} key={`ci-${perfil.id}`} placeholder="0 si es gratis" onBlur={e => setPerfil({ creditosImagen: num(e.target.value) })} className="mt-1 py-1" /></label>
        <label className="text-slate-300">Precio de 1 crédito (USD)<input inputMode="decimal" defaultValue={perfil.usdCredito ?? ""} key={`u-${perfil.id}`} placeholder="ej. 0.01" onBlur={e => setPerfil({ usdCredito: num(e.target.value) })} className="mt-1 py-1" /></label>
        <label className="text-slate-300">Generaciones por toma (media)<input inputMode="decimal" defaultValue={perfil.reintentos} key={`ri-${perfil.id}`} onBlur={e => setPerfil({ reintentos: Math.max(1, num(e.target.value) ?? 1) })} className="mt-1 py-1" /></label>
      </div>
      <button type="button" onClick={() => { if (confirm("¿Volver a las capacidades de fábrica de este motor? Se borran también tus tarifas.")) setPerfil(PERFILES_BASE.find(p => p.id === perfil.id) || {}); }} className="text-sky-300">Restablecer este motor</button>
    </div>}

    <div className="grid gap-2 sm:grid-cols-4">
      {[["Duración objetivo", `${plan.objetivoMin} min`], ["Tomas", `${plan.tomas}${plan.estimadas ? ` (${plan.estimadas} estimadas)` : ""}`], ["Clips montados", `${Math.floor(plan.segundosClips / 60)}:${String(plan.segundosClips % 60).padStart(2, "0")} min`],
        ["Generaciones", `${plan.generaciones} (${plan.segundosGenerados} s)`], ["Créditos de vídeo", fmt(plan.creditosVideo)], ["Créditos de imagen", fmt(plan.creditosImagen)], ["Créditos en total", fmt(plan.creditos)], ["Coste estimado", plan.usd == null ? "—" : `US$ ${fmt(plan.usd, 2)}`]]
        .map(([k, v]) => <div key={k} className="rounded-lg border border-white/10 p-2"><p className="text-slate-400">{k}</p><p className="text-base font-bold text-slate-100">{v}</p></div>)}
    </div>
    <p className="text-slate-400">Es una <b>estimación</b> con tus datos: {perfil.reintentos} generaciones por toma de media.{plan.estimadas ? " Las escenas sin tomas se calculan con clips de " + maxSeg(perfil) + " s." : ""}{sinTarifa ? " Falta tu tarifa de créditos por segundo: pulsa «Capacidades y tarifas del motor»." : ""}</p>

    <div>
      <p className="font-semibold text-slate-300">Progreso de producción · {plan.progreso} % aprobado</p>
      <div className="mt-1 flex h-3 overflow-hidden rounded-full bg-white/5">{ESTADOS.map(e => plan.estados[e] ? <div key={e} title={`${ESTADO_LABEL[e]}: ${plan.estados[e]}`} style={{ width: `${(plan.estados[e] / plan.tomas) * 100}%` }} className={COLOR_ESTADO[e]} /> : null)}</div>
      <div className="mt-1 flex flex-wrap gap-3 text-slate-400">{ESTADOS.map(e => <span key={e} className="flex items-center gap-1"><i className={`inline-block h-2 w-2 rounded-full ${COLOR_ESTADO[e]}`} />{ESTADO_LABEL[e]}: {plan.estados[e]}</span>)}</div>
    </div>
  </div>;
}
