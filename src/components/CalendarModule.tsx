"use client";
import { useState } from "react";
import { useData } from "@/lib/DataContext";

export default function CalendarModule(){
  const { data, insert, remove, mode } = useData();
  const entries = data.calendarEntries;
  const accounts = data.accounts;
  const days = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];
  const today = new Date();
  const monday = new Date(today); monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const week = days.map((d, i) => { const dt = new Date(monday); dt.setDate(monday.getDate() + i); const iso = dt.toISOString().slice(0, 10); return { label: d, date: iso, count: entries.filter(e => e.date === iso).length, items: entries.filter(e => e.date === iso) }; });
  const empty = week.filter(d => d.count === 0);
  const [f, setF] = useState({ date: today.toISOString().slice(0, 10), title: "", accountId: "", platform: "TikTok" });

  async function submit(e: any){
    e.preventDefault();
    await insert("calendarEntries", { date: f.date, title: f.title, accountId: f.accountId || undefined, platform: f.platform });
    setF({ ...f, title: "" });
  }
  const accountName = (id?: string) => accounts.find(a => a.id === id)?.name;

  return <section>
    <h2 className="text-xl font-bold">Calendario semanal</h2>
    <p className="text-sm text-slate-400">Meta: 1-2 publicaciones diarias por cuenta ({accounts.length} cuentas) · {mode === "supabase" ? "Guardado en Supabase (calendar_entries)." : "Modo sin login: localStorage."}</p>
    {empty.length > 0 && <p className="mt-2 rounded bg-red-900/40 border border-red-700 p-2 text-sm">⚠️ Días sin contenido: {empty.map(d => d.label).join(", ")}</p>}
    <div className="grid gap-2 md:grid-cols-7 mt-4">
      {week.map(d => <div key={d.date} className={`rounded p-3 ${d.count === 0 ? "bg-red-950" : "bg-[#121826]"}`}>
        <b className="text-sm">{d.label}</b>
        <p className="text-xs text-slate-400">{d.date} · {d.count}/2</p>
        {d.items.map((e: any) => <p key={e.id} className="text-xs mt-1 flex justify-between gap-1">
          <span>• {e.title}{e.platform ? ` (${e.platform})` : ""}{accountName(e.accountId) ? ` · ${accountName(e.accountId)}` : ""}</span>
          <button className="text-red-400 shrink-0" title="Eliminar" onClick={() => remove("calendarEntries", e.id)}>✕</button>
        </p>)}
      </div>)}
    </div>
    <form className="mt-4 grid gap-2 md:grid-cols-5" onSubmit={submit}>
      <input type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} required/>
      <input placeholder="Título (ej. Ep.2 Manguito)" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} required/>
      <select value={f.accountId} onChange={e => setF({ ...f, accountId: e.target.value })}>
        <option value="">Cuenta…</option>
        {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
      <select value={f.platform} onChange={e => setF({ ...f, platform: e.target.value })}><option>Instagram</option><option>Facebook</option><option>TikTok</option><option>YouTube Shorts</option></select>
      <button className="rounded bg-amber-500 text-black font-bold">Programar</button>
    </form>
  </section>;
}
