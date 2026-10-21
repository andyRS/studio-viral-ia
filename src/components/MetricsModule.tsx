"use client";
import { useState } from "react";
import AiAuthNotice from "./AiAuthNotice";
import { useData } from "@/lib/DataContext";
import { postApi, isAuthError } from "@/lib/api-client";
import { templateMetricRecommendations } from "@/lib/llm";
import { learnFromMetrics } from "@/lib/learning";

const PLATFORMS = ["Instagram","Facebook","TikTok","YouTube Shorts"];
function platformCells(m: any){
  if (!m) return ["—","—","—"];
  if (m.platform === "Instagram") return [`${(m.shares || 0).toLocaleString()} compartidos`, `${(m.saves || 0).toLocaleString()} guardados`, `+${m.followers} seguidores`];
  if (m.platform === "Facebook") return [`${m.avgWatch}s tiempo promedio`, `${(m.oneMinViews || 0).toLocaleString()} vistas de 1 min`, `US$${Number(m.estRevenue || 0).toFixed(2)} ingresos est.`];
  if (m.platform === "TikTok") return [`${m.completion || 0}% visto completo`, `+${m.followers} nuevos seguidores`, `${(m.searches || 0).toLocaleString()} desde búsquedas`];
  return [`${m.viewedVsSwiped || 0}% visto vs deslizado`, `${m.retention || 0}% retención`, `+${m.followers} seguidores`];
}
const NUMF = (v: string) => v === "" ? undefined : Number(v);

export default function MetricsModule(){
  const { data, insert, remove, mode } = useData();
  const items = data.metrics;
  const [recs, setRecs] = useState<string[]>([]);
  const [authError, setAuthError] = useState(false);
  const [recMode, setRecMode] = useState("");
  const episodeTitles = Array.from(new Set(items.map(m => m.episodeTitle).filter(Boolean)));
  const [ep, setEp] = useState("");
  const activeEp = ep && episodeTitles.includes(ep) ? ep : (episodeTitles[0] || "");
  const [f, setF] = useState<any>({ episodeTitle: "", platform: "TikTok", date: new Date().toISOString().slice(0, 10), views: "", avgWatch: "", interactions: "", followers: "", formula: "", hook: "", duration: "", shares: "", saves: "", oneMinViews: "", estRevenue: "", completion: "", searches: "", viewedVsSwiped: "", retention: "" });

  async function analyzeLocal(){
    setAuthError(false);
    setRecs(templateMetricRecommendations(items));
    setRecMode("plantilla local en el cliente (sin IA)");
  }
  async function analyze(){
    if (mode !== "supabase") { await analyzeLocal(); return; }
    const r = await postApi("/api/analyze-metrics", { metrics: items });
    if (isAuthError(r)) { setAuthError(true); return; }
    setRecs(r.json?.recommendations || []);
    setRecMode(r.json?.mode || "IA");
  }
  async function submit(e: any){
    e.preventDefault();
    await insert("metrics", {
      episodeTitle: f.episodeTitle, platform: f.platform, date: f.date,
      views: Number(f.views || 0), avgWatch: Number(f.avgWatch || 0), interactions: Number(f.interactions || 0), followers: Number(f.followers || 0),
      formula: f.formula, hook: f.hook, duration: Number(f.duration || 0),
      shares: NUMF(f.shares), saves: NUMF(f.saves), oneMinViews: NUMF(f.oneMinViews), estRevenue: NUMF(f.estRevenue),
      completion: NUMF(f.completion), searches: NUMF(f.searches), viewedVsSwiped: NUMF(f.viewedVsSwiped), retention: NUMF(f.retention),
    });
    setF({ ...f, views: "", interactions: "", followers: "" });
  }
  const rank = (key: string) => { const m: any = {}; items.forEach((x: any) => { const k = String(x[key] ?? ""); m[k] = (m[k] || 0) + x.views; }); return Object.entries(m).sort((a: any, b: any) => b[1] - a[1]); };
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });

  return <section>
    <h2 className="text-xl font-bold">Métricas y comparación por plataforma</h2>
    <p className="text-xs text-slate-500 mt-1">{mode === "supabase" ? "Guardado en Supabase (tabla metrics, métricas 4B en columna extra)." : "Modo sin login: localStorage."}</p>

    <h3 className="font-bold mt-4">📊 Mismo episodio, lado a lado en las 4 plataformas</h3>
    {episodeTitles.length > 0 ? <>
      <select className="mt-2 max-w-md" value={activeEp} onChange={e => setEp(e.target.value)}>{episodeTitles.map(e => <option key={e}>{e}</option>)}</select>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 mt-3">
        {PLATFORMS.map(p => { const m = items.find(x => x.episodeTitle === activeEp && x.platform === p); return <article key={p} className="rounded-xl bg-[#121826] p-4 border border-slate-800"><b>{p}</b>{m ? <div className="text-sm mt-2 space-y-1"><p>{m.views.toLocaleString()} vistas · {m.date}</p><p>Duración publicada: {m.duration}s</p>{platformCells(m).map((c, i) => <p key={i} className="text-amber-200 text-xs">• {c}</p>)}<p className="text-xs text-slate-400">{m.interactions.toLocaleString()} interacciones</p></div> : <p className="text-sm text-red-300 mt-2">Sin publicar / sin datos en esta plataforma</p>}</article>; })}
      </div>
    </> : <p className="text-sm text-slate-400 mt-2">Registra la primera métrica abajo para activar el tablero.</p>}
    <p className="text-xs text-slate-500 mt-2">Cada plataforma se juzga con SUS métricas 4B: Instagram = compartidos/guardados/seguidores · Facebook = tiempo promedio/vistas 1 min/ingresos estimados · TikTok = % completo/nuevos seguidores/búsquedas · YouTube Shorts = visto vs deslizado/retención. No compares solo por vistas.</p>

    <div className="overflow-x-auto mt-5"><table className="w-full text-sm"><thead><tr className="text-left text-slate-400"><th>Episodio</th><th>Fecha</th><th>Plataforma</th><th>Vistas</th><th>Prom. reproducción</th><th>Interacciones</th><th>Seguidores</th><th></th></tr></thead>
      <tbody>{items.map(m => <tr key={m.id} className="border-t border-slate-800"><td className="max-w-[220px] truncate">{m.episodeTitle}</td><td>{m.date}</td><td>{m.platform}</td><td>{m.views.toLocaleString()}</td><td>{m.avgWatch}s</td><td>{m.interactions}</td><td>+{m.followers}</td><td><button className="text-red-400 text-xs" onClick={() => remove("metrics", m.id)}>Eliminar</button></td></tr>)}</tbody></table></div>

    <form className="mt-4 rounded-xl bg-[#121826] p-4 border border-slate-800" onSubmit={submit}>
      <h3 className="font-bold text-sm">➕ Registrar video publicado</h3>
      <div className="grid gap-2 md:grid-cols-4 mt-2">
        <input placeholder="Título del episodio" value={f.episodeTitle} onChange={set("episodeTitle")} required/>
        <select value={f.platform} onChange={set("platform")}>{PLATFORMS.map(p => <option key={p}>{p}</option>)}</select>
        <input type="date" value={f.date} onChange={set("date")}/>
        <input type="number" placeholder="Duración (s)" value={f.duration} onChange={set("duration")}/>
        <input type="number" placeholder="Vistas" value={f.views} onChange={set("views")}/>
        <input type="number" placeholder="Prom. reproducción (s)" value={f.avgWatch} onChange={set("avgWatch")}/>
        <input type="number" placeholder="Interacciones" value={f.interactions} onChange={set("interactions")}/>
        <input type="number" placeholder="Seguidores ganados" value={f.followers} onChange={set("followers")}/>
        <input placeholder="Fórmula usada" value={f.formula} onChange={set("formula")}/>
        <input placeholder="Gancho usado" value={f.hook} onChange={set("hook")}/>
      </div>
      <p className="text-xs text-slate-400 mt-3">Métricas 4B según plataforma (rellena las de la plataforma elegida):</p>
      <div className="grid gap-2 md:grid-cols-4 mt-1">
        <input type="number" placeholder="IG: compartidos" value={f.shares} onChange={set("shares")}/>
        <input type="number" placeholder="IG: guardados" value={f.saves} onChange={set("saves")}/>
        <input type="number" placeholder="FB: vistas de 1 min" value={f.oneMinViews} onChange={set("oneMinViews")}/>
        <input type="number" step="0.01" placeholder="FB: ingresos est. US$" value={f.estRevenue} onChange={set("estRevenue")}/>
        <input type="number" placeholder="TikTok: % visto completo" value={f.completion} onChange={set("completion")}/>
        <input type="number" placeholder="TikTok: desde búsquedas" value={f.searches} onChange={set("searches")}/>
        <input type="number" placeholder="Shorts: % visto vs deslizado" value={f.viewedVsSwiped} onChange={set("viewedVsSwiped")}/>
        <input type="number" placeholder="Shorts: % retención" value={f.retention} onChange={set("retention")}/>
      </div>
      <button className="mt-3 rounded bg-amber-500 text-black font-bold px-4 py-2">Guardar métrica</button>
    </form>

    <div className="grid md:grid-cols-3 gap-3 mt-4">{[["formula","Fórmula"],["hook","Gancho"],["duration","Duración"]].map(([k, label]) => <div key={k} className="rounded bg-[#121826] p-3"><b className="text-sm">Ranking {label}</b>{rank(k).map(([n, v]: any, i: number) => <p key={i} className="text-xs mt-1">{i + 1}. {n} — {Number(v).toLocaleString()} vistas</p>)}</div>)}</div>
    <div className="mt-3 rounded bg-emerald-900/30 p-3 text-sm">📈 Crecimiento: +{items.reduce((a, m) => a + m.followers, 0)} seguidores en el periodo · {items.reduce((a, m) => a + m.views, 0).toLocaleString()} vistas totales</div>
    {(() => { const L = learnFromMetrics(items); return <div className="mt-3 rounded bg-violet-900/30 border border-violet-500/30 p-3 text-sm"><b>🧠 Lo que la IA aprende de tus métricas</b>{L ? <ul className="list-disc ml-5 mt-1 space-y-0.5">{L.hooks.length > 0 && <li>Mejores ganchos: {L.hooks.join(" · ")}</li>}{L.formulas.length > 0 && <li>Fórmulas ganadoras: {L.formulas.join(" · ")}</li>}{L.durations.length > 0 && <li>Mejor duración: {L.durations.join(", ")}</li>}</ul> : <p className="text-slate-400 mt-1">Registra al menos 2 videos con vistas y la IA empezará a usarlos en cada guion nuevo.</p>}{L && <p className="text-xs text-slate-400 mt-1">Esto se envía automáticamente a la IA al crear historias y episodios.</p>}</div>; })()}
    <button onClick={analyze} className="mt-3 rounded bg-amber-500 text-black font-bold px-4 py-2">Analizar con IA</button>
    {authError && <AiAuthNotice onLocalTemplate={analyzeLocal}/>}
    {recs.length > 0 && <><ol className="list-decimal ml-5 mt-3 text-sm space-y-1">{recs.map((r, i) => <li key={i}>{r}</li>)}</ol>{recMode && <p className="text-xs text-slate-500 mt-1">Fuente: {recMode}</p>}</>}
  </section>;
}
