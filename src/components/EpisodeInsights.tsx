"use client";

import type { Episode, Metric } from "@/lib/types";

type Row = Metric & { account: string };

interface Props {
  title: string;
  titles: string[];
  episode?: Episode;
  metrics: Row[];
  onSelect: (title: string) => void;
}

const count = (n: number) => new Intl.NumberFormat("es-DO").format(n);

export default function EpisodeInsights({ title, titles, episode, metrics, onSelect }: Props) {
  if (!titles.length) return null;
  const views = metrics.reduce((sum, m) => sum + (m.views || 0), 0);
  const interactions = metrics.reduce((sum, m) => sum + (m.interactions || 0), 0);
  const followers = metrics.reduce((sum, m) => sum + (m.followers || 0), 0);
  const cover = metrics.find(m => m.thumb)?.thumb;
  const platforms = Array.from(new Set(metrics.map(m => m.platform)));
  const retention = metrics.filter(m => typeof m.retention === "number");

  return <section id="episode-insights" aria-labelledby="episode-insights-title" className="scroll-mt-28 overflow-hidden rounded-2xl border border-[#598BFF]/25 bg-[#151C2B]">
    <div className="flex flex-col gap-5 border-b border-white/10 p-5 sm:flex-row sm:items-start sm:p-6">
      <div className="relative h-40 w-28 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-[#243750] via-[#151C2B] to-[#583318]">
        {cover ? <img src={cover} alt="" loading="lazy" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-center text-xs font-semibold text-slate-300">Sin miniatura</div>}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold uppercase tracking-[.18em] text-[#9DB8FF]">Análisis de episodio</p>
        <h3 id="episode-insights-title" className="mt-2 text-xl font-bold text-white sm:text-2xl">{title}</h3>
        <p className="mt-1 text-sm text-slate-300">{episode?.status ? `Estado: ${episode.status}` : "Resultados disponibles por publicación"}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {platforms.length ? platforms.map(p => <span key={p} className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] text-slate-200">{p}</span>) : <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] text-slate-300">Sin publicaciones medidas</span>}
        </div>
        <label className="mt-4 block max-w-md text-xs font-semibold text-slate-300">Cambiar episodio
          <select className="mt-1" value={title} onChange={e => onSelect(e.target.value)}>{titles.map(t => <option key={t} value={t}>{t}</option>)}</select>
        </label>
      </div>
    </div>

    <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4 sm:p-6">
      {[
        ["Visualizaciones", metrics.length ? count(views) : "—"],
        ["Interacciones", metrics.length ? count(interactions) : "—"],
        ["Seguidores", metrics.length ? `+${count(followers)}` : "—"],
        ["Publicaciones", count(metrics.length)],
      ].map(([label, value]) => <div key={label} className="rounded-xl border border-white/10 bg-black/15 p-3"><p className="text-xs text-slate-300">{label}</p><p className="mt-2 text-xl font-bold text-white">{value}</p></div>)}
    </div>

    <div className="grid gap-4 px-5 pb-5 sm:px-6 sm:pb-6 xl:grid-cols-2">
      <div className="rounded-xl border border-white/10 bg-black/15 p-4">
        <h4 className="font-semibold text-white">Publicaciones relacionadas</h4>
        {metrics.length ? <ul className="mt-3 space-y-2">{metrics.map(m => <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[.025] p-3 text-sm">
          <div><p className="font-semibold text-white">{m.platform} · {count(m.views)} vistas</p><p className="mt-0.5 text-xs text-slate-400">{m.account} · publicado {m.date || "sin fecha"}{!m.episodeId && episode ? " · coincidencia por título sin vincular" : ""}</p></div>
          {m.permalink && <a href={m.permalink} target="_blank" rel="noreferrer" className="rounded-lg border border-white/15 px-2.5 py-1.5 text-xs font-semibold text-[#B3C9FF] hover:bg-white/5">Abrir video ↗</a>}
        </li>)}</ul> : <p className="mt-3 text-sm text-slate-300">Aún no hay métricas vinculadas a este episodio.</p>}
      </div>
      <div className="rounded-xl border border-white/10 bg-black/15 p-4">
        <h4 className="font-semibold text-white">Retención y próximos pasos</h4>
        {retention.length ? <p className="mt-3 text-sm text-slate-200">{retention.map(m => `${m.platform}: ${m.retention}%`).join(" · ")}</p> : <p className="mt-3 text-sm text-slate-300">Ninguna publicación vinculada incluye un dato de retención.</p>}
        <div className="mt-4 rounded-lg border border-dashed border-[#598BFF]/35 bg-[#598BFF]/[.055] p-3 text-xs leading-relaxed text-slate-300">
          El mapa de retención por segundo y el reproductor sincronizado requieren datos temporales y un archivo de video accesible. La app todavía no guarda ninguno de los dos; aquí solo se muestran las métricas verificables.
        </div>
      </div>
    </div>
  </section>;
}
