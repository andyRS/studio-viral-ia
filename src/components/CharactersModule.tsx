"use client";
import { useEffect, useRef, useState } from "react";
import { useData } from "@/lib/DataContext";

const EMPTY = { name:"", seriesId:"", visualES:"", visualEN:"", clothing:"", subtitleColor:"#ffffff", speechStyle:"", pronunciations:"" };

export default function CharactersModule({ focusCharacterId }: { focusCharacterId?: string } = {}){
  const { data, insert, update, remove, mode } = useData();
  const focusedCharacterRef = useRef<string | null>(null);
  const items = data.characters;
  const series = data.series;
  const [newSeriesTitle, setNewSeriesTitle] = useState("");
  const [f, setF] = useState({ ...EMPTY });

  useEffect(() => {
    if (!focusCharacterId) { focusedCharacterRef.current = null; return; }
    if (focusedCharacterRef.current === focusCharacterId || !items.some(c => c.id === focusCharacterId)) return;
    const card = document.getElementById("character-" + focusCharacterId);
    if (!card) return;
    card.focus({ preventScroll: true });
    card.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    focusedCharacterRef.current = focusCharacterId;
  }, [focusCharacterId, items]);

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
    if (file.size > 2 * 1024 * 1024) { window.alert("La ficha debe pesar menos de 2 MB para guardarla en tu cuenta. Exporta una copia comprimida desde Flow."); return; }
    if (c.referenceApprovedAt && !window.confirm(`La ficha aprobada de ${c.name} quedará pendiente de nueva aprobación. ¿Crear versión ${Number(c.referenceVersion || 0) + 1}?`)) return;
    const r = new FileReader();
    r.onload = () => { const history = [...(c.referenceHistory || [])]; if (c.referenceApprovedAt && c.imageUrl) history.push({ version: c.referenceVersion || 1, imageUrl: c.imageUrl, approvedAt: c.referenceApprovedAt }); void update("characters", c.id, { imageUrl: r.result as string, referenceApprovedAt: undefined, referenceVersion: Number(c.referenceVersion || 0) + 1, referenceHistory: history }); };
    r.readAsDataURL(file);
  }
  function restoreReference(c: any) {
    const history = [...(c.referenceHistory || [])];
    const previous = history.pop(); if (!previous) return;
    if (!window.confirm(`Restaurar la ficha aprobada v${previous.version} de ${c.name}? Los episodios deberán revisarse con la nueva versión.`)) return;
    if (c.referenceApprovedAt && c.imageUrl) history.push({ version: c.referenceVersion || 1, imageUrl: c.imageUrl, approvedAt: c.referenceApprovedAt });
    void update("characters", c.id, { imageUrl: previous.imageUrl, referenceApprovedAt: new Date().toISOString(), referenceVersion: Number(c.referenceVersion || 0) + 1, referenceHistory: history });
  }

  return <section>
    <h2 className="text-xl font-bold">Personajes</h2>
    <p className="text-xs text-slate-400 mt-1">{mode === "supabase" ? "Los cambios se guardan en tu cuenta." : "Modo local: los cambios se guardan en este navegador."}</p>

    {series.map((s: any) => <div key={s.id} className="mt-4">
      <h3 className="font-semibold text-amber-400">{s.title}</h3>
      {s.description && <p className="text-xs text-slate-400">{s.description}</p>}
      <div className="grid gap-3 md:grid-cols-3 mt-2">
        {items.filter(c => c.seriesId === s.id).map(c => <article key={c.id} id={"character-" + c.id} tabIndex={-1} aria-label={"Personaje " + c.name} className={"rounded-xl bg-[#121826] p-4 border border-slate-800 " + (focusCharacterId === c.id ? "ring-2 ring-[#598BFF]" : "")}>
          <div className="flex justify-between"><b>{c.name}</b><span style={{ background: c.subtitleColor }} className="h-4 w-4 rounded-full inline-block"/></div>
          <p className="text-xs text-slate-300 mt-2"><b>ES:</b> {c.visualES}<br/><b>EN:</b> {c.visualEN}<br/><b>Ropa:</b> {c.clothing}<br/><b>Habla:</b> {c.speechStyle}<br/><b>Subtítulo:</b> {c.subtitleColor}</p>
          <ul className="text-xs text-amber-200 mt-2">{(c.pronunciations || []).map((p: string, i: number) => <li key={i}>• {p}</li>)}</ul>
          {c.imageUrl && <img src={c.imageUrl} alt={"Referencia visual de " + c.name} className="mt-3 aspect-[9/16] max-h-64 rounded-lg border border-white/10 object-contain bg-black/30"/>}
          <p className="mt-2 text-xs font-semibold text-amber-200">{c.referenceApprovedAt ? `✓ Ficha maestra aprobada · v${c.referenceVersion || 1}` : c.imageUrl ? `Ficha v${c.referenceVersion || 1} pendiente de aprobación` : "Sin ficha visual aprobada"}</p>
          {c.imageUrl && <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => { void update("characters", c.id, { referenceApprovedAt: new Date().toISOString() }); }} className="rounded-lg bg-emerald-400 px-3 py-1.5 text-xs font-bold text-slate-950">{c.referenceApprovedAt ? "Reafirmar aprobación" : "Aprobar ficha maestra"}</button>
            <a href={c.imageUrl} download={`${c.name.replace(/[^a-z0-9áéíóúñ]+/gi, "-")}-ficha-v${c.referenceVersion || 1}.png`} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-slate-200">Descargar copia</a>
          </div>}
          {!!c.referenceHistory?.length && <button type="button" onClick={() => restoreReference(c)} className="mt-2 text-xs text-sky-300 hover:text-sky-200">Restaurar última ficha aprobada (v{c.referenceHistory[c.referenceHistory.length - 1].version})</button>}
          <label htmlFor={"character-image-" + c.id} className="mt-2 block text-xs text-slate-300">Imagen de referencia de {c.name}</label>
          <input id={"character-image-" + c.id} type="file" accept="image/*" className="mt-1 text-xs" onChange={e => onImage(c, e.target.files?.[0])}/>
          <div className="flex items-center gap-2 mt-2">
            <label htmlFor={"character-color-" + c.id} className="text-xs text-slate-300">Color de subtítulo:</label>
            <input id={"character-color-" + c.id} type="color" value={c.subtitleColor || "#ffffff"} onChange={e => update("characters", c.id, { subtitleColor: e.target.value })} className="w-10 h-6 p-0 bg-transparent"/>
            <button className="text-slate-400 hover:text-red-300 text-xs ml-auto" onClick={() => deleteCharacter(c)}>Eliminar</button>
          </div>
        </article>)}
        {items.filter(c => c.seriesId === s.id).length === 0 && <p className="text-xs text-slate-500">Sin personajes en esta serie todavía.</p>}
      </div>
    </div>)}

    {/* Personajes sin serie asignada (ej. recién migrados) */}
    {items.some(c => !series.find((s: any) => s.id === c.seriesId)) && <div className="mt-4">
      <h3 className="font-semibold text-amber-400">Sin serie asignada</h3>
      <div className="grid gap-3 md:grid-cols-3 mt-2">
        {items.filter(c => !series.find((s: any) => s.id === c.seriesId)).map(c => <article key={c.id} id={"character-" + c.id} tabIndex={-1} aria-label={"Personaje " + c.name} className={"rounded-xl bg-[#121826] p-4 border border-slate-800 " + (focusCharacterId === c.id ? "ring-2 ring-[#598BFF]" : "")}>
          <b>{c.name}</b>
          <p className="text-xs text-slate-300 mt-2"><b>ES:</b> {c.visualES}<br/><b>EN:</b> {c.visualEN}</p>
          <button className="text-slate-400 hover:text-red-300 text-xs mt-2" onClick={() => deleteCharacter(c)}>Eliminar</button>
        </article>)}
      </div>
    </div>}

    <div className="mt-6 grid gap-4 md:grid-cols-2">
      <form className="rounded-xl bg-[#121826] p-4 border border-slate-800 space-y-2" onSubmit={submit}>
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
      <form className="rounded-xl bg-[#121826] p-4 border border-slate-800 space-y-2 self-start" onSubmit={e => { e.preventDefault(); void addSeries(); }}>
        <h3 className="font-bold text-sm">Nueva serie</h3>
        <label htmlFor="new-series-title" className="field-label block">Título de la serie</label>
        <input id="new-series-title" placeholder="Ej.: La familia de Manguito" value={newSeriesTitle} onChange={e => setNewSeriesTitle(e.target.value)} required/>
        <button type="submit" className="rounded bg-slate-700 px-4 py-2 text-sm">Crear serie</button>
        <p className="text-xs text-slate-500">Las series agrupan personajes y se usan en el Generador.</p>
      </form>
    </div>
  </section>;
}
