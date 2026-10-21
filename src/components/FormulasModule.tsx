"use client";
import { useState } from "react";
import { useData } from "@/lib/DataContext";

export default function FormulasModule(){
  const { data, insert, remove, mode } = useData();
  const items = data.formulas;
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("custom");

  async function submit(e: any){
    e.preventDefault();
    await insert("formulas", { name, content, category, structure: content.split(";").map(s => s.trim()).filter(Boolean) });
    setName(""); setContent("");
  }

  return <section>
    <h2 className="text-xl font-bold">Fórmulas virales</h2>
    <p className="text-xs text-slate-500 mt-1">{mode === "supabase" ? "Guardado en Supabase (tabla formulas, solo tu usuario)." : "Modo sin login: guardado en localStorage."}</p>
    <div className="grid gap-3 md:grid-cols-3 mt-4">
      {items.map(f => <article key={f.id} className="rounded-xl bg-[#121826] p-4 border border-slate-800">
        <b>{f.name}</b>
        <p className="text-sm text-slate-400 mt-1">{f.content}</p>
        <ol className="list-decimal ml-4 text-xs mt-2 space-y-1">{(f.structure || []).map((s: string, i: number) => <li key={i}>{s}</li>)}</ol>
        <button className="text-red-400 text-xs mt-2" onClick={() => remove("formulas", f.id)}>Eliminar</button>
      </article>)}
      {items.length === 0 && <p className="text-sm text-slate-400">Sin fórmulas todavía.</p>}
    </div>
    <form className="mt-4 flex gap-2 flex-wrap" onSubmit={submit}>
      <input placeholder="Nombre fórmula" value={name} onChange={e => setName(e.target.value)} required/>
      <input placeholder="Contenido (separa pasos con ;)" value={content} onChange={e => setContent(e.target.value)} required className="flex-1 min-w-[220px]"/>
      <select value={category} onChange={e => setCategory(e.target.value)}><option value="custom">Personalizada</option><option value="general">General</option><option value="tiktok-facebook">TikTok/Facebook</option><option value="cristiano">Cristiano</option></select>
      <button className="rounded bg-amber-500 text-black px-4 font-bold shrink-0">Guardar</button>
    </form>
  </section>;
}
