"use client";
// Fuentes y canon (solo fuentes propias + texto bíblico de la API pública getbible.net) y escenarios fijos
// del proyecto largo. Se guardan dentro del proyecto (story_outlines).
import { useState } from "react";
import { validarCitas } from "@/lib/biblia";
import {
  allScenes, CATEGORIAS, canonAvisos, detectarEscenarios, newId, NIVELES, nuevoEscenario,
  type Afirmacion, type Canon, type Categoria, type Escenario, type Fuente, type Nivel, type Outline,
} from "@/lib/outline";

const TIPOS_FUENTE: Record<Fuente["tipo"], string> = { biblia: "Pasaje bíblico", historica: "Fuente histórica", documental: "Documental", tradicion: "Tradición extrabíblica", otra: "Otra" };
const COLOR_CAT: Record<Categoria, string> = { texto: "border-emerald-400/40 text-emerald-200", interpretacion: "border-sky-400/40 text-sky-200", tradicion: "border-amber-400/40 text-amber-200", invencion: "border-fuchsia-400/40 text-fuchsia-200" };
const canonDe = (o: Outline): Canon => o.canon || { nivel: "fundamentada", fuentes: [], afirmaciones: [] };

async function traerTexto(ref: string) {
  const r = await fetch(`/api/biblia?ref=${encodeURIComponent(ref)}`);
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return { texto: j.versos.map((v: any) => `${v.v} ${v.t}`).join(" "), version: j.version, url: j.fuente, ref: j.ref };
}

export function CanonPanel({ outline, guardar, revisarIA, busy }: { outline: Outline; guardar: (o: Outline) => Promise<void>; revisarIA: () => Promise<void>; busy: boolean }) {
  const canon = canonDe(outline);
  const set = (c: Partial<Canon>) => guardar({ ...outline, canon: { ...canon, ...c } });
  const [f, setF] = useState<Fuente>({ id: "", tipo: "biblia", titulo: "", ref: "" });
  const [a, setA] = useState<Afirmacion>({ id: "", texto: "", categoria: "texto", fuentes: [] });
  const [msg, setMsg] = useState("");
  const [trayendo, setTrayendo] = useState(false);
  const validacion = f.tipo === "biblia" && f.ref ? validarCitas(f.ref) : [];
  const avisos = canonAvisos(outline);
  // Pasajes que citan las escenas y aún no están registrados como fuente.
  const sinRegistrar = Array.from(new Set(avisos.filter(x => /sin registrar/.test(x.texto)).map(x => /cita (.+?) sin registrar/.exec(x.texto)?.[1]).filter(Boolean) as string[]));

  async function traer() {
    if (!f.ref) return;
    setTrayendo(true); setMsg("");
    try { const t = await traerTexto(f.ref); setF({ ...f, ref: t.ref, texto: t.texto, version: t.version, url: t.url, titulo: f.titulo || t.ref }); }
    catch (e: any) { setMsg(e?.message || String(e)); } finally { setTrayendo(false); }
  }
  async function registrarPendientes() {
    setTrayendo(true); setMsg("");
    const nuevas: Fuente[] = [];
    for (const ref of sinRegistrar) {
      try { const t = await traerTexto(ref); nuevas.push({ id: newId("f"), tipo: "biblia", ref: t.ref, titulo: t.ref, texto: t.texto, version: t.version, url: t.url }); }
      catch { nuevas.push({ id: newId("f"), tipo: "biblia", ref, titulo: ref }); }
    }
    await set({ fuentes: [...canon.fuentes, ...nuevas] });
    setMsg(`Registrados ${nuevas.length} pasajes${nuevas.some(n => !n.texto) ? " (algunos sin texto: vuelve a «Traer el texto» más tarde)" : ""}.`);
    setTrayendo(false);
  }

  return <div className="space-y-4 text-sm">
    <label className="block text-xs text-slate-300">Nivel de adaptación
      <select value={canon.nivel} onChange={e => set({ nivel: e.target.value as Nivel })} className="mt-1">{(Object.keys(NIVELES) as Nivel[]).map(k => <option key={k} value={k}>{NIVELES[k]}</option>)}</select></label>

    {avisos.length > 0 && <div className="rounded-xl border border-amber-400/30 bg-amber-400/[.05] p-3 text-xs">
      <p className="font-semibold text-amber-100">Avisos de canon ({avisos.length})</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-amber-200">{avisos.slice(0, 20).map((x, i) => <li key={i}>{x.texto}</li>)}</ul>
      {sinRegistrar.length > 0 && <button type="button" disabled={trayendo} onClick={registrarPendientes} className="mt-2 rounded bg-amber-500 px-2 py-1 font-bold text-black disabled:opacity-50">Registrar los {sinRegistrar.length} pasajes de las escenas y traer su texto</button>}
    </div>}

    <div className="rounded-xl border border-white/10 p-3">
      <p className="text-xs font-semibold text-slate-300">Fuentes del proyecto ({canon.fuentes.length})</p>
      <ul className="mt-2 space-y-2">{canon.fuentes.map(x => <li key={x.id} className="rounded-lg bg-white/[.03] p-2 text-xs">
        <div className="flex flex-wrap items-center gap-2"><span className="rounded border border-white/15 px-1.5 text-slate-300">{TIPOS_FUENTE[x.tipo]}</span><b>{x.ref || x.titulo}</b>{x.version && <span className="text-slate-500">{x.version}</span>}
          {x.url && <a href={x.url} target="_blank" rel="noreferrer" className="text-sky-300 underline">fuente</a>}
          <button type="button" onClick={() => confirm("¿Quitar esta fuente?") && set({ fuentes: canon.fuentes.filter(y => y.id !== x.id), afirmaciones: canon.afirmaciones.map(af => ({ ...af, fuentes: af.fuentes.filter(id => id !== x.id) })) })} className="ml-auto text-slate-500 hover:text-rose-300">Quitar</button></div>
        {x.texto && <p className="mt-1 line-clamp-3 italic text-slate-300">«{x.texto}»</p>}
        {x.nota && <p className="mt-1 text-slate-400">{x.nota}</p>}
      </li>)}</ul>
      <div className="mt-3 grid gap-2 border-t border-white/10 pt-3 sm:grid-cols-2">
        <label className="text-xs text-slate-300">Tipo<select value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value as Fuente["tipo"] })} className="mt-1">{(Object.keys(TIPOS_FUENTE) as Fuente["tipo"][]).map(k => <option key={k} value={k}>{TIPOS_FUENTE[k]}</option>)}</select></label>
        {f.tipo === "biblia" ? <label className="text-xs text-slate-300">Cita (libro capítulo:versículos)
          <span className="mt-1 flex gap-2"><input value={f.ref || ""} onChange={e => setF({ ...f, ref: e.target.value })} placeholder="Daniel 10:1-21" />
            <button type="button" disabled={trayendo || !validacion.length || !validacion.every(v => v.ok)} onClick={traer} className="shrink-0 rounded border border-sky-400/40 px-2 text-sky-200 disabled:opacity-40">{trayendo ? "…" : "Traer el texto"}</button></span>
          {validacion.map((v, i) => <span key={i} className={`block text-[11px] ${v.ok ? "text-emerald-300" : "text-rose-300"}`}>{v.ok ? `✓ ${v.cita!.texto} existe` : `✗ ${v.error}`}</span>)}</label>
          : <label className="text-xs text-slate-300">Título<input value={f.titulo} onChange={e => setF({ ...f, titulo: e.target.value })} className="mt-1" placeholder={f.tipo === "tradicion" ? "Libro de Enoc 1:9 (tradición)" : "Título de la fuente"} /></label>}
        <label className="text-xs text-slate-300">Enlace verificable (opcional)<input value={f.url || ""} onChange={e => setF({ ...f, url: e.target.value })} className="mt-1" placeholder="https://…" /></label>
        <label className="text-xs text-slate-300">Nota (opcional)<input value={f.nota || ""} onChange={e => setF({ ...f, nota: e.target.value })} className="mt-1" placeholder="Controversia, interpretación, contexto…" /></label>
        <label className="text-xs text-slate-300 sm:col-span-2">Texto de la fuente<textarea value={f.texto || ""} onChange={e => setF({ ...f, texto: e.target.value })} rows={3} className="mt-1" placeholder={f.tipo === "biblia" ? "Pulsa «Traer el texto» (Reina-Valera 1909) o pégalo" : "Pega el fragmento que respalda la historia"} /></label>
        <button type="button" disabled={busy || (f.tipo === "biblia" ? !(validacion.length && validacion.every(v => v.ok)) : !f.titulo.trim())}
          onClick={() => { void set({ fuentes: [...canon.fuentes, { ...f, id: newId("f"), titulo: f.titulo || f.ref || "" }] }); setF({ id: "", tipo: f.tipo, titulo: "", ref: "" }); }}
          className="rounded-lg bg-violet-500 px-3 py-2 text-xs font-bold text-white disabled:opacity-40 sm:col-span-2">Añadir fuente</button>
      </div>
    </div>

    <div className="rounded-xl border border-white/10 p-3">
      <p className="text-xs font-semibold text-slate-300">Afirmaciones de la historia ({canon.afirmaciones.length}) · qué es texto y qué es dramatización</p>
      <ul className="mt-2 space-y-1">{canon.afirmaciones.map(x => <li key={x.id} className="flex flex-wrap items-start gap-2 text-xs">
        <span className={`rounded border px-1.5 ${COLOR_CAT[x.categoria]}`}>{CATEGORIAS[x.categoria]}</span><span className="flex-1 text-slate-200">{x.texto}
          {x.fuentes.length > 0 && <span className="block text-slate-500">Fuentes: {x.fuentes.map(id => canon.fuentes.find(y => y.id === id)?.ref || canon.fuentes.find(y => y.id === id)?.titulo).filter(Boolean).join(" · ")}</span>}
          {x.incertidumbre && <span className="block text-amber-300">Incierto: {x.incertidumbre}</span>}</span>
        <button type="button" onClick={() => set({ afirmaciones: canon.afirmaciones.filter(y => y.id !== x.id) })} className="text-slate-500 hover:text-rose-300">Quitar</button></li>)}</ul>
      <div className="mt-3 grid gap-2 border-t border-white/10 pt-3">
        <input value={a.texto} onChange={e => setA({ ...a, texto: e.target.value })} placeholder="Ej.: El príncipe de Persia resistió al mensajero 21 días" />
        <div className="flex flex-wrap gap-2 text-xs">{(Object.keys(CATEGORIAS) as Categoria[]).map(k => <button key={k} type="button" aria-pressed={a.categoria === k} onClick={() => setA({ ...a, categoria: k })} className={`rounded-full border px-2 py-1 ${a.categoria === k ? COLOR_CAT[k] + " bg-white/5" : "border-white/10 text-slate-400"}`}>{CATEGORIAS[k]}</button>)}</div>
        {canon.fuentes.length > 0 && <div className="flex flex-wrap gap-2 text-xs">{canon.fuentes.map(x => <label key={x.id} className="flex items-center gap-1 text-slate-300"><input type="checkbox" className="w-auto" checked={a.fuentes.includes(x.id)} onChange={e => setA({ ...a, fuentes: e.target.checked ? [...a.fuentes, x.id] : a.fuentes.filter(id => id !== x.id) })} />{x.ref || x.titulo}</label>)}</div>}
        <input value={a.incertidumbre || ""} onChange={e => setA({ ...a, incertidumbre: e.target.value })} placeholder="Incertidumbre o controversia (opcional)" />
        <button type="button" disabled={busy || !a.texto.trim()} onClick={() => { void set({ afirmaciones: [...canon.afirmaciones, { ...a, id: newId("af") }] }); setA({ id: "", texto: "", categoria: a.categoria, fuentes: [] }); }} className="rounded-lg bg-violet-500 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">Añadir afirmación</button>
      </div>
    </div>

    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={busy || !canon.fuentes.some(x => x.texto) || !allScenes(outline).length} onClick={() => void revisarIA()} className="rounded-lg border border-sky-400/40 px-3 py-2 text-xs text-sky-200 disabled:opacity-40">Revisar las escenas contra las fuentes (IA)</button>
      {canon.revision && <span className="text-[11px] text-slate-400">Última revisión: {new Date(canon.revision.at).toLocaleString("es-DO")} · {canon.revision.avisos.length} posible(s) contradicción(es)</span>}
    </div>
    {msg && <p role="status" className="text-xs text-slate-300">{msg}</p>}
    <p className="text-[11px] text-slate-500">El texto bíblico viene de la Reina-Valera 1909 (dominio público) a través de la API gratuita de getbible.net. Si una cita no existe, la app lo dice y no inventa texto.</p>
  </div>;
}

// Imagen de referencia reducida (máx. 480 px, JPEG) para guardarla dentro del proyecto sin que pese.
export function reducir(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => { const k = Math.min(1, 480 / Math.max(img.width, img.height)); const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL("image/jpeg", 0.8)); };
    img.onerror = rej; img.src = url;
  });
}
const CAMPOS: [keyof Escenario, string, string][] = [
  ["periodo", "Período o universo", "Babilonia, siglo VI a. C."], ["arquitectura", "Arquitectura", "muros de adobe, columnas de piedra"], ["geografia", "Geografía", "ribera del río Tigris"],
  ["materiales", "Materiales", "barro cocido, lino, bronce"], ["luz", "Iluminación", "amanecer dorado, luz lateral"], ["clima", "Clima", "seco, viento con polvo"],
  ["persistentes", "Elementos que siempre están", "juncos, barcas de pesca"], ["atmosfera", "Atmósfera", "silencio, solemnidad"], ["objetos", "Objetos importantes", "manto de Daniel, rollo"],
];

export function EscenariosPanel({ outline, guardar, busy }: { outline: Outline; guardar: (o: Outline) => Promise<void>; busy: boolean }) {
  const lista = outline.escenarios || [];
  const usos = (id: string) => allScenes(outline).filter(s => s.envId === id).length;
  const setE = (id: string, patch: Partial<Escenario>) => guardar({ ...outline, escenarios: lista.map(e => e.id === id ? { ...e, ...patch } : e) });
  const [nombre, setNombre] = useState("");
  return <div className="space-y-3 text-sm">
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={busy || !allScenes(outline).length} onClick={() => guardar(detectarEscenarios(outline))} className="rounded-lg bg-violet-500 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">Detectar los escenarios de las escenas</button>
      <span className="flex gap-1"><input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nuevo escenario" className="w-48 text-xs" />
        <button type="button" disabled={!nombre.trim()} onClick={() => { void guardar({ ...outline, escenarios: [...lista, nuevoEscenario(nombre.trim())] }); setNombre(""); }} className="rounded border border-white/15 px-2 text-xs disabled:opacity-40">Añadir</button></span>
    </div>
    {!lista.length && <p className="text-xs text-slate-400">Sin escenarios todavía. Detéctalos de las escenas o añádelos a mano: cada escena que vuelva a un lugar respetará su ficha.</p>}
    {lista.map(e => <div key={e.id} className={`rounded-xl border p-3 ${e.locked ? "border-emerald-400/30" : "border-white/10"}`}>
      <div className="flex flex-wrap items-center gap-2"><b>{e.nombre}</b><span className="text-xs text-slate-500">{usos(e.id)} escena(s)</span>
        <button type="button" onClick={() => setE(e.id, { locked: !e.locked })} className={`ml-auto text-xs ${e.locked ? "text-emerald-300" : "text-slate-400"}`}>{e.locked ? "🔒 Decorado bloqueado" : "🔓 Bloquear decorado"}</button>
        {!e.locked && <button type="button" onClick={() => confirm(`¿Quitar el escenario «${e.nombre}»?`) && guardar({ ...outline, escenarios: lista.filter(x => x.id !== e.id) })} className="text-xs text-slate-500 hover:text-rose-300">Quitar</button>}</div>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">{CAMPOS.map(([k, label, ph]) => <label key={k} className="text-[11px] text-slate-400">{label}
        <input defaultValue={String(e[k] || "")} disabled={e.locked} placeholder={ph} onBlur={ev => { if (ev.target.value !== e[k]) void setE(e.id, { [k]: ev.target.value } as Partial<Escenario>); }} className="mt-0.5 text-xs" /></label>)}</div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {e.imagenes.map((src, i) => <span key={i} className="relative"><img src={src} alt={`Referencia ${i + 1} de ${e.nombre}`} className="h-20 w-20 rounded object-cover" />
          {!e.locked && <button type="button" aria-label="Quitar imagen" onClick={() => setE(e.id, { imagenes: e.imagenes.filter((_, k) => k !== i) })} className="absolute right-0 top-0 rounded bg-black/70 px-1 text-xs">✕</button>}</span>)}
        {!e.locked && e.imagenes.length < 6 && <label className="cursor-pointer rounded border border-dashed border-white/20 px-2 py-1 text-xs text-slate-300">+ Imagen de referencia
          <input type="file" accept="image/*" className="sr-only" onChange={async ev => { const file = ev.target.files?.[0]; if (file) await setE(e.id, { imagenes: [...e.imagenes, await reducir(file)] }); ev.target.value = ""; }} /></label>}
      </div>
      <div className="mt-2 text-xs">
        <p className="text-slate-400">Cambios del decorado en la historia (las escenas posteriores los respetan):</p>
        <ul className="list-disc pl-4 text-slate-300">{e.versiones.map(v => <li key={v.at}>{new Date(v.at).toLocaleDateString("es-DO")}: {v.nota}</li>)}</ul>
        <button type="button" onClick={() => { const nota = prompt("¿Qué cambia en este lugar? (ej.: tras la batalla, el muro está derrumbado)"); if (nota?.trim()) void setE(e.id, { versiones: [...e.versiones, { at: new Date().toISOString(), nota: nota.trim() }] }); }} className="mt-1 text-sky-300 underline">Registrar un cambio</button>
      </div>
    </div>)}
  </div>;
}
