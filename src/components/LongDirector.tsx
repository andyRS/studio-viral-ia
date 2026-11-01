"use client";
// Director del proyecto largo (Facebook y YouTube): actos → secuencias → escenas → tomas en un solo espacio.
// Navegador por actos y secuencias · lienzo con el storyboard real de las tomas · inspector (escena, guion,
// escenario, canon, tomas) · pipeline con datos reales. Respeta los candados y guarda con el `guardar`
// existente del proyecto (sin cambios de persistencia).
import { useEffect, useMemo, useState, type KeyboardEvent as RKE, type ReactNode } from "react";
import { allScenes, escenarioTexto, isProtected, type Outline, type OutlineScene } from "@/lib/outline";
import { duracionClip, ESTADO_LABEL, perfilActivo, type Toma } from "@/lib/tomas";
import { opCandadoLarga, opDesplazarLarga, opEditarLarga } from "./studio/operaciones";
import { useOperaciones, type Aplicar } from "./studio/useOperaciones";
import { Divisor, useAnchos } from "./studio/Divisores";
import SceneTransferDialog, { type ConfirmSceneTransfer } from "./studio/SceneTransferDialog";
import { useReorderMotion } from "./studio/useReorderMotion";

type Vista = "director" | "secuencia" | "guion";
type Pestaña = "escena" | "guion" | "escenario" | "canon" | "tomas";
export type IrALargo = "estructura" | "tomas" | "escenarios" | "canon" | "plan" | "montaje";
type Props = {
  outline: Outline; /** Cola de guardado del proyecto (la misma que usa el editor de guion). */ aplicar: Aplicar<Outline>; busy: boolean; avisos: Map<string, string[]>;
  onRegenerar: (id: string, kind: "act" | "sequence" | "scene") => void;
  onEscribirGuion: (sc: OutlineScene) => void;
  renderGuion: (sc: OutlineScene) => ReactNode;
  onIrA: (p: IrALargo, sceneId?: string) => void;
  /** Optional: the data agent owns moving, lock validation and the reversible operation. */
  onTransferScene?: ConfirmSceneTransfer;
};
const mmss = (min: number) => `${Math.floor(min)}:${String(Math.round((min % 1) * 60)).padStart(2, "0")}`;
const hecho = (t: Toma) => t.estado === "aprobado" || t.estado === "exportado";

export default function LongDirector(p: Props) {
  const o = p.outline;
  const escenas = useMemo(() => allScenes(o), [o]);
  const [activa, setActiva] = useState<string>(escenas[0]?.id || "");
  const [vista, setVista] = useState<Vista>("director");
  const [pestaña, setPestaña] = useState<Pestaña>("escena");
  const [transferScene, setTransferScene] = useState<string | null>(null);
  const motionRef = useReorderMotion<HTMLElement>(vista);
  const ops = useOperaciones<Outline>(p.aplicar);
  const guardado = ops.estado;
  const paneles = useAnchos("director-largo", { izq: 290, der: 360 });
  const sc = escenas.find(s => s.id === activa) || escenas[0];
  const p0 = perfilActivo(o);

  const deshacer = ops.deshacer, rehacer = ops.rehacer;
  const editar = (id: string, campo: string, valor: any) => { void ops.ejecutar(opEditarLarga(id, campo, valor)); };
  const mover = (id: string, delta: number) => { void ops.ejecutar(opDesplazarLarga(id, delta)); };
  const candado = (id: string, locked: boolean) => { void ops.ejecutar(opCandadoLarga(id, !locked)); };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z" || /input|textarea|select/i.test((e.target as HTMLElement)?.tagName || "")) return;
      e.preventDefault(); if (e.shiftKey) rehacer(); else deshacer();
    };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [deshacer, rehacer]);

  const tecla = (e: RKE, s: OutlineScene) => {
    const i = escenas.findIndex(x => x.id === s.id);
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) { e.preventDefault(); mover(s.id, e.key === "ArrowUp" ? -1 : 1); return; }
    const sig = e.key === "ArrowDown" ? i + 1 : e.key === "ArrowUp" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? escenas.length - 1 : -2;
    if (sig === -2) return; e.preventDefault();
    const n = escenas[Math.max(0, Math.min(escenas.length - 1, sig))]; if (n) { setActiva(n.id); requestAnimationFrame(() => document.getElementById(`ld-${n.id}`)?.focus()); }
  };

  if (!sc) return null;
  const tomasDe = (s: OutlineScene) => s.tomas || [];
  const estadoEscena = (s: OutlineScene) => {
    const t = tomasDe(s);
    if (t.length && t.every(hecho)) return { s: "aprobado", t: "Tomas aprobadas" };
    if (p.avisos.get(s.id)?.length) return { s: "rehacer", t: "Aviso de canon" };
    if (!s.script?.length) return { s: "incompleta", t: "Sin guion" };
    if (!t.length) return { s: "pendiente", t: s.scriptApproved ? "Guion aprobado" : "Con guion" };
    return { s: "clip", t: `${t.filter(hecho).length}/${t.length} tomas` };
  };
  const portada = (s: OutlineScene) => tomasDe(s).find(t => t.imagen)?.imagen || o.escenarios?.find(e => e.id === s.envId)?.imagenes?.[0];
  const todas = escenas.flatMap(tomasDe);
  const pasos: { n: string; d: string; estado: "hecho" | "en-curso" | "pendiente"; ir: IrALargo; v?: number }[] = [
    { n: "Estructura", d: `${o.acts.length} actos · ${escenas.length} escenas`, estado: "hecho", ir: "estructura" },
    { n: "Guiones", d: `${escenas.filter(s => s.script?.length).length}/${escenas.length} escritos`, estado: escenas.every(s => s.script?.length) ? "hecho" : "en-curso", ir: "estructura", v: escenas.filter(s => s.script?.length).length / escenas.length },
    { n: "Aprobados", d: `${escenas.filter(s => s.scriptApproved).length}/${escenas.length}`, estado: escenas.every(s => s.scriptApproved) ? "hecho" : escenas.some(s => s.scriptApproved) ? "en-curso" : "pendiente", ir: "estructura", v: escenas.filter(s => s.scriptApproved).length / escenas.length },
    { n: "Tomas", d: `${escenas.filter(s => tomasDe(s).length).length}/${escenas.length} escenas divididas`, estado: escenas.every(s => tomasDe(s).length) ? "hecho" : escenas.some(s => tomasDe(s).length) ? "en-curso" : "pendiente", ir: "tomas", v: escenas.filter(s => tomasDe(s).length).length / escenas.length },
    { n: "Storyboard", d: `${todas.filter(t => t.imagen).length}/${todas.length || 0} con imagen`, estado: todas.length && todas.every(t => t.imagen) ? "hecho" : todas.some(t => t.imagen) ? "en-curso" : "pendiente", ir: "tomas", v: todas.length ? todas.filter(t => t.imagen).length / todas.length : 0 },
    { n: "Vídeo", d: `${todas.filter(t => t.estado !== "pendiente" && t.estado !== "imagen").length}/${todas.length || 0} generadas`, estado: todas.length && todas.every(t => !["pendiente", "imagen"].includes(t.estado)) ? "hecho" : todas.some(t => !["pendiente", "imagen"].includes(t.estado)) ? "en-curso" : "pendiente", ir: "tomas" },
    { n: "Aprobado", d: `${todas.filter(hecho).length}/${todas.length || 0} tomas`, estado: todas.length && todas.every(hecho) ? "hecho" : todas.some(hecho) ? "en-curso" : "pendiente", ir: "tomas", v: todas.length ? todas.filter(hecho).length / todas.length : 0 },
    { n: "Montaje", d: "Por actos en tu PC", estado: todas.some(t => t.estado === "exportado") ? "en-curso" : "pendiente", ir: "montaje" },
  ];
  const ubic = (() => { for (let ai = 0; ai < o.acts.length; ai++) { const a = o.acts[ai]; for (const q of a.sequences) if (q.scenes.some(s => s.id === sc.id)) return { a, ai, q }; } return null; })();
  const prot = isProtected(o, sc.id);
  const idx = escenas.findIndex(s => s.id === sc.id);
  const previa = escenas[idx - 1];
  const env = o.escenarios?.find(e => e.id === sc.envId);
  const campo = (k: keyof OutlineScene, label: string, filas = 2) => <div className="sd-field" key={String(k)}><label htmlFor={`ld-${String(k)}-${sc.id}`}>{label}</label>
    {!prot ? (filas === 1
      ? <input id={`ld-${String(k)}-${sc.id}`} key={`${sc.id}-${String(k)}-${String(sc[k] ?? "")}`} className="aurora-field" defaultValue={String(sc[k] ?? "")} onBlur={e => editar(sc.id, String(k), e.target.value.trim())} onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
      : <textarea id={`ld-${String(k)}-${sc.id}`} key={`${sc.id}-${String(k)}-${String(sc[k] ?? "")}`} className="aurora-field !min-h-0" rows={filas} defaultValue={String(sc[k] ?? "")} onBlur={e => editar(sc.id, String(k), e.target.value.trim())} />)
      : <p className="text-sm">{String(sc[k] ?? "—")}</p>}</div>;

  return <section ref={motionRef} className="sd" aria-label="Director del proyecto largo">
    {transferScene && <SceneTransferDialog outline={o} sceneId={transferScene} busy={p.busy} onClose={() => setTransferScene(null)} onConfirm={p.onTransferScene ? async request => {
      await p.onTransferScene!(request);
      setActiva(request.sceneId);
      requestAnimationFrame(() => document.getElementById(`ld-${request.sceneId}`)?.focus({ preventScroll: true }));
    } : undefined} />}
    <div className="sd-toolbar">
      <div className="sd-views" role="group" aria-label="Vista">{([["director", "Director"], ["secuencia", "Secuencia"], ["guion", "Guion"]] as const).map(([v, l]) =>
        <button key={v} type="button" aria-pressed={vista === v} onClick={() => setVista(v)}>{l}</button>)}</div>
      <span className="text-xs text-slate-400">{o.acts.length} actos · {escenas.length} escenas · {mmss(escenas.reduce((a, s) => a + (s.minutes || 0), 0))} de {o.targetMinutes} min</span>
      <span className="ml-auto flex flex-wrap items-center gap-2">
        <span className="sd-save" role="status" aria-live="polite" data-estado={guardado.estado}>{guardado.texto || "Los cambios se guardan al salir de cada campo"}</span>
        <button type="button" className="sd-iconbtn" disabled={!ops.puedeDeshacer} onClick={deshacer} aria-label="Deshacer" title="Deshacer (Ctrl+Z)">↶</button>
        <button type="button" className="sd-iconbtn" disabled={!ops.puedeRehacer} onClick={rehacer} aria-label="Rehacer" title="Rehacer (Ctrl+Shift+Z)">↷</button>
      </span>
    </div>

    {vista === "director" && <div className="sd-workspace" style={paneles.estilo} ref={paneles.ref}>
      <nav className="sd-panel" aria-label="Actos, secuencias y escenas"><div className="sd-panel-head">Actos y escenas</div>
        <div className="sd-nav-list ld-tree">{o.acts.map((a, ai) => <div key={a.id} className="ld-act" role="group" aria-label={`Acto ${ai + 1}: ${a.title}`}>
          <p className="ld-act-head"><span>Acto {ai + 1}</span><b>{a.title}</b>{a.locked && <span aria-label="bloqueado">🔒</span>}</p>
          {a.sequences.map(q => <div key={q.id} className="ld-seq"><p className="ld-seq-head">{q.title}{q.locked ? " 🔒" : ""}</p>
            <div role="list">{q.scenes.map(s => { const st = estadoEscena(s); const img = portada(s); return <div key={s.id} role="listitem" data-reorder-key={s.id}>
              <button type="button" id={`ld-${s.id}`} className="sd-card ld-card" data-spotlight aria-current={s.id === sc.id} onClick={() => setActiva(s.id)} onKeyDown={e => tecla(e, s)}
                aria-label={`${s.heading}. ${st.t}.${s.locked ? " Bloqueada." : ""} Alt y flechas arriba o abajo para moverla en su secuencia.`}>
                <span className="sd-thumb">{img && <img src={img} alt="" loading="lazy" />}<span className="sd-thumb-tag">{img ? (tomasDe(s).some(t => t.imagen) ? "Storyboard" : "Escenario") : "Sin imagen"}</span></span>
                <span className="sd-card-body"><span className="sd-card-title">{s.heading}</span><span className="sd-card-line">{s.summary}</span>
                  <span className="sd-meta"><span>{mmss(s.minutes)}</span><span className="sd-status" data-s={st.s}>{st.t}</span>{s.locked && <span aria-hidden="true">🔒</span>}</span></span>
              </button></div>; })}</div></div>)}
        </div>)}</div></nav>
      <Divisor lado="izq" valor={paneles.anchos.izq} max={paneles.anchos.maxIzq} onCambio={v => paneles.cambiar("izq", v)} etiqueta="Ancho del navegador de actos y escenas" />

      <div className="sd-panel sd-canvas" aria-label={sc.heading}>
        <div className="sd-frame">
          {portada(sc) && <img src={portada(sc)} alt={tomasDe(sc).some(t => t.imagen) ? `Storyboard de ${sc.heading}` : `Imagen del escenario ${env?.nombre || ""}`} style={tomasDe(sc).some(t => t.imagen) ? undefined : { objectFit: "cover", opacity: .55 }} />}
          <span className="sd-frame-label">{tomasDe(sc).some(t => t.imagen) ? "STORYBOARD" : env?.imagenes?.length ? "ESCENARIO · SIN STORYBOARD" : "SIN IMAGEN"} · {ubic ? `ACTO ${ubic.ai + 1} · ${ubic.q.title.toUpperCase()}` : ""}</span>
          <div className="sd-frame-title"><p className="text-xs uppercase tracking-widest text-cyan-200">{env?.nombre || "Sin escenario fijo"} · tensión {sc.tension}/10</p><h3>{sc.heading}</h3><p>{sc.summary}</p></div>
        </div>
        {!!tomasDe(sc).length && <div className="ld-strip" role="list" aria-label="Tomas de la escena">{tomasDe(sc).map((t, i) => <button key={t.id} type="button" role="listitem" className="ld-shot" data-estado={t.estado} onClick={() => p.onIrA("tomas", sc.id)} title={`Toma ${i + 1} · ${ESTADO_LABEL[t.estado]}`}>
          {t.imagen ? <img src={t.imagen} alt="" /> : <span>{t.plano || "toma"}</span>}<b>{i + 1}</b><small>{duracionClip(t.duracion, p0)} s</small></button>)}</div>}
        <div className="sd-continuity" aria-label="Continuidad">
          <span>Objetivo: {sc.objective || "—"}</span>
          {previa && <span data-ok={String(!previa.envId || !sc.envId || previa.envId === sc.envId)}>{previa.envId && sc.envId && previa.envId !== sc.envId ? "Cambio de escenario" : "Continúa el escenario"}</span>}
          {previa && <span>{sc.tension > previa.tension ? "↑ sube la tensión" : sc.tension < previa.tension ? "↓ baja la tensión" : "= misma tensión"}</span>}
          {sc.source && <span>📖 {sc.source}</span>}
          {!!p.avisos.get(sc.id)?.length && <span data-ok="false">⚠ {p.avisos.get(sc.id)!.length} aviso(s) de canon</span>}
        </div>
        <div className="sd-actions">
          {!sc.script?.length && !prot && <button type="button" className="sd-iconbtn" disabled={p.busy} onClick={() => p.onEscribirGuion(sc)}>✦ Escribir el guion con IA</button>}
          <button type="button" className="sd-iconbtn" onClick={() => { setPestaña("guion"); }}>¶ Editar guion</button>
          <button type="button" className="sd-iconbtn" onClick={() => p.onIrA("tomas", sc.id)}>▦ {tomasDe(sc).length ? "Abrir tomas" : "Dividir en tomas"}</button>
          <button type="button" className="sd-iconbtn transfer-trigger" disabled={prot || p.busy} onClick={() => setTransferScene(sc.id)}>{p.onTransferScene ? "↗ Cambiar de secuencia" : "↗ Vista previa de traslado"}</button>
          <button type="button" className="sd-iconbtn" disabled={p.busy || prot} onClick={() => p.onRegenerar(sc.id, "scene")}>↻ Regenerar escena</button>
          <button type="button" className="sd-iconbtn" disabled={p.busy || !!(ubic?.a.locked || ubic?.q.locked)} onClick={() => candado(sc.id, !!sc.locked)}>{sc.locked ? "🔒 Desbloquear" : "🔓 Bloquear"}</button>
          <button type="button" className="sd-iconbtn" disabled={prot} onClick={() => mover(sc.id, -1)} aria-label="Mover la escena antes en su secuencia">↑</button>
          <button type="button" className="sd-iconbtn" disabled={prot} onClick={() => mover(sc.id, 1)} aria-label="Mover la escena después en su secuencia">↓</button>
        </div>
      </div>
      <Divisor lado="der" valor={paneles.anchos.der} max={paneles.anchos.maxDer} onCambio={v => paneles.cambiar("der", v)} etiqueta="Ancho del inspector" />

      <aside className="sd-panel sd-inspector" aria-label="Inspector de la escena">
        <div className="sd-tabs" role="tablist" aria-label="Detalles de la escena">{([["escena", "Escena"], ["guion", "Guion"], ["escenario", "Escenario"], ["canon", "Canon"], ["tomas", "Tomas"]] as const).map(([k, l]) =>
          <button key={k} type="button" role="tab" aria-selected={pestaña === k} onClick={() => setPestaña(k)}>{l}</button>)}</div>
        <div className="sd-inspector-body" key={`${sc.id}-${pestaña}`} role="tabpanel">
          {prot && <p className="text-xs text-emerald-200">🔒 Bloqueada (o su secuencia/acto): solo lectura. Desbloquéala para editar.</p>}
          {pestaña === "escena" && <>{campo("heading", "Encabezado", 1)}{campo("summary", "Qué pasa", 3)}{campo("objective", "Objetivo", 2)}{campo("obstacle", "Obstáculo", 2)}{campo("consequence", "Consecuencia", 2)}
            <div className="grid grid-cols-2 gap-2">
              <div className="sd-field"><label htmlFor={`ld-tension-${sc.id}`}>Tensión ({sc.tension}/10)</label><input id={`ld-tension-${sc.id}`} type="range" min={1} max={10} disabled={prot} defaultValue={sc.tension} key={`${sc.id}-t-${sc.tension}`} onPointerUp={e => editar(sc.id, "tension", Number((e.target as HTMLInputElement).value))} onKeyUp={e => editar(sc.id, "tension", Number((e.target as HTMLInputElement).value))} /></div>
              <div className="sd-field"><label htmlFor={`ld-min-${sc.id}`}>Minutos</label><input id={`ld-min-${sc.id}`} type="number" min={0.2} max={6} step={0.1} disabled={prot} defaultValue={sc.minutes} key={`${sc.id}-m-${sc.minutes}`} onBlur={e => editar(sc.id, "minutes", Math.max(0.2, Math.min(6, Number(e.target.value) || sc.minutes)))} /></div>
            </div></>}
          {pestaña === "guion" && p.renderGuion(sc)}
          {pestaña === "escenario" && <>
            <div className="sd-field"><label htmlFor={`ld-env-${sc.id}`}>Escenario fijo</label>
              <select id={`ld-env-${sc.id}`} className="aurora-field" disabled={prot || !o.escenarios?.length} value={sc.envId || ""} onChange={e => editar(sc.id, "envId", e.target.value || undefined)}>
                <option value="">— sin escenario fijo —</option>{(o.escenarios || []).map(e => <option key={e.id} value={e.id}>{e.nombre}{e.locked ? " 🔒" : ""}</option>)}</select></div>
            {env ? <><p className="text-sm text-slate-300">{escenarioTexto(env)}</p>{!!env.imagenes.length && <div className="flex gap-2">{env.imagenes.slice(0, 3).map((u, i) => <img key={i} src={u} alt={`Referencia ${i + 1} de ${env.nombre}`} className="h-16 w-16 rounded-lg object-cover" />)}</div>}</>
              : <p className="text-xs text-slate-400">Sin escenario: los prompts de las tomas no fijarán el decorado.</p>}
            <button type="button" className="sd-iconbtn" onClick={() => p.onIrA("escenarios")}>Gestionar escenarios</button>
          </>}
          {pestaña === "canon" && <>
            <div className="sd-field"><dt>Pasaje</dt><dd>{sc.source || "Dramatización (sin pasaje)"}</dd></div>
            {p.avisos.get(sc.id)?.length ? <ul className="list-disc space-y-1 pl-4 text-sm text-rose-200">{p.avisos.get(sc.id)!.map((t, i) => <li key={i}>{t}</li>)}</ul> : <p className="text-sm text-emerald-200">Sin avisos de canon.</p>}
            <button type="button" className="sd-iconbtn" onClick={() => p.onIrA("canon")}>Fuentes y canon</button>
          </>}
          {pestaña === "tomas" && <>
            {tomasDe(sc).length ? <ol className="grid gap-1.5">{tomasDe(sc).map((t, i) => <li key={t.id} className="flex items-center gap-2 text-sm"><b className="w-6">{i + 1}</b><span className="min-w-0 flex-1 truncate">{t.dialogo ? `${t.dialogo.speaker}: «${t.dialogo.text}»` : t.accion}</span><span className="sd-status" data-s={hecho(t) ? "aprobado" : t.estado === "revision" ? "clip" : "pendiente"}>{ESTADO_LABEL[t.estado]}</span></li>)}</ol>
              : <p className="text-sm text-slate-400">Aún sin tomas.</p>}
            <button type="button" className="sd-iconbtn" onClick={() => p.onIrA("tomas", sc.id)}>{tomasDe(sc).length ? "Abrir en Tomas y storyboard" : "Dividir en tomas"}</button>
          </>}
        </div>
      </aside>
    </div>}

    {vista === "secuencia" && <div className="sd-sequence">
      <div className="sd-seq-bar" role="group" aria-label="Escenas por duración">{escenas.map(s => <button key={s.id} type="button" aria-current={s.id === sc.id} data-incompleta={!s.script?.length} title={`${s.heading} · ${mmss(s.minutes)} · tensión ${s.tension}`} onClick={() => setActiva(s.id)} style={{ flexGrow: s.minutes || 1 }}>{s.tension}</button>)}</div>
      {o.acts.map((a, ai) => <div key={a.id} className="grid gap-1.5"><p className="ld-act-head"><span>Acto {ai + 1}</span><b>{a.title}</b></p>
        {a.sequences.flatMap(q => q.scenes).map(s => { const st = estadoEscena(s); return <button key={s.id} data-reorder-key={s.id} type="button" className="sd-seq-row" aria-current={s.id === sc.id} onClick={() => setActiva(s.id)} onDoubleClick={() => { setActiva(s.id); setVista("director"); }}>
          <b>{mmss(s.minutes)}</b><small>tensión {s.tension}</small><span className="min-w-0"><span className="block truncate text-sm font-semibold">{s.heading}</span><small className="block truncate">{s.summary}</small></span><span className="sd-status" data-s={st.s}>{st.t}</span></button>; })}</div>)}
      <p className="text-xs text-slate-400">Doble clic en una fila para abrirla en el director. Las barras rayadas aún no tienen guion.</p>
    </div>}

    {vista === "guion" && <div className="sd-script" aria-label="Guion del proyecto">{o.acts.map((a, ai) => <div key={a.id} className="grid gap-3"><p className="ld-act-head ld-act-big"><span>Acto {ai + 1}</span><b>{a.title}</b></p>
      {a.sequences.flatMap(q => q.scenes).map(s => <article key={s.id} data-reorder-key={s.id} aria-current={s.id === sc.id} tabIndex={0} onClick={() => setActiva(s.id)} onKeyDown={e => { if (e.key === "Enter") { setActiva(s.id); setVista("director"); } }}>
        <h4>{s.heading}</h4>
        {s.script?.length ? s.script.map((el, k) => el.type === "dialogo" || el.type === "off"
          ? <div key={k}><p className="sd-personaje">{el.speaker}{el.type === "off" ? " (OFF)" : ""}</p><p className="sd-dialogo">{el.text}</p></div>
          : <p key={k} className={el.type === "nota" ? "sd-nota" : "sd-accion"}>{el.type === "visual" || el.type === "sonido" ? `[${el.type.toUpperCase()}] ` : ""}{el.text}</p>)
          : <p className="sd-accion">{s.summary} (sin guion todavía)</p>}
        {s.id === sc.id && <button type="button" className="sd-iconbtn mt-2" onClick={e => { e.stopPropagation(); setVista("director"); }}>Ver en el director →</button>}
      </article>)}</div>)}</div>}

    <div className="sd-pipeline-wrap sd-panel" aria-label="Pipeline del proyecto">
      <div className="sd-panel-head">Pipeline del proyecto<span className="ml-auto normal-case tracking-normal">estado guardado real</span></div>
      <ol className="sd-pipeline ld-pipeline">{pasos.map(x => <li key={x.n} className="contents"><button type="button" className="sd-step" data-estado={x.estado} onClick={() => p.onIrA(x.ir)} aria-label={`${x.n}: ${x.d}`}>
        <b>{x.n}</b><small>{x.d}</small>{x.v !== undefined && <span className="sd-step-bar" aria-hidden="true"><i style={{ width: `${Math.round(x.v * 100)}%` }} /></span>}</button></li>)}</ol>
    </div>
  </section>;
}
