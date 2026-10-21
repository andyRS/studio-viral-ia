"use client";
import { useState } from "react";
import { useData } from "@/lib/DataContext";

const EMPTY = { name:"", seriesId:"", visualES:"", visualEN:"", clothing:"", subtitleColor:"#ffffff", speechStyle:"", pronunciations:"" };

export default function CharactersModule(){
  const { data, insert, update, remove, mode } = useData();
  const items = data.characters;
  const series = data.series;
  const [newSeriesTitle, setNewSeriesTitle] = useState("");
  const [f, setF] = useState({ ...EMPTY });

  async function addSeries(){
    if (!newSeriesTitle.trim()) return;
    const s = await insert("series", { title: newSeriesTitle.trim(), description: "" });
    setNewSeriesTitle("");
    if (s?.id) setF(prev => ({ ...prev, seriesId: s.id }));
  }
  async function submit(e: any){
    e.preventDefault();
    await insert("characters", {
      name: f.name, seriesId: f.seriesId || series[0]?.id || "",
      visualES: f.visualES, visualEN: f.visualEN, clothing: f.clothing,
      subtitleColor: f.subtitleColor, speechStyle: f.speechStyle,
      pronunciations: f.pronunciations.split("\n").map(s => s.trim()).filter(Boolean),
    });
    setF({ ...EMPTY, seriesId: f.seriesId });
  }
  function onImage(c: any, file: File | undefined){
    if (!file) return;
    const r = new FileReader();
    r.onload = () => update("characters", c.id, { imageUrl: r.result as string });
    r.readAsDataURL(file);
  }

  return <section>
    <h2 className="text-xl font-bold">Personajes</h2>
    <p className="text-xs text-slate-500 mt-1">{mode === "supabase" ? "Guardado en Supabase (tablas characters y series, solo tu usuario)." : "Modo sin login: guardado en localStorage."}</p>

    {series.map((s: any) => <div key={s.id} className="mt-4">
      <h3 className="font-semibold text-amber-400">{s.title}</h3>
      {s.description && <p className="text-xs text-slate-400">{s.description}</p>}
      <div className="grid gap-3 md:grid-cols-3 mt-2">
        {items.filter(c => c.seriesId === s.id).map(c => <article key={c.id} className="rounded-xl bg-[#121826] p-4 border border-slate-800">
          <div className="flex justify-between"><b>{c.name}</b><span style={{ background: c.subtitleColor }} className="h-4 w-4 rounded-full inline-block"/></div>
          <p className="text-xs text-slate-300 mt-2"><b>ES:</b> {c.visualES}<br/><b>EN:</b> {c.visualEN}<br/><b>Ropa:</b> {c.clothing}<br/><b>Habla:</b> {c.speechStyle}<br/><b>Subtítulo:</b> {c.subtitleColor}</p>
          <ul className="text-xs text-amber-200 mt-2">{(c.pronunciations || []).map((p: string, i: number) => <li key={i}>• {p}</li>)}</ul>
          {c.imageUrl && <img src={c.imageUrl} alt={c.name} className="mt-2 rounded"/>}
          <input type="file" accept="image/*" className="mt-2 text-xs" onChange={e => onImage(c, e.target.files?.[0])}/>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-slate-400">Color subtítulo:</span>
            <input type="color" value={c.subtitleColor || "#ffffff"} onChange={e => update("characters", c.id, { subtitleColor: e.target.value })} className="w-10 h-6 p-0 bg-transparent"/>
            <button className="text-red-400 text-xs ml-auto" onClick={() => remove("characters", c.id)}>Eliminar</button>
          </div>
        </article>)}
        {items.filter(c => c.seriesId === s.id).length === 0 && <p className="text-xs text-slate-500">Sin personajes en esta serie todavía.</p>}
      </div>
    </div>)}

    {/* Personajes sin serie asignada (ej. recién migrados) */}
    {items.some(c => !series.find((s: any) => s.id === c.seriesId)) && <div className="mt-4">
      <h3 className="font-semibold text-amber-400">Sin serie asignada</h3>
      <div className="grid gap-3 md:grid-cols-3 mt-2">
        {items.filter(c => !series.find((s: any) => s.id === c.seriesId)).map(c => <article key={c.id} className="rounded-xl bg-[#121826] p-4 border border-slate-800">
          <b>{c.name}</b>
          <p className="text-xs text-slate-300 mt-2"><b>ES:</b> {c.visualES}<br/><b>EN:</b> {c.visualEN}</p>
          <button className="text-red-400 text-xs mt-2" onClick={() => remove("characters", c.id)}>Eliminar</button>
        </article>)}
      </div>
    </div>}

    <div className="mt-6 grid gap-4 md:grid-cols-2">
      <form className="rounded-xl bg-[#121826] p-4 border border-slate-800 space-y-2" onSubmit={submit}>
        <h3 className="font-bold text-sm">➕ Nuevo personaje</h3>
        <input placeholder="Nombre" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} required/>
        <select value={f.seriesId} onChange={e => setF({ ...f, seriesId: e.target.value })}>
          <option value="">Serie…</option>
          {series.map((s: any) => <option key={s.id} value={s.id}>{s.title}</option>)}
        </select>
        <textarea placeholder="Descripción visual fija (ES)" value={f.visualES} onChange={e => setF({ ...f, visualES: e.target.value })}/>
        <textarea placeholder="Fixed visual description (EN)" value={f.visualEN} onChange={e => setF({ ...f, visualEN: e.target.value })}/>
        <input placeholder="Ropa" value={f.clothing} onChange={e => setF({ ...f, clothing: e.target.value })}/>
        <input placeholder="Forma de hablar" value={f.speechStyle} onChange={e => setF({ ...f, speechStyle: e.target.value })}/>
        <div className="flex items-center gap-2"><span className="text-xs text-slate-400">Color de subtítulo:</span><input type="color" value={f.subtitleColor} onChange={e => setF({ ...f, subtitleColor: e.target.value })} className="w-12 h-7 p-0 bg-transparent"/></div>
        <textarea placeholder={"Pronunciaciones obligatorias (una por línea)\nej.: tíguere se dice TÍ-gue-re, nunca tigre"} value={f.pronunciations} onChange={e => setF({ ...f, pronunciations: e.target.value })}/>
        <button className="rounded bg-amber-500 text-black font-bold px-4 py-2">Guardar personaje</button>
      </form>
      <div className="rounded-xl bg-[#121826] p-4 border border-slate-800 space-y-2 self-start">
        <h3 className="font-bold text-sm">➕ Nueva serie</h3>
        <input placeholder="Título de la serie" value={newSeriesTitle} onChange={e => setNewSeriesTitle(e.target.value)}/>
        <button type="button" onClick={addSeries} className="rounded bg-slate-700 px-4 py-2 text-sm">Crear serie</button>
        <p className="text-xs text-slate-500">Las series agrupan personajes y se usan en el Generador.</p>
      </div>
    </div>
  </section>;
}
