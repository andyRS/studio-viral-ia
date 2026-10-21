"use client";
import { useMemo, useState } from "react";
import AiAuthNotice from "./AiAuthNotice";
import { useData } from "@/lib/DataContext";
import { postApi, isAuthError } from "@/lib/api-client";
import { templateMetricRecommendations } from "@/lib/llm";
import { learnFromMetrics } from "@/lib/learning";
import MetaConnect from "./MetaConnect";
import type { Metric } from "@/lib/types";

const PLATFORMS = ["Instagram", "Facebook", "TikTok", "YouTube Shorts"];
// Cuenta que inició el patrón: siempre se muestra primero como referencia.
const REFERENCE_KEY = "peliculasquenoexisten";

const PLATFORM_STYLE: Record<string, { short: string; badge: string; bg: string }> = {
  Instagram: { short: "IG", badge: "bg-gradient-to-r from-fuchsia-500 to-orange-400 text-white", bg: "from-fuchsia-700 via-purple-800 to-orange-600" },
  Facebook: { short: "FB", badge: "bg-blue-600 text-white", bg: "from-blue-700 via-blue-900 to-slate-900" },
  TikTok: { short: "TT", badge: "bg-black text-cyan-300 ring-1 ring-cyan-400/50", bg: "from-slate-900 via-cyan-900 to-pink-900" },
  "YouTube Shorts": { short: "YT", badge: "bg-red-600 text-white", bg: "from-red-700 via-red-900 to-slate-900" },
};
const pstyle = (p: string) => PLATFORM_STYLE[p] || { short: p.slice(0, 2).toUpperCase(), badge: "bg-slate-600 text-white", bg: "from-slate-700 to-slate-900" };

const norm = (s: string) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const isReference = (name: string) => norm(name).includes(REFERENCE_KEY);
const fmt = (n: number) => new Intl.NumberFormat("es", { notation: n >= 10000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(n || 0);
const daysAgo = (d: string) => (Date.now() - new Date(d + "T12:00:00").getTime()) / 86400000;

function platformCells(m: any) {
  if (!m) return ["—", "—", "—"];
  if (m.platform === "Instagram") return [`${(m.shares || 0).toLocaleString()} compartidos`, `${(m.saves || 0).toLocaleString()} guardados`, typeof m.skipRate === "number" ? `${m.skipRate}% lo salta en 3 s` : `+${m.followers} seguidores`];
  if (m.platform === "Facebook") return [`${m.avgWatch}s tiempo promedio`, `${(m.oneMinViews || 0).toLocaleString()} vistas de 1 min`, `US$${Number(m.estRevenue || 0).toFixed(2)} ingresos est.`];
  if (m.platform === "TikTok") return [`${m.completion || 0}% visto completo`, `+${m.followers} nuevos seguidores`, `${(m.searches || 0).toLocaleString()} desde búsquedas`];
  return [`${m.viewedVsSwiped || 0}% visto vs deslizado`, `${m.retention || 0}% retención`, `+${m.followers} seguidores`];
}
const NUMF = (v: string) => v === "" ? undefined : Number(v);

interface AccountStat { name: string; platforms: string[]; reels: number; views: number; avg: number; avgWatch: number; best?: Metric; ref: boolean }

function accountStats(items: (Metric & { account: string })[]): AccountStat[] {
  const g = new Map<string, AccountStat & { watchSum: number }>();
  for (const m of items) {
    const s = g.get(m.account) || { name: m.account, platforms: [], reels: 0, views: 0, avg: 0, avgWatch: 0, watchSum: 0, ref: isReference(m.account) };
    s.reels++; s.views += m.views || 0; s.watchSum += m.avgWatch || 0;
    if (!s.platforms.includes(m.platform)) s.platforms.push(m.platform);
    if (!s.best || (m.views || 0) > (s.best.views || 0)) s.best = m;
    g.set(m.account, s);
  }
  return Array.from(g.values()).map(s => ({ ...s, avg: s.views / s.reels, avgWatch: Math.round((s.watchSum / s.reels) * 10) / 10 }))
    // La referencia va siempre primero; el resto, por vistas totales.
    .sort((a, b) => Number(b.ref) - Number(a.ref) || b.views - a.views);
}

function RefBadge({ value, refAvg }: { value: number; refAvg: number }) {
  if (!refAvg) return null;
  const x = value / refAvg;
  const good = x >= 1;
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${good ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/15 text-rose-300"}`} title="Comparado con la media por Reel de la cuenta de referencia">
    {x >= 10 ? Math.round(x) : x.toFixed(1)}× ref
  </span>;
}

function AccountCard({ s, rank, refAvg, active, onClick }: { s: AccountStat; rank: number; refAvg: number; active: boolean; onClick: () => void }) {
  return <button onClick={onClick} className={`relative min-w-[230px] snap-start rounded-2xl p-4 text-left transition ${s.ref ? "bg-gradient-to-br from-amber-400/25 via-amber-500/10 to-transparent ring-2 ring-amber-400/70" : "bg-[#121826] ring-1 ring-white/10 hover:ring-white/25"} ${active ? "outline outline-2 outline-offset-2 outline-blue-400" : ""}`}>
    <div className="flex items-center gap-2">
      <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-black ${s.ref ? "bg-amber-400 text-black" : "bg-white/10 text-slate-200"}`}>{s.ref ? "★" : rank}</span>
      <span className="flex gap-1">{s.platforms.map(p => <span key={p} className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${pstyle(p).badge}`}>{pstyle(p).short}</span>)}</span>
      {s.ref && <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-amber-300">Referencia</span>}
    </div>
    <p className="mt-2 truncate font-bold" title={s.name}>{s.name}</p>
    <p className="mt-1 text-2xl font-black tracking-tight">{fmt(s.views)} <span className="text-xs font-medium text-slate-400">vistas</span></p>
    <div className="mt-2 grid grid-cols-3 gap-1 text-center text-[11px]">
      <div className="rounded-lg bg-black/25 px-1 py-1.5"><b className="block text-sm">{s.reels}</b><span className="text-slate-400">reels</span></div>
      <div className="rounded-lg bg-black/25 px-1 py-1.5"><b className="block text-sm">{fmt(Math.round(s.avg))}</b><span className="text-slate-400">media</span></div>
      <div className="rounded-lg bg-black/25 px-1 py-1.5"><b className="block text-sm">{s.avgWatch}s</b><span className="text-slate-400">visto</span></div>
    </div>
    {!s.ref && <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-400">Media vs referencia <RefBadge value={s.avg} refAvg={refAvg} /></div>}
    {s.ref && <p className="mt-2 text-[11px] text-amber-200/80">La cuenta que inició el patrón</p>}
  </button>;
}

function Thumb({ src, platform }: { src?: string; platform: string }) {
  const [broken, setBroken] = useState(false);
  return <>
    <div className={`absolute inset-0 bg-gradient-to-br ${pstyle(platform).bg}`} />
    {src && !broken && <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="absolute inset-0 h-full w-full object-cover" />}
    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-black/10" />
  </>;
}

function ReelCard({ m, rank, refAvg, onDelete }: { m: Metric & { account: string }; rank: number; refAvg: number; onDelete: () => void }) {
  const chips: [string, string][] = [["⏱", `${m.avgWatch || 0}s visto`], ["💬", `${fmt(m.interactions || 0)} interacc.`]];
  if (m.shares) chips.push(["↗", `${fmt(m.shares)} compart.`]);
  if (m.saves) chips.push(["🔖", `${fmt(m.saves)} guard.`]);
  if (typeof m.skipRate === "number") chips.push(["⏭", `${m.skipRate}% salta en 3 s`]);
  if (m.followers) chips.push(["👤", `+${fmt(m.followers)}`]);
  const ref = isReference(m.account);
  return <article className={`group relative flex min-h-[340px] flex-col overflow-hidden rounded-2xl ring-1 ${ref ? "ring-amber-400/60" : "ring-white/10"}`}>
    <Thumb src={m.thumb} platform={m.platform} />
    <div className="relative flex items-start gap-2 p-3">
      <span className={`rounded-lg px-2 py-1 text-sm font-black ${rank <= 3 ? "bg-amber-400 text-black" : "bg-black/60 text-white"}`}>#{rank}</span>
      <span className={`rounded px-1.5 py-1 text-[10px] font-bold ${pstyle(m.platform).badge}`}>{pstyle(m.platform).short}</span>
      <button onClick={onDelete} title="Eliminar esta métrica" className="ml-auto rounded bg-black/50 px-2 py-1 text-[11px] text-slate-300 opacity-0 transition hover:text-rose-300 group-hover:opacity-100">✕</button>
    </div>
    <div className="relative mt-auto p-3">
      <p className="text-2xl font-black leading-none tracking-tight drop-shadow sm:text-3xl">{fmt(m.views)} <span className="text-xs font-semibold text-slate-300 sm:text-sm">vistas</span></p>
      <p className="mt-2 line-clamp-2 text-sm font-semibold leading-snug">{m.episodeTitle || "Sin título"}</p>
      <p className="mt-1 flex items-center gap-1.5 truncate text-[11px] text-slate-300">{ref && <span className="text-amber-300">★</span>}{m.account} · {m.date}</p>
      <div className="mt-2 flex flex-wrap gap-1">{chips.map(([i, t]) => <span key={t} className="rounded-full bg-black/55 px-2 py-0.5 text-[11px] text-slate-100 ring-1 ring-white/10">{i} {t}</span>)}</div>
      <div className="mt-2 flex items-center gap-2">
        {!ref && <RefBadge value={m.views} refAvg={refAvg} />}
        {m.permalink && <a href={m.permalink} target="_blank" rel="noreferrer" className="ml-auto text-[11px] font-semibold text-blue-300 hover:text-blue-200">Ver ↗</a>}
      </div>
    </div>
  </article>;
}

export default function MetricsModule() {
  const { data, insert, remove, mode } = useData();
  const items = data.metrics;
  const [recs, setRecs] = useState<string[]>([]);
  const [authError, setAuthError] = useState(false);
  const [recMode, setRecMode] = useState("");
  const [platform, setPlatform] = useState("Todas");
  const [account, setAccount] = useState("");
  const [period, setPeriod] = useState(0);
  const [sort, setSort] = useState<"views" | "avgWatch" | "interactions" | "date">("views");
  const [shown, setShown] = useState(12);
  const episodeTitles = Array.from(new Set(items.map(m => m.episodeTitle).filter(Boolean)));
  const [ep, setEp] = useState("");
  const activeEp = ep && episodeTitles.includes(ep) ? ep : (episodeTitles[0] || "");
  const [f, setF] = useState<any>({ episodeTitle: "", platform: "TikTok", date: new Date().toISOString().slice(0, 10), views: "", avgWatch: "", interactions: "", followers: "", formula: "", hook: "", duration: "", shares: "", saves: "", oneMinViews: "", estRevenue: "", completion: "", searches: "", viewedVsSwiped: "", retention: "" });

  // Nombre de cuenta: el importado de Meta o, en registros manuales, la cuenta de la app.
  const withAccount = useMemo(() => items.map(m => ({ ...m, account: m.accountName || data.accounts.find((a: any) => a.id === m.accountId)?.name || "Registro manual" })), [items, data.accounts]);
  const inPeriod = useMemo(() => withAccount.filter(m => (platform === "Todas" || m.platform === platform) && (!period || (m.date && daysAgo(m.date) <= period))), [withAccount, platform, period]);
  const accounts = useMemo(() => accountStats(inPeriod), [inPeriod]);
  const refAvg = accounts.find(a => a.ref)?.avg || 0;
  const reels = useMemo(() => inPeriod.filter(m => !account || m.account === account).sort((a, b) =>
    sort === "date" ? String(b.date).localeCompare(String(a.date)) : ((b as any)[sort] || 0) - ((a as any)[sort] || 0)), [inPeriod, account, sort]);
  const totals = { views: inPeriod.reduce((a, m) => a + (m.views || 0), 0), followers: inPeriod.reduce((a, m) => a + (m.followers || 0), 0), reels: inPeriod.length };

  async function analyzeLocal() {
    setAuthError(false);
    setRecs(templateMetricRecommendations(items));
    setRecMode("plantilla local en el cliente (sin IA)");
  }
  async function analyze() {
    if (mode !== "supabase") { await analyzeLocal(); return; }
    const r = await postApi("/api/analyze-metrics", { metrics: items });
    if (isAuthError(r)) { setAuthError(true); return; }
    setRecs(r.json?.recommendations || []);
    setRecMode(r.json?.mode || "IA");
  }
  async function submit(e: any) {
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
  const rank = (key: string) => { const m: any = {}; items.forEach((x: any) => { const k = String(x[key] ?? ""); if (k) m[k] = (m[k] || 0) + x.views; }); return Object.entries(m).sort((a: any, b: any) => b[1] - a[1]).slice(0, 5); };
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const chip = (on: boolean) => `rounded-full px-3 py-1.5 text-xs font-semibold transition ${on ? "bg-white text-black" : "bg-white/5 text-slate-300 hover:bg-white/10"}`;

  return <section>
    <h2 className="text-xl font-bold">Métricas</h2>
    <p className="mt-1 text-xs text-slate-500">{mode === "supabase" ? "Guardado en tu cuenta." : "Modo sin login: guardado en este navegador."}</p>
    <MetaConnect />

    {/* Resumen */}
    <div className="mt-4 grid grid-cols-3 gap-2">
      {[["Vistas", fmt(totals.views)], ["Reels", String(totals.reels)], ["Seguidores ganados", "+" + fmt(totals.followers)]].map(([l, v]) =>
        <div key={l} className="rounded-2xl bg-gradient-to-br from-white/[.07] to-white/[.02] p-3 ring-1 ring-white/10"><p className="text-[11px] uppercase tracking-wider text-slate-400">{l}</p><p className="text-xl font-black sm:text-2xl">{v}</p></div>)}
    </div>

    {/* Filtros */}
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {["Todas", ...PLATFORMS].map(p => <button key={p} onClick={() => { setPlatform(p); setShown(12); }} className={chip(platform === p)}>{p}</button>)}
      <span className="mx-1 hidden h-5 w-px bg-white/10 sm:block" />
      {[[7, "7 días"], [30, "30 días"], [90, "90 días"], [0, "Todo"]].map(([d, l]) => <button key={d} onClick={() => setPeriod(d as number)} className={chip(period === d)}>{l}</button>)}
    </div>

    {/* Cuentas */}
    <div className="mt-5 flex items-end gap-2">
      <h3 className="font-bold">🏆 Cuentas con más vistas</h3>
      {account && <button onClick={() => setAccount("")} className="ml-auto text-xs text-blue-300">Ver todas las cuentas ✕</button>}
    </div>
    {accounts.length ? <>
      <div className="-mx-1 mt-2 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
        {accounts.map((s, i) => <AccountCard key={s.name} s={s} rank={accounts.filter(a => !a.ref).indexOf(s) + 1 || i + 1} refAvg={refAvg} active={account === s.name} onClick={() => { setAccount(account === s.name ? "" : s.name); setShown(12); }} />)}
      </div>
      {!refAvg && <p className="text-xs text-amber-200/80">No hay datos de <b>Películas que no existen</b> en este filtro: elige su página al importar para usarla como referencia.</p>}
    </> : <p className="mt-2 rounded-xl bg-[#121826] p-4 text-sm text-slate-400">Aún no hay métricas. Conecta Facebook e Instagram arriba o registra un video a mano abajo.</p>}

    {/* Reels */}
    {reels.length > 0 && <>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <h3 className="font-bold">🔥 {account ? account : "Reels con más vistas"}</h3>
        <select value={sort} onChange={e => setSort(e.target.value as any)} className="ml-auto w-auto py-1 text-xs">
          <option value="views">Más vistas</option><option value="avgWatch">Más tiempo visto</option><option value="interactions">Más interacciones</option><option value="date">Más recientes</option>
        </select>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {reels.slice(0, shown).map((m, i) => <ReelCard key={m.id} m={m} rank={i + 1} refAvg={refAvg} onDelete={() => remove("metrics", m.id)} />)}
      </div>
      {reels.length > shown && <button onClick={() => setShown(shown + 12)} className="mt-3 w-full rounded-xl bg-white/5 py-2.5 text-sm font-semibold hover:bg-white/10">Ver más ({reels.length - shown} restantes)</button>}
      <p className="mt-2 text-[11px] text-slate-500">«× ref» compara las vistas con la media por Reel de Películas que no existen. Cada plataforma se juzga con sus propias métricas: no compares solo por vistas.</p>
    </>}

    {/* Aprendizaje */}
    {(() => { const L = learnFromMetrics(items); return <div className="mt-6 rounded-2xl border border-violet-500/30 bg-violet-900/20 p-4 text-sm"><b>🧠 Lo que la IA aprende de tus métricas</b>{L ? <ul className="ml-5 mt-1 list-disc space-y-0.5">{L.hooks.length > 0 && <li>Mejores ganchos: {L.hooks.join(" · ")}</li>}{L.formulas.length > 0 && <li>Fórmulas ganadoras: {L.formulas.join(" · ")}</li>}{L.durations.length > 0 && <li>Mejor duración: {L.durations.join(", ")}</li>}</ul> : <p className="mt-1 text-slate-400">Registra al menos 2 videos con vistas y la IA empezará a usarlos en cada guion nuevo.</p>}{L && <p className="mt-1 text-xs text-slate-400">Se envía automáticamente a la IA al crear historias y episodios.</p>}
      <div className="mt-3"><button onClick={analyze} className="rounded bg-amber-500 px-4 py-2 font-bold text-black">Analizar con IA</button></div>
      {authError && <AiAuthNotice onLocalTemplate={analyzeLocal} />}
      {recs.length > 0 && <><ol className="ml-5 mt-3 list-decimal space-y-1">{recs.map((r, i) => <li key={i}>{r}</li>)}</ol>{recMode && <p className="mt-1 text-xs text-slate-500">Fuente: {recMode}</p>}</>}
    </div>; })()}

    {/* Plegables: comparación 4B, rankings, tabla y registro manual */}
    <details className="mt-4 rounded-2xl bg-[#121826] p-4 ring-1 ring-white/10">
      <summary className="cursor-pointer font-bold">📊 Mismo episodio en las 4 plataformas</summary>
      {episodeTitles.length > 0 ? <>
        <select className="mt-3 max-w-md" value={activeEp} onChange={e => setEp(e.target.value)}>{episodeTitles.map(e => <option key={e}>{e}</option>)}</select>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {PLATFORMS.map(p => { const m = items.find(x => x.episodeTitle === activeEp && x.platform === p); return <article key={p} className="rounded-xl border border-slate-800 bg-black/20 p-4"><span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${pstyle(p).badge}`}>{p}</span>{m ? <div className="mt-2 space-y-1 text-sm"><p className="text-lg font-black">{m.views.toLocaleString()} <span className="text-xs font-normal text-slate-400">vistas · {m.date}</span></p>{platformCells(m).map((c, i) => <p key={i} className="text-xs text-amber-200">• {c}</p>)}<p className="text-xs text-slate-400">{m.interactions.toLocaleString()} interacciones</p></div> : <p className="mt-2 text-sm text-slate-500">Sin datos en esta plataforma</p>}</article>; })}
        </div>
      </> : <p className="mt-2 text-sm text-slate-400">Sin métricas todavía.</p>}
    </details>

    <details className="mt-3 rounded-2xl bg-[#121826] p-4 ring-1 ring-white/10">
      <summary className="cursor-pointer font-bold">🥇 Rankings por fórmula, gancho y duración</summary>
      <div className="mt-3 grid gap-3 md:grid-cols-3">{[["formula", "Fórmula"], ["hook", "Gancho"], ["duration", "Duración (s)"]].map(([k, label]) => { const r = rank(k); return <div key={k} className="rounded-xl bg-black/20 p-3"><b className="text-sm">{label}</b>{r.length ? r.map(([n, v]: any, i: number) => <p key={i} className="mt-1 text-xs"><span className="text-slate-500">{i + 1}.</span> {n} — <b>{fmt(Number(v))}</b> vistas</p>) : <p className="mt-1 text-xs text-slate-500">Sin datos (se rellena al enlazar Reels con episodios).</p>}</div>; })}</div>
    </details>

    <details className="mt-3 rounded-2xl bg-[#121826] p-4 ring-1 ring-white/10">
      <summary className="cursor-pointer font-bold">📋 Tabla completa ({items.length})</summary>
      <div className="mt-3 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-slate-400"><th>Episodio</th><th>Cuenta</th><th>Fecha</th><th>Plataforma</th><th>Vistas</th><th>Prom.</th><th>Interacc.</th><th></th></tr></thead>
        <tbody>{withAccount.map(m => <tr key={m.id} className="border-t border-slate-800"><td className="max-w-[220px] truncate">{m.episodeTitle}</td><td className="max-w-[160px] truncate text-slate-400">{m.account}</td><td>{m.date}</td><td>{m.platform}</td><td>{m.views.toLocaleString()}</td><td>{m.avgWatch}s</td><td>{m.interactions}</td><td><button className="text-xs text-red-400" onClick={() => remove("metrics", m.id)}>Eliminar</button></td></tr>)}</tbody></table></div>
    </details>

    <details className="mt-3 rounded-2xl bg-[#121826] p-4 ring-1 ring-white/10">
      <summary className="cursor-pointer font-bold">➕ Registrar un video a mano (TikTok, YouTube…)</summary>
      <form className="mt-3" onSubmit={submit}>
        <div className="grid gap-2 md:grid-cols-4">
          <input placeholder="Título del episodio" value={f.episodeTitle} onChange={set("episodeTitle")} required />
          <select value={f.platform} onChange={set("platform")}>{PLATFORMS.map(p => <option key={p}>{p}</option>)}</select>
          <input type="date" value={f.date} onChange={set("date")} />
          <input type="number" placeholder="Duración (s)" value={f.duration} onChange={set("duration")} />
          <input type="number" placeholder="Vistas" value={f.views} onChange={set("views")} />
          <input type="number" placeholder="Prom. reproducción (s)" value={f.avgWatch} onChange={set("avgWatch")} />
          <input type="number" placeholder="Interacciones" value={f.interactions} onChange={set("interactions")} />
          <input type="number" placeholder="Seguidores ganados" value={f.followers} onChange={set("followers")} />
          <input placeholder="Fórmula usada" value={f.formula} onChange={set("formula")} />
          <input placeholder="Gancho usado" value={f.hook} onChange={set("hook")} />
        </div>
        <p className="mt-3 text-xs text-slate-400">Métricas según plataforma (rellena las de la plataforma elegida):</p>
        <div className="mt-1 grid gap-2 md:grid-cols-4">
          <input type="number" placeholder="IG: compartidos" value={f.shares} onChange={set("shares")} />
          <input type="number" placeholder="IG: guardados" value={f.saves} onChange={set("saves")} />
          <input type="number" placeholder="FB: vistas de 1 min" value={f.oneMinViews} onChange={set("oneMinViews")} />
          <input type="number" step="0.01" placeholder="FB: ingresos est. US$" value={f.estRevenue} onChange={set("estRevenue")} />
          <input type="number" placeholder="TikTok: % visto completo" value={f.completion} onChange={set("completion")} />
          <input type="number" placeholder="TikTok: desde búsquedas" value={f.searches} onChange={set("searches")} />
          <input type="number" placeholder="Shorts: % visto vs deslizado" value={f.viewedVsSwiped} onChange={set("viewedVsSwiped")} />
          <input type="number" placeholder="Shorts: % retención" value={f.retention} onChange={set("retention")} />
        </div>
        <button className="mt-3 rounded bg-amber-500 px-4 py-2 font-bold text-black">Guardar métrica</button>
      </form>
    </details>
  </section>;
}
