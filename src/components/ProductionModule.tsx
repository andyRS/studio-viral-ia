"use client";
import { useState, type FormEvent } from "react";
import { useData } from "@/lib/DataContext";

const stages = ["Idea", "Guion", "Clips generados", "Montaje", "Publicado"];

export default function ProductionModule({ onOpenEpisode }: { onOpenEpisode?: (episodeId: string) => void } = {}) {
  const { data, insert, update, remove, mode } = useData();
  const { productionCards: cards, costs, clipChecks, episodes } = data;
  const [newTitle, setNewTitle] = useState("");
  const [newEpisodeId, setNewEpisodeId] = useState("");
  const [selectedCardId, setSelectedCardId] = useState("");
  const [pendingDelete, setPendingDelete] = useState<{ kind: "card" | "cost"; id: string } | null>(null);
  const [costForm, setCostForm] = useState({ tool: "Higgsfield", credits: 10, costUsd: 2.5, episodeId: "" });
  const total = costs.reduce((sum, cost) => sum + Number(cost.costUsd || 0), 0);
  const selectedCard = cards.find(card => card.id === selectedCardId) || cards[0];
  const selectedEpisodeId = selectedCard && episodes.some(episode => episode.id === selectedCard.episodeId) ? selectedCard.episodeId : "";
  const selectedEpisode = episodes.find(episode => episode.id === selectedEpisodeId);
  const sceneCount = selectedEpisode?.output?.scenes?.length || 0;
  const cast = selectedEpisode?.output?.cast || [];
  const signature = cast.map((member: any) => { const saved = data.characters.find(character => character.seriesId === selectedEpisode?.seriesId && character.name.toLowerCase() === String(member.name).toLowerCase()); return `${saved?.id || "missing"}:${saved?.referenceVersion || 0}`; }).join("|");
  const approvedCount = clipChecks.filter(check => check.episodeId === selectedEpisodeId && check.approved && check.referenceSignature === signature).length;
  const episodeTitle = (id?: string) => episodes.find(episode => episode.id === id)?.title || cards.find(card => card.id === id)?.title || "";

  async function addCard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    const episodeId = episodes.some(episode => episode.id === newEpisodeId) ? newEpisodeId : "";
    const created = await insert("productionCards", { title, stage: "Idea", episodeId });
    setNewTitle("");
    setNewEpisodeId("");
    if (created?.id) setSelectedCardId(created.id);
  }
  async function addCost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!Number.isFinite(costForm.credits) || !Number.isFinite(costForm.costUsd) || costForm.credits < 0 || costForm.costUsd < 0) return;
    const episodeId = episodes.some(episode => episode.id === costForm.episodeId) ? costForm.episodeId : "";
    await insert("costs", { tool: costForm.tool, credits: costForm.credits, costUsd: costForm.costUsd, episodeId });
  }
  async function confirmDelete(kind: "card" | "cost", id: string) {
    await remove(kind === "card" ? "productionCards" : "costs", id);
    if (kind === "card" && selectedCardId === id) setSelectedCardId("");
    setPendingDelete(null);
  }

  return <section className="space-y-7">
    <div>
      <h2 className="text-xl font-bold">Centro de producción</h2>
      <p className="mt-1 text-sm text-slate-400">Sigue cada episodio de la idea a la publicación. {mode === "supabase" ? "Los cambios se guardan en tu cuenta." : "Los cambios se guardan en este dispositivo."}</p>
    </div>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Etapas de producción">
      {stages.map(stage => {
        const stageCards = cards.filter(card => card.stage === stage);
        return <div key={stage} className="min-w-0 rounded-xl bg-[#121826] p-3">
          <h3 className="flex items-center justify-between gap-2 text-sm font-semibold"><span>{stage}</span><span className="rounded-full border border-white/10 px-2 py-0.5 text-xs text-slate-300" aria-label={`${stageCards.length} tarjetas`}>{stageCards.length}</span></h3>
          <div className="mt-3 space-y-2">
            {stageCards.length === 0 && <p className="rounded-lg border border-dashed border-white/10 p-3 text-xs text-slate-400">Sin episodios en esta etapa.</p>}
            {stageCards.map(card => <article key={card.id} className={`min-w-0 rounded-lg border p-2.5 text-sm ${selectedCard?.id === card.id ? "border-amber-500/60 bg-amber-500/10" : "border-white/10 bg-slate-800/60"}`}>
              <button type="button" onClick={() => setSelectedCardId(card.id)} aria-pressed={selectedCard?.id === card.id} className="min-h-11 w-full break-words rounded-md px-1 py-2 text-left font-semibold text-white hover:text-amber-200">{card.title}<span className="mt-1 block text-xs font-normal text-slate-400">{selectedCard?.id === card.id ? "Seleccionado para revisión" : "Seleccionar para revisar"}</span></button>
              <label htmlFor={`production-stage-${card.id}`} className="mt-2 block text-xs text-slate-300">Etapa</label>
              <select id={`production-stage-${card.id}`} value={card.stage} disabled={episodes.some(episode => episode.id === card.episodeId && (episode.status === "Borrador" || episode.output?.mode === "plantilla-local"))} onChange={event => update("productionCards", card.id, { stage: event.target.value })} className="mt-1 min-h-11 text-sm disabled:opacity-50">{stages.map(nextStage => <option key={nextStage} value={nextStage}>{nextStage}</option>)}</select>
              {episodes.some(episode => episode.id === card.episodeId && (episode.status === "Borrador" || episode.output?.mode === "plantilla-local")) && <p className="mt-1 text-xs text-amber-200">Borrador de plantilla: recrea el guion con Gemini antes de avanzar.</p>}
              <label htmlFor={`production-episode-${card.id}`} className="mt-2 block text-xs text-slate-300">Episodio vinculado</label>
              <select id={`production-episode-${card.id}`} value={episodes.some(episode => episode.id === card.episodeId) ? card.episodeId : ""} onChange={event => update("productionCards", card.id, { episodeId: event.target.value })} className="mt-1 min-h-11 text-sm">
                <option value="">Sin vincular</option>
                {episodes.map(episode => <option key={episode.id} value={episode.id}>{episode.title}</option>)}
              </select>
              {!episodes.some(episode => episode.id === card.episodeId) && <p className="mt-1 text-xs text-slate-400">Vincula un episodio para guardar la revisión.</p>}
              {pendingDelete?.kind === "card" && pendingDelete.id === card.id ? <div className="mt-2 rounded-lg border border-red-400/30 bg-red-500/10 p-2" role="group" aria-label={`Confirmar eliminación de ${card.title}`}>
                <p className="text-xs text-red-100">¿Eliminar esta tarjeta?</p>
                <div className="mt-2 flex flex-wrap gap-2"><button type="button" className="min-h-10 rounded-md border border-white/15 px-2 text-xs" onClick={() => setPendingDelete(null)}>Cancelar</button><button type="button" className="min-h-10 rounded-md bg-red-500 px-2 text-xs font-semibold text-white" onClick={() => confirmDelete("card", card.id)}>Sí, eliminar</button></div>
              </div> : <button type="button" className="mt-2 min-h-10 rounded-md px-2 text-xs text-slate-300 hover:bg-white/5 hover:text-white" onClick={() => setPendingDelete({ kind: "card", id: card.id })}>Eliminar tarjeta</button>}
            </article>)}
          </div>
        </div>;
      })}
    </div>

    <form onSubmit={addCard} className="flex flex-wrap items-end gap-3 rounded-xl bg-[#121826] p-4">
      <div className="min-w-[220px] flex-1"><label htmlFor="production-new-title" className="mb-1 block text-sm font-medium">Título del episodio o tarjeta</label><input id="production-new-title" value={newTitle} onChange={event => setNewTitle(event.target.value)} placeholder="Ej.: Episodio 2 · El encuentro" required /></div>
      <div className="min-w-[220px] flex-1"><label htmlFor="production-new-episode" className="mb-1 block text-sm font-medium">Vincular episodio</label><select id="production-new-episode" value={newEpisodeId} onChange={event => setNewEpisodeId(event.target.value)}><option value="">Sin vincular por ahora</option>{episodes.map(episode => <option key={episode.id} value={episode.id}>{episode.title}</option>)}</select></div>
      <button type="submit" className="min-h-11 rounded-lg bg-amber-500 px-4 text-sm font-bold">Añadir a producción</button>
    </form>

    <div className="rounded-xl bg-[#121826] p-4">
      <h3 className="font-bold">Revisión general{selectedCard ? ` · ${selectedCard.title}` : ""}</h3>
      {selectedCard ? <>
        {selectedEpisodeId ? <div className="mt-2"><p className="text-sm text-slate-300">{selectedEpisode?.title}: {sceneCount ? `${approvedCount}/${sceneCount} escenas aprobadas` : "sin mesa de escenas"}.</p><p className="mt-1 text-xs text-slate-400">Imagen, prompt, clip y motivo de rehacer se revisan juntos en el episodio.</p>{onOpenEpisode && <button type="button" onClick={() => onOpenEpisode(selectedEpisodeId)} className="mt-3 rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-slate-950">Abrir mesa de escenas</button>}</div> : <p className="mt-2 rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-sm text-amber-100">{episodes.length ? "Vincula esta tarjeta a un episodio guardado para activar la revisión." : "Todavía no hay episodios guardados. Crea uno en Generador y luego vincúlalo para activar la revisión."}</p>}
      </> : <p className="mt-2 text-sm text-slate-400">Crea una tarjeta para empezar la revisión.</p>}
    </div>

    <div className="rounded-xl bg-[#121826] p-4">
      <h3 className="font-bold">Créditos y costos <span className="text-amber-300">· Total: ${total.toFixed(2)}</span></h3>
      <form onSubmit={addCost} className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5 xl:items-end">
        <div><label htmlFor="production-cost-tool" className="mb-1 block text-sm">Herramienta</label><select id="production-cost-tool" value={costForm.tool} onChange={event => setCostForm({ ...costForm, tool: event.target.value })}><option>Higgsfield</option><option>Dola</option><option>Otro</option></select></div>
        <div><label htmlFor="production-cost-credits" className="mb-1 block text-sm">Créditos</label><input id="production-cost-credits" type="number" min="0" step="1" required value={costForm.credits} onChange={event => setCostForm({ ...costForm, credits: Number(event.target.value) })} /></div>
        <div><label htmlFor="production-cost-usd" className="mb-1 block text-sm">Costo (US$)</label><input id="production-cost-usd" type="number" min="0" step="0.01" required value={costForm.costUsd} onChange={event => setCostForm({ ...costForm, costUsd: Number(event.target.value) })} /></div>
        <div><label htmlFor="production-cost-episode" className="mb-1 block text-sm">Episodio</label><select id="production-cost-episode" value={costForm.episodeId} onChange={event => setCostForm({ ...costForm, episodeId: event.target.value })}><option value="">Sin asignar</option>{episodes.map(episode => <option key={episode.id} value={episode.id}>{episode.title}</option>)}</select></div>
        <button type="submit" className="min-h-11 rounded-lg bg-slate-700 px-3 text-sm font-semibold">Registrar costo</button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2" aria-label="Valores rápidos de costo">
        <button type="button" className="min-h-10 rounded-lg bg-slate-800 px-3 text-xs" onClick={() => setCostForm({ tool: "Higgsfield", credits: 10, costUsd: 2.5, episodeId: costForm.episodeId })}>Higgsfield · 10 créditos</button>
        <button type="button" className="min-h-10 rounded-lg bg-slate-800 px-3 text-xs" onClick={() => setCostForm({ tool: "Dola", credits: 5, costUsd: 1, episodeId: costForm.episodeId })}>Dola · 5 créditos</button>
      </div>
      {costs.length ? <ul className="mt-4 space-y-2 text-sm">{costs.map(cost => <li key={cost.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 p-2.5">
        <span className="min-w-0 break-words">{cost.tool}: {cost.credits} créditos · ${Number(cost.costUsd).toFixed(2)}{episodeTitle(cost.episodeId) ? ` · ${episodeTitle(cost.episodeId)}` : ""}</span>
        {pendingDelete?.kind === "cost" && pendingDelete.id === cost.id ? <span className="flex flex-wrap items-center gap-2" role="group" aria-label={`Confirmar eliminación del costo de ${cost.tool}`}><span className="text-xs text-red-200">¿Eliminar costo?</span><button type="button" className="min-h-10 rounded-md border border-white/15 px-2 text-xs" onClick={() => setPendingDelete(null)}>Cancelar</button><button type="button" className="min-h-10 rounded-md bg-red-500 px-2 text-xs font-semibold text-white" onClick={() => confirmDelete("cost", cost.id)}>Sí, eliminar</button></span> : <button type="button" className="min-h-10 rounded-md px-2 text-xs text-slate-300 hover:bg-white/5 hover:text-white" onClick={() => setPendingDelete({ kind: "cost", id: cost.id })}>Eliminar</button>}
      </li>)}</ul> : <p className="mt-4 rounded-lg border border-dashed border-white/10 p-3 text-sm text-slate-400">Todavía no hay costos registrados.</p>}
      {episodes.length > 0 && <div className="mt-4 border-t border-white/10 pt-3 text-sm"><h4 className="font-semibold">Costo por episodio</h4><ul className="mt-2 space-y-1">{episodes.map(episode => <li key={episode.id} className="flex justify-between gap-3 text-slate-300"><span className="min-w-0 truncate">{episode.title}</span><span className="shrink-0">${costs.filter(cost => cost.episodeId === episode.id).reduce((sum, cost) => sum + Number(cost.costUsd || 0), 0).toFixed(2)}</span></li>)}</ul></div>}
    </div>
  </section>;
}
