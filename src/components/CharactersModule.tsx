"use client";
import { prepararFicha } from "@/lib/imagenFicha";
import { useEffect, useRef, useState } from "react";
import ReferencePreview from "./ReferencePreview";
import WorkspaceIntro, { WorkspaceLoading } from "./WorkspaceIntro";
import { normBible, type CharacterBible } from "@/lib/personajes";
import { useData } from "@/lib/DataContext";
import { useDeleteSeries } from "@/lib/useDelete";
import { accentOf } from "@/lib/cast";

// Pone «Acento: X.» al principio de la forma de hablar (lo leen los prompts de animación).
const withAccent = (speech: string, accent: string) => `Acento: ${accent}. ${String(speech || "").replace(/acento\s*:?\s*[^.;,\n]+[.;,]?\s*/i, "").trim()}`.trim();

const EMPTY = { name:"", seriesId:"", visualES:"", visualEN:"", clothing:"", subtitleColor:"#ffffff", speechStyle:"", pronunciations:"" };

export default function CharactersModule({ focusCharacterId }: { focusCharacterId?: string } = {}){
  const { data, insert, update, remove, mode } = useData();
  const deleteSeries = useDeleteSeries();
  const focusedCharacterRef = useRef<string | null>(null);
  const items = data.characters;
  const series = data.series;
  const [newSeriesTitle, setNewSeriesTitle] = useState("");
  const [f, setF] = useState({ ...EMPTY });
  const [query, setQuery] = useState("");
  const [seriesFilter, setSeriesFilter] = useState("");
  const [referenceFilter, setReferenceFilter] = useState("");
  useEffect(() => { if (focusCharacterId) { setQuery(""); setSeriesFilter(""); setReferenceFilter(""); } }, [focusCharacterId]);

  useEffect(() => {
    if (!focusCharacterId) { focusedCharacterRef.current = null; return; }
    if (focusedCharacterRef.current === focusCharacterId || !items.some(c => c.id === focusCharacterId)) return;
    const card = document.getElementById("character-" + focusCharacterId);
    if (!card) return;
    card.focus({ preventScroll: true });
    card.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    focusedCharacterRef.current = focusCharacterId;
  }, [focusCharacterId, items, query, seriesFilter, referenceFilter]);

  function deleteCharacter(character: { id: string; name: string }){
    if (window.confirm("¿Eliminar a «" + character.name + "»? Esta acción no se puede deshacer.")) void remove("characters", character.id);
  }

  async function addSeries(){
    if (!newSeriesTitle.trim()) return;
    const s = await insert("series", { title: newSeriesTitle.trim(), description: "" });
    setNewSeriesTitle("");
    if (s?.id) setF(prev => ({ ...prev, seriesId: s.id }));
  }
  async function submit(e: any){
    e.preventDefault();
    if (!f.seriesId) return;
    await insert("characters", {
      name: f.name, seriesId: f.seriesId,
      visualES: f.visualES, visualEN: f.visualEN, clothing: f.clothing,
      subtitleColor: f.subtitleColor, speechStyle: f.speechStyle,
      pronunciations: f.pronunciations.split("\n").map(s => s.trim()).filter(Boolean),
    });
    setF({ ...EMPTY, seriesId: f.seriesId });
  }
  function onImage(c: any, file: File | undefined){
    if (!file) return;
    if (c.referenceApprovedAt && !window.confirm(`La ficha aprobada de ${c.name} quedará pendiente de nueva aprobación. ¿Crear versión ${Number(c.referenceVersion || 0) + 1}?`)) return;
    // Fotos grandes (2K, PNG…): se recomprimen solas conservando la resolución, sin rechazarlas.
    void prepararFicha(file).then(({ url }) => { const history = [...(c.referenceHistory || [])]; if (c.referenceApprovedAt && c.imageUrl) history.push({ version: c.referenceVersion || 1, imageUrl: c.imageUrl, approvedAt: c.referenceApprovedAt }); void update("characters", c.id, { imageUrl: url, referenceApprovedAt: undefined, referenceVersion: Number(c.referenceVersion || 0) + 1, referenceHistory: history }); }).catch((e: any) => window.alert(`No se pudo usar esa imagen: ${e?.message || e}`));
  }
  function restoreReference(c: any) {
    const history = [...(c.referenceHistory || [])];
    const previous = history.pop(); if (!previous) return;
    if (!window.confirm(`Restaurar la ficha aprobada v${previous.version} de ${c.name}? Los episodios deberán revisarse con la nueva versión.`)) return;
    if (c.referenceApprovedAt && c.imageUrl) history.push({ version: c.referenceVersion || 1, imageUrl: c.imageUrl, approvedAt: c.referenceApprovedAt });
    void update("characters", c.id, { imageUrl: previous.imageUrl, referenceApprovedAt: new Date().toISOString(), referenceVersion: Number(c.referenceVersion || 0) + 1, referenceHistory: history });
  }

  const orphan = (c: typeof items[number]) => !series.some(s => s.id === c.seriesId);
  const visible = items.filter(c => (!seriesFilter || (seriesFilter === "__none" ? orphan(c) : c.seriesId === seriesFilter)) &&
    (!referenceFilter || (referenceFilter === "approved" ? !!c.imageUrl && !!c.referenceApprovedAt : referenceFilter === "pending" ? !!c.imageUrl && !c.referenceApprovedAt : !c.imageUrl)) &&
    `${c.name} ${c.visualES} ${c.visualEN} ${c.speechStyle}`.toLocaleLowerCase("es").includes(query.toLocaleLowerCase("es")));
  const filtered = !!query || !!seriesFilter || !!referenceFilter;
  const characterCard = (c: typeof items[number]) => <article key={c.id} id={"character-" + c.id} tabIndex={-1} aria-label={"Personaje " + c.name} className={"cast-card" + (focusCharacterId === c.id ? " cast-card-focused" : "")}>
    <div className="cast-portrait">{c.imageUrl ? <ReferencePreview src={c.imageUrl} title={c.name} previous={c.referenceHistory?.at(-1)?.imageUrl} previousLabel={`Ficha aprobada v${c.referenceHistory?.at(-1)?.version || 1}`} /> : <div className="cast-portrait-empty"><span aria-hidden="true">{c.name.slice(0, 2).toLocaleUpperCase("es")}</span><p>Sin referencia visual</p></div>}<span className="cast-portrait-label">FICHA DE PERSONAJE</span></div>
    <div className="cast-card-content"><div className="cast-card-heading"><h4>{c.name}</h4><span style={{ background: c.subtitleColor }} className="cast-subtitle-dot" aria-label={`Color de subtítulo ${c.subtitleColor}`} /></div>
    <p className="cast-description">{c.visualES || c.visualEN || "Define su apariencia para mantener una identidad consistente."}</p>
          <p className="mt-2 text-xs font-semibold text-amber-200">{c.referenceApprovedAt ? `✓ Ficha maestra aprobada · v${c.referenceVersion || 1}` : c.imageUrl ? `Ficha v${c.referenceVersion || 1} pendiente de aprobación` : "Sin ficha visual aprobada"}</p>
          {c.imageUrl && <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => { void update("characters", c.id, { referenceApprovedAt: new Date().toISOString() }); }} className="rounded-lg bg-emerald-400 px-3 py-1.5 text-xs font-bold text-slate-950">{c.referenceApprovedAt ? "Reafirmar aprobación" : "Aprobar ficha maestra"}</button>
            <a href={c.imageUrl} download={`${c.name.replace(/[^a-z0-9áéíóúñ]+/gi, "-")}-ficha-v${c.referenceVersion || 1}.png`} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-slate-200">Descargar copia</a>
          </div>}

    <details className="cast-card-details"><summary>Identidad y referencias <span aria-hidden="true">＋</span></summary><div>
      <dl className="cast-identity"><div><dt>Visual ES</dt><dd>{c.visualES || "Sin definir"}</dd></div><div><dt>Visual EN</dt><dd>{c.visualEN || "Sin definir"}</dd></div><div><dt>Vestuario</dt><dd>{c.clothing || "Sin definir"}</dd></div><div><dt>Forma de hablar</dt><dd>{c.speechStyle || "Sin definir"}</dd></div></dl>
      {!!c.pronunciations?.length && <ul className="mt-3 text-xs text-amber-200">{c.pronunciations.map((text, index) => <li key={index}>• {text}</li>)}</ul>}
          {!!c.referenceHistory?.length && <button type="button" onClick={() => restoreReference(c)} className="mt-2 text-xs text-sky-300 hover:text-sky-200">Restaurar última ficha aprobada (v{c.referenceHistory[c.referenceHistory.length - 1].version})</button>}
          <label htmlFor={"character-image-" + c.id} className="mt-2 block text-xs text-slate-300">Imagen de referencia de {c.name}</label>
          <input id={"character-image-" + c.id} type="file" accept="image/*" className="mt-1 text-xs" onChange={e => onImage(c, e.target.files?.[0])}/>
          <div className="flex items-center gap-2 mt-2">
            <label htmlFor={"character-color-" + c.id} className="text-xs text-slate-300">Color de subtítulo:</label>
            <input id={"character-color-" + c.id} type="color" value={c.subtitleColor || "#ffffff"} onChange={e => update("characters", c.id, { subtitleColor: e.target.value })} className="w-10 h-6 p-0 bg-transparent"/>
            <button className="text-slate-400 hover:text-red-300 text-xs ml-auto" onClick={() => deleteCharacter(c)}>Eliminar</button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label htmlFor={"character-accent-" + c.id} className="text-xs text-slate-300">Acento:</label>
            <select id={"character-accent-" + c.id} value={/dominican/.test(accentOf(c)) ? "dominicano marcado" : accentOf(c) && !/neutr/.test(accentOf(c)) ? "otro" : "latino neutro"} onChange={e => { const v = e.target.value === "otro" ? window.prompt("¿Qué acento? (p. ej. venezolano, cibaeño, cubano)", "") : e.target.value; if (v) void update("characters", c.id, { speechStyle: withAccent(c.speechStyle, v) }); }} className="w-auto py-1 text-xs">
              <option value="latino neutro">Latino neutro</option><option value="dominicano marcado">Dominicano marcado</option><option value="otro">{accentOf(c) && !/dominican|neutr/.test(accentOf(c)) ? `Otro: ${accentOf(c)}` : "Otro…"}</option>
            </select>
          </div>
          <BibliaPersonaje c={c} guardar={bible => update("characters", c.id, { bible })} />

    </div></details></div>
  </article>;
  if (mode === "cargando") return <WorkspaceLoading label="Creative Studio / Personajes" />;
  return <section className="growth-workspace creative-library characters-studio space-y-6">
    <WorkspaceIntro eyebrow="Creative Studio / Identidad del elenco" title="Personajes que dejan huella." description="Una mirada, una voz, una identidad. Reúne las fichas y los rasgos que acompañarán a tus personajes en cada historia." index="01 / ELENCO">
      <a className="studio-primary-action" href="#character-create">+ Nuevo personaje</a><p className="growth-source">{mode === "supabase" ? "Datos de tu cuenta" : "Datos de este navegador"}</p>
    </WorkspaceIntro>
    <div className="growth-summary" aria-label="Resumen del elenco"><div><span>PERSONAJES</span><strong>{items.length.toString().padStart(2,"0")}</strong><small>Identidades del estudio</small></div><div><span>FICHAS APROBADAS</span><strong>{items.filter(c => c.imageUrl && c.referenceApprovedAt).length}<em>/ {items.length}</em></strong><small>Referencias maestras aprobadas</small></div><div><span>POR REVISAR</span><strong>{items.filter(c => !c.imageUrl || !c.referenceApprovedAt).length}</strong><small>Sin imagen o sin aprobación</small></div></div>
    <div className="creative-filterbar"><label>Buscar personaje<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Nombre, apariencia o voz…" /></label><label>Filtrar serie<select value={seriesFilter} onChange={e => setSeriesFilter(e.target.value)}><option value="">Todas las series</option>{series.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}<option value="__none">Sin serie asignada</option></select></label><label>Estado de referencia<select value={referenceFilter} onChange={e => setReferenceFilter(e.target.value)}><option value="">Todos los estados</option><option value="approved">Ficha aprobada</option><option value="pending">Pendiente de aprobación</option><option value="missing">Sin imagen</option></select></label><span className="creative-result-count" aria-live="polite">{visible.length} {visible.length === 1 ? "personaje" : "personajes"}</span></div>
    {series.filter(s => (!seriesFilter || s.id === seriesFilter) && (!filtered || visible.some(c => c.seriesId === s.id))).map(s => <section className="cast-series" key={s.id} aria-label={`Elenco de ${s.title}`}><header><div><p className="studio-eyebrow">UNIVERSO / {items.filter(c => c.seriesId === s.id).length} PERSONAJES</p><h3>{s.title}</h3>{s.description && <p className="creative-note">{s.description}</p>}</div><details className="creative-context-menu"><summary aria-label={`Opciones de la serie ${s.title}`}>···</summary><div><button type="button" onClick={() => { void deleteSeries(s); }}>Eliminar serie</button></div></details></header><div className="cast-gallery">{visible.filter(c => c.seriesId === s.id).map(characterCard)}</div>{!items.some(c => c.seriesId === s.id) && <p className="creative-note mt-4">Esta serie aún no tiene personajes. Añade el primero en el formulario.</p>}</section>)}
    {visible.some(orphan) && <section className="cast-series" aria-label="Personajes sin serie"><header><div><p className="studio-eyebrow">POR ORGANIZAR</p><h3>Sin serie asignada</h3></div></header><div className="cast-gallery">{visible.filter(orphan).map(characterCard)}</div></section>}
    {!visible.length && <div className="growth-empty"><span aria-hidden="true">◎</span><h3>{items.length ? "No hay personajes para esta búsqueda." : "Dale un rostro a tu próxima historia."}</h3><p>{items.length ? "Prueba otra serie o estado de referencia." : "Crea una serie y añade su elenco para construir la identidad visual."}</p>{filtered && <button type="button" className="studio-text-action" onClick={() => { setQuery(""); setSeriesFilter(""); setReferenceFilter(""); }}>Limpiar filtros</button>}</div>}
    <div className="mt-6 grid gap-4 md:grid-cols-2">
      <form id="character-create" className="creative-compose space-y-3" onSubmit={submit}>
        <h3 className="font-bold text-sm">Nuevo personaje</h3>
        <label htmlFor="new-character-name" className="field-label block">Nombre</label>
        <input id="new-character-name" placeholder="Nombre del personaje" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} required/>
        <label htmlFor="new-character-series" className="field-label block">Serie</label>
        <select id="new-character-series" value={f.seriesId} onChange={e => setF({ ...f, seriesId: e.target.value })} required>
          <option value="">Selecciona una serie</option>
          {series.map((s: any) => <option key={s.id} value={s.id}>{s.title}</option>)}
        </select>
        <label htmlFor="new-character-visual-es" className="field-label block">Descripción visual fija (ES)</label>
        <textarea id="new-character-visual-es" placeholder="Descripción en español" value={f.visualES} onChange={e => setF({ ...f, visualES: e.target.value })}/>
        <label htmlFor="new-character-visual-en" className="field-label block">Descripción visual fija (EN)</label>
        <textarea id="new-character-visual-en" placeholder="Description in English" value={f.visualEN} onChange={e => setF({ ...f, visualEN: e.target.value })}/>
        <label htmlFor="new-character-clothing" className="field-label block">Ropa</label>
        <input id="new-character-clothing" placeholder="Vestuario constante" value={f.clothing} onChange={e => setF({ ...f, clothing: e.target.value })}/>
        <label htmlFor="new-character-speech" className="field-label block">Forma de hablar</label>
        <input id="new-character-speech" placeholder="Tono, acento y muletillas" value={f.speechStyle} onChange={e => setF({ ...f, speechStyle: e.target.value })}/>
        <div className="flex items-center gap-2"><label htmlFor="new-character-color" className="text-xs text-slate-300">Color de subtítulo:</label><input id="new-character-color" type="color" value={f.subtitleColor} onChange={e => setF({ ...f, subtitleColor: e.target.value })} className="w-12 h-7 p-0 bg-transparent"/></div>
        <label htmlFor="new-character-pronunciations" className="field-label block">Pronunciaciones obligatorias (una por línea)</label>
        <textarea id="new-character-pronunciations" placeholder="Ej.: tíguere se dice TÍ-gue-re, nunca tigre" value={f.pronunciations} onChange={e => setF({ ...f, pronunciations: e.target.value })}/>
        {series.length === 0 && <p className="text-xs text-amber-200">Crea una serie antes de guardar un personaje.</p>}
        <button type="submit" disabled={series.length === 0} className="rounded bg-amber-500 text-black font-bold px-4 py-2">Guardar personaje</button>
      </form>
      <form className="creative-compose creative-series-compose space-y-3 self-start" onSubmit={e => { e.preventDefault(); void addSeries(); }}>
        <h3 className="font-bold text-sm">Nueva serie</h3>
        <label htmlFor="new-series-title" className="field-label block">Título de la serie</label>
        <input id="new-series-title" placeholder="Ej.: La familia de Manguito" value={newSeriesTitle} onChange={e => setNewSeriesTitle(e.target.value)} required/>
        <button type="submit" className="rounded bg-slate-700 px-4 py-2 text-sm">Crear serie</button>
        <p className="text-xs text-slate-500">Las series agrupan personajes y se usan en el Generador.</p>
      </form>
    </div>
  </section>;
}

// Biblia extendida del personaje: rasgos fijos, vestuario, paleta, lo prohibido, voz, relaciones, candado y versiones.
const CAMPOS_BIBLIA: [keyof CharacterBible, string, string][] = [
  ["rasgos", "Rasgos invariables", "Rostro, edad, complexión, pelo, cicatrices… lo que nunca cambia"],
  ["paleta", "Paleta de color", "Ej.: lino crudo, azul índigo, cuero marrón"],
  ["negativo", "Nunca debe aparecer (prompt negativo)", "Ej.: barba larga, ropa moderna, tatuajes"],
  ["voz", "Voz, idioma y acento", "Ej.: grave y pausada, español latino neutro"],
  ["relaciones", "Relaciones", "Ej.: amigo de Ananías; enemigo del sátrapa"],
];
function BibliaPersonaje({ c, guardar }: { c: any; guardar: (b: CharacterBible) => Promise<any> }) {
  const [open, setOpen] = useState(false);
  const b = normBible(c.bible);
  // Los cambios se acumulan sobre la última biblia (local) y se guardan en cola: dos campos editados seguidos
  // no se pisan aunque el guardado tarde. Cuando no hay nada pendiente, manda lo que llega de la cuenta.
  const ultima = useRef<CharacterBible>(b); const pendientes = useRef(0); const cola = useRef<Promise<unknown>>(Promise.resolve());
  if (pendientes.current === 0) ultima.current = b;
  const set = (patch: Partial<CharacterBible> | ((x: CharacterBible) => Partial<CharacterBible>)) => {
    ultima.current = { ...ultima.current, ...(typeof patch === "function" ? patch(ultima.current) : patch) };
    const valor = ultima.current; pendientes.current++;
    cola.current = cola.current.catch(() => {}).then(() => guardar(valor)).finally(() => { pendientes.current--; });
  };
  const completos = CAMPOS_BIBLIA.filter(([k]) => String(b[k] || "").trim()).length + (b.vestuario?.length ? 1 : 0);
  return <div className="mt-3 rounded-lg border border-white/10">
    <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-2 p-2 text-left text-xs">
      <b className="text-teal-200">Biblia del personaje</b><span className="text-slate-400">{completos}/6 {b.candado ? "· 🔒 identidad bloqueada" : ""}</span><span className="ml-auto text-slate-500">{open ? "▲" : "▼"}</span>
    </button>
    {open && <div className="space-y-2 border-t border-white/10 p-2 text-xs">
      {CAMPOS_BIBLIA.map(([k, label, ph]) => <label key={k} className="block text-slate-300">{label}
        <textarea defaultValue={String(b[k] || "")} placeholder={ph} rows={2} disabled={b.candado && (k === "rasgos" || k === "paleta")} className="mt-1 text-xs"
          onBlur={e => { if (e.target.value !== String(b[k] || "")) set({ [k]: e.target.value } as any); }} /></label>)}
      <div className="text-slate-300">Variantes de vestuario
        <ul className="mt-1 space-y-1">{(b.vestuario || []).map((v, i) => <li key={i} className="flex items-center gap-2"><span className="flex-1 text-slate-200">• {v}</span>
          <button type="button" onClick={() => set(x => ({ vestuario: (x.vestuario || []).filter((_, j) => j !== i) }))} className="text-slate-500 hover:text-red-300">Quitar</button></li>)}</ul>
        <button type="button" onClick={() => { const v = window.prompt("Nueva variante de vestuario (p. ej. «manto real de Babilonia, bordado en oro»)"); if (v?.trim()) set(x => ({ vestuario: [...(x.vestuario || []), v.trim()] })); }} className="mt-1 text-sky-300">+ Añadir variante</button>
      </div>
      <label className="flex items-center gap-2 text-slate-300"><input type="checkbox" checked={!!b.candado} onChange={e => set({ candado: e.target.checked, versiones: [...(ultima.current.versiones || []), { at: new Date().toISOString(), nota: e.target.checked ? "identidad bloqueada" : "identidad desbloqueada" }] })} className="h-auto w-auto" />
        Candado de identidad (la IA no cambia su aspecto; rasgos y paleta quedan fijos)</label>
      <button type="button" onClick={() => { const nota = window.prompt("¿Qué cambió en el personaje? (queda en su historial)"); if (nota?.trim()) set({ versiones: [...(ultima.current.versiones || []), { at: new Date().toISOString(), nota: nota.trim() }] }); }} className="text-sky-300">Registrar un cambio</button>
      {!!b.versiones?.length && <ul className="space-y-0.5 text-slate-400">{b.versiones.slice().reverse().map(v => <li key={v.at}>{new Date(v.at).toLocaleDateString("es-DO")} · {v.nota}</li>)}</ul>}
    </div>}
  </div>;
}
