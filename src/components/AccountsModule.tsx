"use client";
import { useState } from "react";
import { useData } from "@/lib/DataContext";

export default function AccountsModule(){
  const { data, insert, update, remove, mode } = useData();
  const items = data.accounts;
  const [f, setF] = useState({ name:"", platform:"TikTok", niche:"frutinovelas", audience:"", idealDuration:"90s" });
  const [editingId, setEditingId] = useState<string | null>(null);

  async function submit(e: any){
    e.preventDefault();
    if (editingId) { await update("accounts", editingId, { ...f }); setEditingId(null); }
    else { await insert("accounts", { ...f }); }
    setF({ ...f, name:"" });
  }
  function startEdit(a: any){ setEditingId(a.id); setF({ name:a.name, platform:a.platform, niche:a.niche, audience:a.audience||"", idealDuration:a.idealDuration||"90s" }); }

  return <section>
    <h2 className="text-xl font-bold">Cuentas</h2>
    <p className="text-xs text-slate-500 mt-1">{mode === "supabase" ? "Guardado en Supabase (tabla accounts, solo tu usuario)." : "Modo sin login: guardado en localStorage."}</p>
    <div className="grid gap-3 md:grid-cols-3 mt-4">
      {items.map(a => <article key={a.id} className="rounded-xl bg-[#121826] p-4 border border-slate-800">
        <b>{a.name}</b>
        <p className="text-sm text-slate-400">{a.platform} · {a.niche}<br/>{a.audience}<br/>Duración ideal: {a.idealDuration}</p>
        <div className="flex gap-3 mt-2">
          <button className="text-amber-300 text-xs" onClick={() => startEdit(a)}>Editar</button>
          <button className="text-red-400 text-xs" onClick={() => remove("accounts", a.id)}>Eliminar</button>
        </div>
      </article>)}
      {items.length === 0 && <p className="text-sm text-slate-400">Sin cuentas todavía. Agrega la primera abajo.</p>}
    </div>
    <form className="mt-4 grid gap-2 md:grid-cols-5" onSubmit={submit}>
      <input placeholder="Nombre" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} required/>
      <select value={f.platform} onChange={e => setF({ ...f, platform: e.target.value })}><option>Instagram</option><option>Facebook</option><option>TikTok</option><option>YouTube Shorts</option></select>
      <select value={f.niche} onChange={e => setF({ ...f, niche: e.target.value })}><option value="frutinovelas">frutinovelas</option><option value="cine90">cine 90</option><option value="cristiano">cristiano</option><option value="dropshipping">dropshipping</option></select>
      <input placeholder="Público" value={f.audience} onChange={e => setF({ ...f, audience: e.target.value })}/>
      <input placeholder="Duración ideal (ej. 90s)" value={f.idealDuration} onChange={e => setF({ ...f, idealDuration: e.target.value })}/>
      <button className="rounded bg-amber-500 text-black font-bold">{editingId ? "Guardar cambios" : "Agregar"}</button>
      {editingId && <button type="button" className="rounded border border-slate-600" onClick={() => { setEditingId(null); setF({ name:"", platform:"TikTok", niche:"frutinovelas", audience:"", idealDuration:"90s" }); }}>Cancelar edición</button>}
    </form>
  </section>;
}
