"use client";
// Scene Director — editor de escenas del episodio (Cinematic Aurora 2.0).
// Navegador de escenas · lienzo · inspector por pestañas · pipeline de producción, y vistas Storyboard,
// Secuencia y Guion. Todo sale de datos reales: escenas del episodio, fichas maestras, revisiones de clips
// (clipChecks) y archivos guardados en este navegador (archivosTrabajo). Nada se marca hecho sin registro.
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as RKE } from "react";
import { cargarArchivos } from "@/lib/archivosTrabajo";
import { duplicarEscena, editarEscena, moverEscenaCorta, type Mapa } from "@/lib/ordenEscenas";
import { sceneRole } from "@/lib/production";
import CopyButton from "./CopyButton";
import { Divisor, useAnchos } from "./studio/Divisores";

type Vista = "director" | "storyboard" | "secuencia" | "guion";
type Pestaña = "guion" | "personajes" | "ambiente" | "camara" | "prompt" | "audio" | "produccion";
type IrA = "elenco" | "imagenes" | "animacion" | "mesa";
export type Cambio = { mapa?: Mapa; etiqueta: string };
type Props = {
  out: any; episodeId?: string; usuario: string; cast: any[]; master: any[]; checks: any[]; referenceSignature: string;
  finished: boolean; productionReady: boolean; promptsOutdated: boolean; refreshing: boolean;
  active: number; onSelect: (n: number) => void;
  onCambiar: (siguiente: any, c: Cambio) => Promise<void>;
  onRefreshPrompts: () => void; onIrA: (t: IrA) => void;
};
const pad = (n: number) => String(n).padStart(2, "0");
const invertir = (m: Mapa): Mapa => Object.fromEntries(Object.entries(m).map(([a, b]) => [b, Number(a)]));

export default function SceneDirector(p: Props) {
  const scenes: any[] = Array.isArray(p.out?.scenes) ? p.out.scenes : [];
  const [vista, setVista] = useState<Vista>("director");
  const [pestaña, setPestaña] = useState<Pestaña>("guion");
  const [guardado, setGuardado] = useState<{ estado: "" | "guardando" | "guardado" | "error"; texto: string }>({ estado: "", texto: "" });
  const [concentracion, setConcentracion] = useState(false);
  const [menu, setMenu] = useState<number | null>(null);
  const [arrastre, setArrastre] = useState<{ de: number; sobre: number | null } | null>(null);
  // Deshacer / rehacer de esta sesión (cada paso se guarda de verdad; el historial del episodio guarda las versiones).
  const deshacerRef = useRef<{ out: any; mapa?: Mapa; etiqueta: string }[]>([]);
  const rehacerRef = useRef<{ out: any; mapa?: Mapa; etiqueta: string }[]>([]);
  const [, forzar] = useState(0);
  const escena = scenes.find(s => s.n === p.active) || scenes[0];
  const editable = !p.finished && !!p.episodeId;
  const paneles = useAnchos("director-corto");

  // Fotogramas y clips reales que el usuario subió a la mesa (guardados en este navegador).
  const [medios, setMedios] = useState<{ image: Record<number, string>; clip: Record<number, string> }>({ image: {}, clip: {} });
  useEffect(() => {
    if (!p.episodeId) return;
    let vivo = true; const urls: string[] = [];
    cargarArchivos(p.usuario, p.episodeId).then(a => {
      if (!vivo) return;
      const aUrl = (m: Record<number, File>) => Object.fromEntries(Object.entries(m).map(([n, f]) => { const u = URL.createObjectURL(f); urls.push(u); return [n, u]; }));
      setMedios({ image: aUrl(a.image), clip: aUrl(a.clip) });
    }).catch(() => {});
    return () => { vivo = false; urls.forEach(URL.revokeObjectURL); };
  }, [p.episodeId, p.usuario, scenes.length, p.out]);

  const masterDe = useCallback((name?: string) => p.master.find(m => m?.name?.toLowerCase() === String(name || "").toLowerCase()), [p.master]);
  const colorDe = (name?: string) => p.cast.find(c => c.name === name)?.subtitleColor || masterDe(name)?.subtitleColor;
  const estadoDe = useCallback((s: any) => {
    const ch = p.checks.find(c => c.clipIndex === s.n - 1);
    if (ch?.approved && ch.referenceSignature === p.referenceSignature) return { s: "aprobado", t: "Aprobada" };
    if (ch && !ch.approved && ch.notes) return { s: "rehacer", t: "Rehacer" };
    if (!s.line || !s.imagePromptFlow) return { s: "incompleta", t: "Incompleta" };
    if (medios.clip[s.n]) return { s: "clip", t: "Clip subido" };
    return { s: "pendiente", t: "Sin clip" };
  }, [p.checks, p.referenceSignature, medios.clip]);

  async function cambiar(siguiente: any, c: Cambio, desdeHistorial?: "deshacer" | "rehacer") {
    setGuardado({ estado: "guardando", texto: `Guardando: ${c.etiqueta}…` });
    try {
      const anterior = { out: p.out, mapa: c.mapa ? invertir(c.mapa) : undefined, etiqueta: c.etiqueta };
      await p.onCambiar(siguiente, c);
      if (desdeHistorial === "deshacer") rehacerRef.current.push({ out: p.out, mapa: c.mapa ? invertir(c.mapa) : undefined, etiqueta: c.etiqueta });
      else { deshacerRef.current.push(anterior); if (!desdeHistorial) rehacerRef.current = []; }
      deshacerRef.current = deshacerRef.current.slice(-20); forzar(x => x + 1);
      setGuardado({ estado: "guardado", texto: `Guardado · ${c.etiqueta}` });
    } catch (e: any) { setGuardado({ estado: "error", texto: `No se guardó (${e?.message || e}). Nada cambió.` }); }
  }
  const deshacer = () => { const d = deshacerRef.current.pop(); if (d) void cambiar(d.out, { mapa: d.mapa, etiqueta: `deshacer ${d.etiqueta}` }, "deshacer"); };
  const rehacer = () => { const r = rehacerRef.current.pop(); if (r) void cambiar(r.out, { mapa: r.mapa, etiqueta: `rehacer ${r.etiqueta}` }, "rehacer"); };
  const mover = (n: number, a: number) => { const r = moverEscenaCorta(p.out, n, a); if (r) { void cambiar(r.out, { mapa: r.mapa, etiqueta: `escena ${n} → posición ${a}` }); p.onSelect(a); } };
  const duplicar = (n: number) => { const r = duplicarEscena(p.out, n); if (r) { void cambiar(r.out, { mapa: r.mapa, etiqueta: `duplicar escena ${n}` }); p.onSelect(r.nueva); } };
  const editar = (n: number, campo: string, valor: any) => {
    const s = scenes.find(x => x.n === n); if (!s || String(s[campo] ?? "") === String(valor ?? "")) return;
    void cambiar(editarEscena(p.out, n, { [campo]: valor }), { etiqueta: `${campo} de la escena ${n}` });
  };

  // Atajos: Ctrl/Cmd+Z deshacer, Ctrl/Cmd+Shift+Z rehacer (fuera de los campos de texto).
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z" || /input|textarea|select/i.test((e.target as HTMLElement)?.tagName || "")) return;
      e.preventDefault(); if (e.shiftKey) rehacer(); else deshacer();
    };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.out]);
  useEffect(() => { if (menu === null) return; const cerrar = () => setMenu(null); const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(null); };
    window.addEventListener("click", cerrar); window.addEventListener("keydown", esc); return () => { window.removeEventListener("click", cerrar); window.removeEventListener("keydown", esc); }; }, [menu]);

  const teclaTarjeta = (e: RKE, s: any) => {
    const i = scenes.findIndex(x => x.n === s.n);
    if (editable && e.altKey && (e.key === "ArrowUp" || e.key === "ArrowLeft" || e.key === "ArrowDown" || e.key === "ArrowRight")) {
      e.preventDefault(); const a = s.n + (e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 1); if (a >= 1 && a <= scenes.length) mover(s.n, a); return;
    }
    const sig = e.key === "ArrowDown" || e.key === "ArrowRight" ? i + 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? scenes.length - 1 : -2;
    if (sig === -2) return; e.preventDefault();
    const n = scenes[Math.max(0, Math.min(scenes.length - 1, sig))]?.n; if (n) { p.onSelect(n); requestAnimationFrame(() => document.getElementById(`sd-card-${n}`)?.focus()); }
  };

  const total = scenes.reduce((a, s) => a + (Number(s.durationSec) || 8), 0);
  const tarjeta = (s: any, compacta = false) => {
    const st = estadoDe(s); const img = medios.image[s.n] || masterDe(s.speaker)?.imageUrl; const real = !!medios.image[s.n];
    const presentes: string[] = Array.isArray(s.characters) && s.characters.length ? s.characters : [s.speaker].filter(Boolean);
    return <div key={s.n} className="relative" role="listitem">
      <button type="button" id={`sd-card-${s.n}`} className="sd-card" data-spotlight aria-current={s.n === escena?.n} data-arrastrando={arrastre?.de === s.n} data-destino={arrastre?.sobre === s.n && arrastre.de !== s.n}
        aria-label={`Escena ${s.n}: ${s.title || ""}. ${st.t}.${editable ? " Alt y flechas para moverla." : ""}`}
        draggable={editable} onDragStart={e => { setArrastre({ de: s.n, sobre: null }); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(s.n)); }}
        onDragOver={e => { if (!arrastre) return; e.preventDefault(); if (arrastre.sobre !== s.n) setArrastre({ ...arrastre, sobre: s.n }); }}
        onDragEnd={() => setArrastre(null)} onDrop={e => { e.preventDefault(); const de = arrastre?.de; setArrastre(null); if (de && de !== s.n) mover(de, s.n); }}
        onClick={() => p.onSelect(s.n)} onKeyDown={e => teclaTarjeta(e, s)}>
        <span className="sd-thumb">{img && <img src={img} alt="" loading="lazy" />}<span className="sd-thumb-n">S{pad(s.n)}</span>{!compacta && <span className="sd-thumb-tag">{real ? "Fotograma subido" : img ? "Referencia del personaje" : "Sin fotograma"}</span>}</span>
        <span className="sd-card-body">
          <span className="sd-card-title">{s.title || `Escena ${s.n}`}</span>
          <span className="sd-card-line">{s.speaker ? `${s.speaker}: ` : ""}«{s.line || "sin diálogo"}»</span>
          <span className="sd-meta"><span>{s.durationSec || 8} s</span><span className="sd-status" data-s={st.s}>{st.t}</span>
            <span className="sd-faces" aria-label={`Personajes: ${presentes.join(", ")}`}>{presentes.slice(0, 4).map(n => { const m = masterDe(n); return m?.imageUrl ? <img key={n} src={m.imageUrl} alt="" /> : <span key={n} aria-hidden="true">{n.slice(0, 1)}</span>; })}</span></span>
        </span>
      </button>
      <span className="sd-card-menu"><button type="button" className="sd-iconbtn" aria-haspopup="menu" aria-expanded={menu === s.n} aria-label={`Acciones de la escena ${s.n}`} onClick={e => { e.stopPropagation(); setMenu(menu === s.n ? null : s.n); }}>⋯</button>
        {menu === s.n && <div className="aurora-menu right-0" role="menu" onClick={e => e.stopPropagation()}>
          {editable && <button role="menuitem" type="button" disabled={s.n <= 1} onClick={() => { setMenu(null); mover(s.n, s.n - 1); }}>↑ Mover antes</button>}
          {editable && <button role="menuitem" type="button" disabled={s.n >= scenes.length} onClick={() => { setMenu(null); mover(s.n, s.n + 1); }}>↓ Mover después</button>}
          {editable && <button role="menuitem" type="button" onClick={() => { setMenu(null); duplicar(s.n); }}>⧉ Duplicar escena</button>}
          <button role="menuitem" type="button" onClick={() => { setMenu(null); p.onSelect(s.n); setVista("director"); setPestaña("prompt"); }}>✦ Ver sus prompts</button>
          <button role="menuitem" type="button" onClick={() => { setMenu(null); p.onSelect(s.n); setVista("guion"); }}>¶ Ver en el guion</button>
          {p.productionReady && <button role="menuitem" type="button" onClick={() => { setMenu(null); p.onSelect(s.n); p.onIrA("mesa"); }}>▶ Ir a la mesa de revisión</button>}
        </div>}
      </span>
    </div>;
  };

  if (!scenes.length || !escena) return null;
  const aprobadas = scenes.filter(s => estadoDe(s).s === "aprobado").length;
  const conImagen = scenes.filter(s => medios.image[s.n]).length, conClip = scenes.filter(s => medios.clip[s.n]).length;
  const fichas = p.master.filter(m => m?.imageUrl && m?.referenceApprovedAt).length;
  const pasos: { n: string; d: string; estado: "hecho" | "en-curso" | "pendiente" | "bloqueado"; ir?: IrA; v?: number }[] = [
    { n: "Guion", d: `${scenes.length} escenas guardadas`, estado: "hecho" },
    { n: "Personajes", d: `${fichas}/${p.cast.length} fichas aprobadas`, estado: fichas === p.cast.length && p.cast.length ? "hecho" : "en-curso", ir: "elenco", v: p.cast.length ? fichas / p.cast.length : 0 },
    { n: "Prompts", d: p.promptsOutdated ? "Hay reglas nuevas" : "Al día", estado: !p.productionReady ? "bloqueado" : p.promptsOutdated ? "en-curso" : "hecho", ir: "imagenes" },
    { n: "Imágenes", d: `${conImagen}/${scenes.length} en este navegador`, estado: !p.productionReady ? "bloqueado" : conImagen === scenes.length ? "hecho" : conImagen ? "en-curso" : "pendiente", ir: "imagenes", v: conImagen / scenes.length },
    { n: "Clips", d: `${conClip}/${scenes.length} en este navegador`, estado: !p.productionReady ? "bloqueado" : conClip === scenes.length ? "hecho" : conClip ? "en-curso" : "pendiente", ir: "mesa", v: conClip / scenes.length },
    { n: "Revisión", d: `${aprobadas}/${scenes.length} aprobadas`, estado: !p.productionReady ? "bloqueado" : aprobadas === scenes.length ? "hecho" : aprobadas ? "en-curso" : "pendiente", ir: "mesa", v: aprobadas / scenes.length },
    { n: "Montaje", d: p.finished ? "Vídeo descargado" : "Pendiente", estado: p.finished ? "hecho" : !p.productionReady ? "bloqueado" : "pendiente", ir: "mesa" },
  ];
  const presentes: string[] = Array.isArray(escena.characters) && escena.characters.length ? escena.characters : [escena.speaker].filter(Boolean);
  const previa = scenes.find(s => s.n === escena.n - 1);
  const mismoLugar = previa && previa.location && escena.location ? previa.location === escena.location : null;
  const rol = sceneRole(scenes.findIndex(s => s.n === escena.n), scenes.length).title;
  const campo = (k: string, label: string, filas = 2) => <div className="sd-field" key={k}><label htmlFor={`sd-${k}-${escena.n}`}>{label}</label>
    {editable ? (filas === 1
      ? <input id={`sd-${k}-${escena.n}`} key={`${escena.n}-${k}-${escena[k]}`} className="aurora-field" defaultValue={escena[k] || ""} onBlur={e => editar(escena.n, k, e.target.value.trim())} onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
      : <textarea id={`sd-${k}-${escena.n}`} key={`${escena.n}-${k}-${escena[k]}`} className="aurora-field !min-h-0" rows={filas} defaultValue={escena[k] || ""} onBlur={e => editar(escena.n, k, e.target.value.trim())} />)
      : <p className="text-sm">{escena[k] || "—"}</p>}</div>;

  return <section className="sd" aria-label="Director de escenas" data-concentracion={concentracion}>
    <div className="sd-toolbar">
      <div className="sd-views" role="group" aria-label="Vista">{([["director", "Director"], ["storyboard", "Storyboard"], ["secuencia", "Secuencia"], ["guion", "Guion"]] as const).map(([v, l]) =>
        <button key={v} type="button" aria-pressed={vista === v} onClick={() => setVista(v)}>{l}</button>)}</div>
      <span className="text-xs text-slate-400">{scenes.length} escenas · {Math.floor(total / 60)}:{pad(total % 60)} de clips</span>
      <span className="ml-auto flex flex-wrap items-center gap-2">
        <span className="sd-save" role="status" aria-live="polite" data-estado={guardado.estado}>{guardado.texto || (editable ? "Los cambios se guardan al salir de cada campo" : p.finished ? "Episodio terminado: solo lectura" : "")}</span>
        {editable && <><button type="button" className="sd-iconbtn" disabled={!deshacerRef.current.length || guardado.estado === "guardando"} onClick={deshacer} title="Deshacer (Ctrl+Z)" aria-label="Deshacer">↶</button>
          <button type="button" className="sd-iconbtn" disabled={!rehacerRef.current.length || guardado.estado === "guardando"} onClick={rehacer} title="Rehacer (Ctrl+Shift+Z)" aria-label="Rehacer">↷</button></>}
        {vista === "guion" && <button type="button" className="sd-iconbtn" aria-pressed={concentracion} onClick={() => setConcentracion(!concentracion)}>{concentracion ? "Salir de concentración" : "Modo concentración"}</button>}
      </span>
    </div>

    {vista === "director" && <div className="sd-workspace" style={paneles.estilo}>
      <nav className="sd-panel" aria-label="Navegador de escenas"><div className="sd-panel-head">Escenas<span className="ml-auto normal-case tracking-normal">{aprobadas}/{scenes.length} aprobadas</span></div>
        <div className="sd-nav-list" role="list">{scenes.map(s => tarjeta(s))}</div></nav>
      <Divisor lado="izq" valor={paneles.anchos.izq} onCambio={v => paneles.cambiar("izq", v)} etiqueta="Ancho del navegador de escenas" />

      <div className="sd-panel sd-canvas" aria-label={`Escena ${escena.n}`}>
        <div className="sd-frame">
          {medios.clip[escena.n] ? <video key={medios.clip[escena.n]} src={medios.clip[escena.n]} controls preload="metadata" />
            : medios.image[escena.n] ? <img src={medios.image[escena.n]} alt={`Fotograma de la escena ${escena.n}`} />
            : masterDe(escena.speaker)?.imageUrl ? <img src={masterDe(escena.speaker).imageUrl} alt={`Referencia de ${escena.speaker}; aún no hay fotograma de la escena`} style={{ objectFit: "cover", opacity: .55 }} /> : null}
          <span className="sd-frame-label">{medios.clip[escena.n] ? "CLIP SUBIDO" : medios.image[escena.n] ? "FOTOGRAMA SUBIDO" : "SIN FOTOGRAMA · REFERENCIA"} · S{pad(escena.n)} · {rol.toUpperCase()}</span>
          {!medios.clip[escena.n] && <div className="sd-frame-title"><p className="text-xs uppercase tracking-widest text-sky-300">{escena.location || "Lugar sin definir"}</p><h3>{escena.title || `Escena ${escena.n}`}</h3><p>{escena.setting}</p></div>}
        </div>
        <div className="sd-line" style={{ ["--sd-color" as any]: colorDe(escena.speaker) }}>
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: colorDe(escena.speaker) }}>{escena.speaker || "Narración"}{escena.emotion ? ` · ${escena.emotion}` : ""}</p>
          <blockquote>«{escena.line || "Sin diálogo"}»</blockquote>
        </div>
        <div className="sd-continuity" aria-label="Continuidad">
          <span>{escena.shot || "Plano sin definir"}</span>
          {mismoLugar !== null && <span data-ok={String(mismoLugar || !!escena.transition)}>{mismoLugar ? `Mismo lugar que S${pad(escena.n - 1)}` : `Cambio de lugar desde S${pad(escena.n - 1)}${escena.transition ? "" : " sin transición"}`}</span>}
          {escena.transition && <span>Transición: {escena.transition}</span>}
          {presentes.map(n => <span key={n}>{n}{masterDe(n)?.referenceApprovedAt ? " · ficha ✓" : " · sin ficha"}</span>)}
        </div>
        <div className="sd-actions">
          <CopyButton text={escena.imagePromptFlow || ""} label="Copiar prompt de imagen" />
          <CopyButton text={escena.animationPrompt || ""} label="Copiar prompt de animación" />
          {editable && <button type="button" className="sd-iconbtn" onClick={() => duplicar(escena.n)}>⧉ Duplicar</button>}
          {editable && p.promptsOutdated && <button type="button" className="sd-iconbtn" disabled={p.refreshing} onClick={p.onRefreshPrompts}>{p.refreshing ? "Actualizando…" : "↻ Actualizar prompts"}</button>}
          {p.productionReady && <button type="button" className="sd-iconbtn" onClick={() => p.onIrA("mesa")}>▶ Revisar clip</button>}
        </div>
      </div>

      <Divisor lado="der" valor={paneles.anchos.der} onCambio={v => paneles.cambiar("der", v)} etiqueta="Ancho del inspector" />
      <aside className="sd-panel sd-inspector" aria-label="Inspector de la escena">
        <div className="sd-tabs" role="tablist" aria-label="Detalles de la escena">{([["guion", "Guion"], ["personajes", "Personajes"], ["ambiente", "Ambiente"], ["camara", "Cámara"], ["prompt", "Prompt"], ["audio", "Audio"], ["produccion", "Producción"]] as const).map(([k, l]) =>
          <button key={k} type="button" role="tab" aria-selected={pestaña === k} onClick={() => setPestaña(k)}>{l}</button>)}</div>
        <div className="sd-inspector-body" key={`${escena.n}-${pestaña}`} role="tabpanel">
          {pestaña === "guion" && <>
            <div className="sd-field"><label htmlFor={`sd-speaker-${escena.n}`}>Quién habla</label>
              {editable ? <select id={`sd-speaker-${escena.n}`} className="aurora-field" value={escena.speaker || ""} onChange={e => editar(escena.n, "speaker", e.target.value)}>
                {[...p.cast.map(c => c.name), "Narrador"].filter((v, i, a) => a.indexOf(v) === i).map(n => <option key={n} value={n}>{n}</option>)}</select> : <p>{escena.speaker}</p>}</div>
            {campo("line", "Frase", 3)}{campo("emotion", "Emoción", 1)}{campo("title", "Título del beat", 1)}{campo("goal", "Objetivo de la escena", 2)}
          </>}
          {pestaña === "personajes" && <div className="grid gap-2">{presentes.map(n => { const m = masterDe(n); return <div key={n} className="flex items-center gap-3 rounded-lg border border-white/10 p-2">
            {m?.imageUrl ? <img src={m.imageUrl} alt="" className="h-12 w-12 rounded-lg object-cover" /> : <span className="grid h-12 w-12 place-items-center rounded-lg bg-white/5">{n.slice(0, 1)}</span>}
            <span className="min-w-0 text-sm"><b className="block">{n}</b><span className={m?.referenceApprovedAt ? "text-emerald-300" : "text-amber-200"}>{m?.referenceApprovedAt ? `Ficha aprobada · v${m.referenceVersion || 1}` : "Ficha pendiente"}</span></span></div>; })}
            <button type="button" className="sd-iconbtn" onClick={() => p.onIrA("elenco")}>Abrir fichas del elenco</button></div>}
          {pestaña === "ambiente" && <>{campo("location", "Lugar fijo", 1)}{campo("setting", "Acción visual", 3)}{campo("sfx", "Ambiente sonoro", 2)}</>}
          {pestaña === "camara" && <>{campo("shot", "Plano y cámara", 2)}{campo("transition", "Transición", 1)}{campo("nextLink", "Conexión con la siguiente", 2)}</>}
          {pestaña === "prompt" && <>
            <p className="text-xs text-slate-400">Los prompts se rehacen solos con cada cambio del guion o del ambiente (sin IA, con las reglas actuales).</p>
            <div className="sd-field"><dt>Imagen (Flow)</dt><pre className="sd-prompt">{escena.imagePromptFlow || "—"}</pre><CopyButton text={escena.imagePromptFlow || ""} label="Copiar" /></div>
            <div className="sd-field"><dt>Animación</dt><pre className="sd-prompt">{escena.animationPrompt || "—"}</pre><CopyButton text={escena.animationPrompt || ""} label="Copiar" /></div>
          </>}
          {pestaña === "audio" && <>
            <div className="sd-field"><dt>Voz de {escena.speaker || "Narrador"}</dt><dd>{masterDe(escena.speaker)?.voice || masterDe(escena.speaker)?.speechStyle || p.cast.find(c => c.name === escena.speaker)?.voice || "Sin ficha de voz"}</dd></div>
            {campo("sfx", "Ambiente y efectos", 2)}{campo("music", "Música (se añade en el montaje)", 2)}
          </>}
          {pestaña === "produccion" && (() => { const st = estadoDe(escena); const ch = p.checks.find(c => c.clipIndex === escena.n - 1); return <>
            <div className="sd-field"><dt>Estado</dt><dd><span className="sd-status" data-s={st.s}>{st.t}</span></dd></div>
            <div className="sd-field"><dt>Archivos en este navegador</dt><dd>{medios.image[escena.n] ? "Imagen ✓" : "Sin imagen"} · {medios.clip[escena.n] ? "Clip ✓" : "Sin clip"}</dd></div>
            {ch?.notes && <div className="sd-field"><dt>Nota de revisión</dt><dd>{ch.notes}</dd></div>}
            {p.productionReady ? <button type="button" className="sd-iconbtn" onClick={() => p.onIrA("mesa")}>Subir o revisar en la mesa</button> : <p className="text-xs text-amber-200">Aprueba las fichas maestras para abrir la producción.</p>}
          </>; })()}
        </div>
      </aside>
    </div>}

    {vista === "storyboard" && <div className="sd-board" role="list" aria-label="Storyboard">{scenes.map(s => tarjeta(s, true))}</div>}

    {vista === "secuencia" && <div className="sd-sequence">
      <div className="sd-seq-bar" role="group" aria-label="Secuencia del episodio">{scenes.map((s, i) => { const r = sceneRole(i, scenes.length).title; const inc = estadoDe(s).s === "incompleta";
        return <button key={s.n} type="button" data-rol={r} data-incompleta={inc} aria-current={s.n === escena.n} title={`S${pad(s.n)} · ${r}${inc ? " · incompleta" : ""}`} onClick={() => p.onSelect(s.n)} style={{ flexGrow: Number(s.durationSec) || 8 }}>{pad(s.n)}</button>; })}</div>
      {(() => { let acum = 0; return scenes.map((s, i) => { const ini = acum; acum += Number(s.durationSec) || 8; const st = estadoDe(s); const sig = scenes[i + 1];
        return <button key={s.n} type="button" className="sd-seq-row" aria-current={s.n === escena.n} onClick={() => { p.onSelect(s.n); }} onDoubleClick={() => { p.onSelect(s.n); setVista("director"); }}>
          <b>S{pad(s.n)}</b><small>{Math.floor(ini / 60)}:{pad(ini % 60)} – {Math.floor(acum / 60)}:{pad(acum % 60)}</small>
          <span className="min-w-0"><span className="block truncate text-sm font-semibold">{[sceneRole(i, scenes.length).title, s.title].filter((v, k, a) => v && a.indexOf(v) === k).join(" · ")}</span><small className="block truncate">{s.location || "sin lugar"}{sig && sig.location && s.location && sig.location !== s.location ? ` → ${sig.location}` : ""}</small></span>
          <span className="sd-status" data-s={st.s}>{st.t}</span></button>; }); })()}
      <p className="text-xs text-slate-400">Doble clic en una fila para abrirla en el director.</p>
    </div>}

    {vista === "guion" && <div className="sd-script" aria-label="Guion del episodio">{scenes.map((s, i) => <article key={s.n} aria-current={s.n === escena.n} tabIndex={0} aria-label={`Escena ${s.n}. Intro para abrirla en el director`}
      onClick={() => p.onSelect(s.n)} onKeyDown={e => { if (e.key === "Enter") { p.onSelect(s.n); setVista("director"); } }}>
      <h4>Escena {s.n} · {[sceneRole(i, scenes.length).title, s.title].filter((v, k, a) => v && a.indexOf(v) === k).join(" · ")} — {s.location || "Lugar"}</h4>
      {s.setting && <p className="sd-accion">{s.setting}</p>}
      <p className="sd-personaje" style={{ color: colorDe(s.speaker) }}>{s.speaker || "Narrador"}{s.emotion ? <span className="font-normal normal-case tracking-normal text-slate-400"> ({s.emotion})</span> : null}</p>
      <p className="sd-dialogo">{s.line}</p>
      {s.goal && <p className="sd-nota">Beat: {s.goal}</p>}
      {s.n === escena.n && <button type="button" className="sd-iconbtn mt-2" onClick={e => { e.stopPropagation(); setVista("director"); }}>Ver en el director →</button>}
    </article>)}</div>}

    <div className="sd-pipeline-wrap sd-panel" aria-label="Pipeline de producción">
      <div className="sd-panel-head">Pipeline de producción<span className="ml-auto normal-case tracking-normal">estado guardado real · imágenes y clips de este navegador</span></div>
      <ol className="sd-pipeline">{pasos.map(x => <li key={x.n} className="contents"><button type="button" className="sd-step" data-estado={x.estado} disabled={!x.ir || x.estado === "bloqueado"} onClick={() => x.ir && p.onIrA(x.ir)}
        aria-label={`${x.n}: ${x.d}${x.estado === "bloqueado" ? " (bloqueado: faltan fichas aprobadas)" : ""}`}>
        <b>{x.n}</b><small>{x.d}</small>{x.v !== undefined && <span className="sd-step-bar" aria-hidden="true"><i style={{ width: `${Math.round(x.v * 100)}%` }} /></span>}</button></li>)}</ol>
    </div>
  </section>;
}
