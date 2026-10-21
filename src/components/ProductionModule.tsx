"use client";
import { useState } from "react";
import { useData } from "@/lib/DataContext";

const stages = ["Idea","Guion","Clips generados","Montaje","Publicado"];
const checks: [string, string][] = [["facesConsistent","Caras consistentes"],["fullPhrases","Frases completas"],["pronunciationOk","Pronunciación correcta"],["noWatermark","Sin marca de agua"],["fruitHeads","Cabezas de fruta en todas las tomas"]];

export default function ProductionModule(){
  const { data, insert, update, remove, mode } = useData();
  const cards = data.productionCards; const costs = data.costs; const clipChecks = data.clipChecks; const episodes = data.episodes;
  const [newTitle, setNewTitle] = useState("");
  const [selectedCardId, setSelectedCardId] = useState("");
  const [costForm, setCostForm] = useState({ tool: "Higgsfield", credits: 10, costUsd: 2.5, episodeId: "" });
  const total = costs.reduce((a, c) => a + Number(c.costUsd || 0), 0);
  const selectedCard = cards.find(c => c.id === selectedCardId) || cards[0];
  // La ficha de revisión se asocia al episodio de la tarjeta (o a la propia
  // tarjeta si aún no hay episodio generado): una fila en clip_checks.
  const checkKey = selectedCard ? (selectedCard.episodeId || selectedCard.id) : "";
  const checkRow = clipChecks.find(c => c.episodeId === checkKey && (c.clipIndex ?? 0) === 0);
  const checkState: any = checkRow || { facesConsistent: false, fullPhrases: false, pronunciationOk: false, noWatermark: false, fruitHeads: false };
  const episodeTitle = (id?: string) => episodes.find(e => e.id === id)?.title || cards.find(c => c.id === id)?.title || "";

  async function toggleCheck(key: string, value: boolean){
    if (!selectedCard) return;
    if (checkRow) await update("clipChecks", checkRow.id, { [key]: value });
    else await insert("clipChecks", { episodeId: checkKey, clipIndex: 0, facesConsistent: false, fullPhrases: false, pronunciationOk: false, noWatermark: false, fruitHeads: false, [key]: value });
  }
  async function addCard(){
    const title = newTitle.trim() || ("Nuevo episodio " + (cards.length + 1));
    const created = await insert("productionCards", { title, stage: "Idea", episodeId: "" });
    setNewTitle("");
    if (created?.id) setSelectedCardId(created.id);
  }
  async function addCost(){
    await insert("costs", { tool: costForm.tool, credits: Number(costForm.credits), costUsd: Number(costForm.costUsd), episodeId: costForm.episodeId || selectedCard?.episodeId || "" });
  }

  return <section>
    <h2 className="text-xl font-bold">Producción — Kanban</h2>
    <p className="text-xs text-slate-500 mt-1">{mode === "supabase" ? "Guardado en Supabase (production_cards, clip_checks, costs)." : "Modo sin login: localStorage."} Toca una tarjeta para seleccionarla y editar su checklist.</p>
    <div className="grid gap-3 md:grid-cols-5 mt-4 overflow-x-auto">
      {stages.map(s => <div key={s} className="min-w-[160px] rounded bg-[#121826] p-3">
        <h3 className="font-semibold text-sm">{s}</h3>
        {cards.filter(c => c.stage === s).map(c => <div key={c.id} onClick={() => setSelectedCardId(c.id)} className={`mt-2 rounded p-2 text-sm cursor-pointer ${selectedCard?.id === c.id ? "bg-amber-900/60 border border-amber-500" : "bg-slate-800"}`}>
          {c.title}
          <div className="flex gap-1 mt-2">{stages.map(ns => <button key={ns} title={ns} onClick={(e) => { e.stopPropagation(); update("productionCards", c.id, { stage: ns }); }} className={`h-2 flex-1 rounded ${ns === s ? "bg-amber-500" : "bg-slate-600"}`}/>)}</div>
          <button className="text-red-400 text-[11px] mt-1" onClick={(e) => { e.stopPropagation(); remove("productionCards", c.id); }}>Eliminar tarjeta</button>
        </div>)}
      </div>)}
    </div>
    <div className="flex gap-2 mt-3 flex-wrap">
      <input placeholder="Título de la tarjeta / episodio" value={newTitle} onChange={e => setNewTitle(e.target.value)} className="min-w-[220px]"/>
      <button className="rounded bg-amber-500 text-black px-3 py-1 text-sm font-bold" onClick={addCard}>+ Tarjeta</button>
    </div>

    <h3 className="font-bold mt-6">Checklist por clip {selectedCard ? `— ${selectedCard.title}` : ""}</h3>
    {selectedCard ? <>
      {checks.map(([k, label]) => <label key={k} className="flex gap-2 text-sm mt-1"><input type="checkbox" className="w-auto" checked={!!checkState[k]} onChange={e => toggleCheck(k, e.target.checked)}/> {label}</label>)}
      <p className="text-xs text-slate-500 mt-1">Se guarda en {mode === "supabase" ? "clip_checks (Supabase)" : "localStorage"} al marcar cada punto.</p>
    </> : <p className="text-sm text-slate-400">Crea o selecciona una tarjeta para usar el checklist.</p>}

    <h3 className="font-bold mt-6">Créditos y costos — Total: ${total.toFixed(2)}</h3>
    <div className="flex gap-2 mt-2 flex-wrap items-center">
      <select value={costForm.tool} onChange={e => setCostForm({ ...costForm, tool: e.target.value })}><option>Higgsfield</option><option>Dola</option><option>Otro</option></select>
      <input type="number" value={costForm.credits} onChange={e => setCostForm({ ...costForm, credits: Number(e.target.value) })} placeholder="Créditos" className="w-24"/>
      <input type="number" step="0.01" value={costForm.costUsd} onChange={e => setCostForm({ ...costForm, costUsd: Number(e.target.value) })} placeholder="US$" className="w-24"/>
      <select value={costForm.episodeId} onChange={e => setCostForm({ ...costForm, episodeId: e.target.value })}>
        <option value="">Episodio (opcional)…</option>
        {episodes.map(ep => <option key={ep.id} value={ep.id}>{ep.title}</option>)}
      </select>
      <button className="rounded bg-slate-700 px-3 py-1 text-sm" onClick={addCost}>+ Registrar costo</button>
      <button className="rounded bg-slate-800 px-3 py-1 text-sm" onClick={() => { setCostForm({ tool: "Higgsfield", credits: 10, costUsd: 2.5, episodeId: costForm.episodeId }); }}>Higgsfield 10cr</button>
      <button className="rounded bg-slate-800 px-3 py-1 text-sm" onClick={() => { setCostForm({ tool: "Dola", credits: 5, costUsd: 1, episodeId: costForm.episodeId }); }}>Dola 5cr</button>
    </div>
    <ul className="text-sm mt-2 space-y-1">
      {costs.map(c => <li key={c.id} className="flex gap-2 items-center"><span>{c.tool}: {c.credits} créditos — ${Number(c.costUsd).toFixed(2)}{episodeTitle(c.episodeId) ? ` · ${episodeTitle(c.episodeId)}` : ""}</span><button className="text-red-400 text-xs" onClick={() => remove("costs", c.id)}>Eliminar</button></li>)}
      {costs.length === 0 && <li className="text-slate-400">Sin costos registrados.</li>}
    </ul>
    {episodes.length > 0 && <div className="mt-3 text-sm space-y-1">
      <b>Costo por episodio:</b>
      {episodes.map(ep => <p key={ep.id} className="text-xs text-slate-300">{ep.title}: ${costs.filter(c => c.episodeId === ep.id).reduce((a, c) => a + Number(c.costUsd || 0), 0).toFixed(2)}</p>)}
    </div>}
  </section>;
}
