"use client";
import { useEffect, useMemo, useState } from "react";
import AiAuthNotice from "./AiAuthNotice";
import { useData } from "@/lib/DataContext";
import { postApi, isAuthError } from "@/lib/api-client";
import { templateMetricRecommendations } from "@/lib/llm";
import { learnFromMetrics } from "@/lib/learning";
import MetaConnect from "./MetaConnect";
import EpisodeInsights from "./EpisodeInsights";
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
  const available = (v: unknown, unit: string) => typeof v === "number" ? `${v.toLocaleString()} ${unit}` : `${unit}: sin dato`;
  if (m.platform === "Instagram") return [available(m.shares, "compartidos"), available(m.saves, "guardados"), typeof m.skipRate === "number" ? `${m.skipRate}% lo salta en 3 s` : `+${m.followers} seguidores`];
  if (m.platform === "Facebook") return [`${m.avgWatch}s tiempo promedio`, available(m.oneMinViews, "vistas de 1 min"), typeof m.estRevenue === "number" ? `US$${m.estRevenue.toFixed(2)} ingresos estimados` : "Ingresos estimados: sin dato"];
  if (m.platform === "TikTok") return [typeof m.completion === "number" ? `${m.completion}% visto completo` : "Finalización: sin dato", `+${m.followers} nuevos seguidores`, available(m.searches, "desde búsquedas")];
  return [typeof m.viewedVsSwiped === "number" ? `${m.viewedVsSwiped}% visto vs deslizado` : "Visto vs deslizado: sin dato", typeof m.retention === "number" ? `${m.retention}% retención` : "Retención: sin dato", `+${m.followers} seguidores`];
}
const NUMF = (v: string) => v === "" ? undefined : Number(v);
const todayInStudioTimeZone = () => {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Santo_Domingo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = (type: string) => parts.find(part => part.type === type)?.value || "";
  return `${value("year")}-${value("month")}-${value("day")}`;
};

interface AccountStat { name: string; platforms: string[]; reels: number; views: number; avg: number; avgWatch: number; best?: Metric; ref: boolean }

function accountStats(items: (Metric & { account: string })[]): AccountStat[] {
  const g = new Map<string, AccountStat & { watchSum: number; watchN: number }>();
  for (const m of items) {
    const s = g.get(m.account) || { name: m.account, platforms: [], reels: 0, views: 0, avg: 0, avgWatch: 0, watchSum: 0, watchN: 0, ref: isReference(m.account) };
    s.reels++; s.views += m.views || 0;
    if ((m.avgWatch || 0) > 0) { s.watchSum += m.avgWatch; s.watchN++; }
    if (!s.platforms.includes(m.platform)) s.platforms.push(m.platform);
    if (!s.best || (m.views || 0) > (s.best.views || 0)) s.best = m;
    g.set(m.account, s);
  }
  return Array.from(g.values()).map(s => ({ ...s, avg: s.views / s.reels, avgWatch: s.watchN ? Math.round((s.watchSum / s.watchN) * 10) / 10 : 0 }))
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
  return <button type="button" onClick={onClick} aria-pressed={active} aria-label={`${s.name}: ${s.views.toLocaleString()} vistas. ${active ? "Quitar filtro" : "Filtrar publicaciones de esta cuenta"}`} className={`group relative min-h-[236px] min-w-[270px] max-w-[320px] flex-1 snap-start overflow-hidden rounded-[22px] border p-4 text-left text-white shadow-[0_18px_40px_-28px_#000] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_45px_-22px_#000] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#598BFF] ${s.ref ? "border-[#FF9F1C]/60 bg-[linear-gradient(135deg,rgba(255,159,28,.17),#151C2B_52%,#111827)]" : "border-white/10 bg-[#151C2B] hover:border-[#598BFF]/45"} ${active ? "border-[#598BFF] ring-2 ring-[#598BFF]/60" : ""}`}>
    <span aria-hidden="true" className={`absolute -right-8 -top-12 h-32 w-32 rounded-full blur-3xl transition-opacity group-hover:opacity-100 ${s.ref ? "bg-[#FF9F1C]/20" : "bg-[#598BFF]/10"}`} />
    <span className="relative flex items-center justify-between gap-2">
      <span className={`inline-flex min-h-7 items-center rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.12em] ${s.ref ? "border-[#FF9F1C]/40 bg-[#FF9F1C]/15 text-[#FFCB84]" : "border-white/10 bg-white/5 text-slate-300"}`}>{s.ref ? "★ Cuenta de referencia" : `#${rank} por vistas`}</span>
      <span className="flex gap-1" aria-label={`Plataformas: ${s.platforms.join(", ")}`}>{s.platforms.map(p => <span key={p} title={p} className={`rounded-md px-1.5 py-1 text-[10px] font-bold ${pstyle(p).badge}`}>{pstyle(p).short}</span>)}</span>
    </span>
    <span className="relative mt-4 block min-h-10 break-words text-base font-bold leading-tight" title={s.name}>{s.name}</span>
    <span className="relative mt-1 block text-3xl font-black tracking-tight tabular-nums text-white" title={`${s.views.toLocaleString()} vistas`}>{fmt(s.views)} <span className="text-xs font-medium tracking-normal text-slate-300">vistas</span></span>
    <span className="relative mt-4 grid grid-cols-3 gap-1.5 border-t border-white/10 pt-3">
      <span className="min-w-0"><b className="block text-sm tabular-nums text-white">{s.reels}</b><span className="text-[10px] text-slate-300">Reels</span></span>
      <span className="min-w-0"><b className="block text-sm tabular-nums text-white">{fmt(Math.round(s.avg))}</b><span className="text-[10px] text-slate-300">Vistas/Reel</span></span>
      <span className="min-w-0"><b className="block text-sm tabular-nums text-white">{s.avgWatch ? `${s.avgWatch}s` : "—"}</b><span className="text-[10px] text-slate-300">Visto prom.</span></span>
    </span>
    <span className="relative mt-3 flex min-h-6 items-center gap-2 text-[11px] text-slate-300">{s.ref ? "Punto de comparación del estudio" : <>Media por Reel <RefBadge value={s.avg} refAvg={refAvg} /></>}</span>
  </button>;
}

function Thumb({ src, platform }: { src?: string; platform: string }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  return <div className="absolute inset-0 overflow-hidden bg-[#090D16]">
    <div className={`absolute inset-0 bg-gradient-to-br ${pstyle(platform).bg}`} />
    {src && !broken ? <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" /> : <div className="absolute inset-0 grid place-items-center overflow-hidden bg-[radial-gradient(ellipse_at_65%_30%,rgba(255,159,28,.22),transparent_52%),radial-gradient(ellipse_at_25%_90%,rgba(89,139,255,.26),transparent_56%)]">
      <span className="absolute -left-8 top-10 h-32 w-32 rotate-45 border border-white/10" aria-hidden="true" />
      <span className="absolute right-0 top-0 h-full w-1/3 border-l border-white/10 bg-white/[.03]" aria-hidden="true" />
      <span className="relative flex flex-col items-center gap-2 text-slate-200/80"><svg aria-hidden="true" viewBox="0 0 48 48" fill="none" className="h-11 w-11"><rect x="5" y="12" width="38" height="29" rx="5" stroke="currentColor" strokeWidth="1.5"/><path d="M5 21h38M13 12l8 9m5-9 8 9" stroke="currentColor" strokeWidth="1.5"/><path d="m21 27 8 4-8 4v-8Z" fill="currentColor"/></svg><span className="text-[10px] font-semibold uppercase tracking-[.18em]">Sin miniatura</span></span>
    </div>}
    <div className="absolute inset-0 bg-gradient-to-t from-[#090D16]/70 via-transparent to-[#090D16]/40" />
  </div>;
}

function ReelCard({ m, rank, refAvg, onDelete, onOpenEpisode }: { m: Metric & { account: string }; rank: number; refAvg: number; onDelete: () => void; onOpenEpisode: () => void }) {
  const chips: [string, string][] = [["💬", `${fmt(m.interactions || 0)} interacc.`]];
  if ((m.avgWatch || 0) > 0) chips.unshift(["⏱", `${m.avgWatch}s visto`]);
  if (m.shares) chips.push(["↗", `${fmt(m.shares)} compart.`]);
  if (m.saves) chips.push(["🔖", `${fmt(m.saves)} guard.`]);
  if (typeof m.skipRate === "number") chips.push(["⏭", `${m.skipRate}% salta en 3 s`]);
  if (m.followers) chips.push(["👤", `+${fmt(m.followers)}`]);
  const ref = isReference(m.account);
  return <article id={`metric-${m.id}`} className={`group relative flex scroll-mt-28 flex-col overflow-hidden rounded-[22px] border bg-[#151C2B] text-white shadow-[0_18px_40px_-28px_#000] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_24px_45px_-22px_#000] focus-within:border-[#598BFF]/70 ${ref ? "border-[#FF9F1C]/45" : "border-white/10 hover:border-[#598BFF]/35"}`}>
    <div className="relative h-44 overflow-hidden sm:h-48">
      <Thumb src={m.thumb} platform={m.platform} />
      <div className="absolute inset-x-3 top-3 flex items-start gap-1.5">
        <span className={`inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-xs font-black shadow-lg ${rank <= 3 ? "bg-[#FF9F1C] text-[#090D16]" : "border border-white/20 bg-[#090D16]/80 text-white"}`}>#{rank}</span>
        <span className={`inline-flex h-8 items-center rounded-lg px-2 text-[10px] font-bold shadow-lg ${pstyle(m.platform).badge}`}>{m.platform}</span>
        <details className="relative ml-auto">
          <summary className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-xl border border-white/20 bg-[#090D16]/85 text-lg font-bold text-white transition hover:bg-[#090D16] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF9F1C]" aria-label={`Opciones de ${m.episodeTitle || "este video"}`}>···</summary>
          <div className="absolute right-0 top-11 z-10 min-w-40 rounded-xl border border-white/15 bg-[#151C2B] p-1 shadow-xl">
            <button type="button" onClick={() => { if (window.confirm("¿Eliminar esta métrica? Esta acción no se puede deshacer.")) onDelete(); }} className="min-h-10 w-full rounded-lg px-3 py-2 text-left text-xs text-rose-200 hover:bg-rose-500/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FF9F1C]">Eliminar métrica</button>
          </div>
        </details>
      </div>
      {ref && <span className="absolute bottom-3 left-3 rounded-full border border-[#FF9F1C]/50 bg-[#090D16]/85 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#FFCB84]">★ Referencia</span>}
    </div>
    <div className="flex flex-1 flex-col p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[.12em] text-slate-400">Visualizaciones</p>
        {!ref && <RefBadge value={m.views} refAvg={refAvg} />}
      </div>
      <p className="mt-1 text-[2rem] font-black leading-none tracking-tight tabular-nums text-white" title={`${m.views.toLocaleString()} vistas`}>{fmt(m.views)}</p>
      <h4 className="mt-4 line-clamp-2 min-h-10 text-sm font-bold leading-snug text-white" title={m.episodeTitle || "Sin título"}>{m.episodeTitle || "Sin título"}</h4>
      <p className="mt-1 truncate text-xs text-slate-300" title={m.account}>{m.account}</p>
      <p className="mt-0.5 text-[11px] text-slate-400">Publicado {m.date ? <time dateTime={m.date}>{m.date}</time> : "sin fecha"}</p>
      <div className="mt-4 flex flex-wrap gap-1.5 border-t border-white/10 pt-3">{chips.map(([i, t]) => <span key={t} className="rounded-full border border-white/10 bg-[#090D16]/45 px-2.5 py-1 text-[11px] text-slate-200">{i} {t}</span>)}</div>
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
        <button type="button" onClick={onOpenEpisode} className="inline-flex min-h-10 flex-1 items-center justify-center rounded-xl border border-[#598BFF]/40 bg-[#598BFF]/10 px-3 text-xs font-bold text-[#B3C9FF] transition hover:border-[#598BFF] hover:bg-[#598BFF]/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#598BFF]">Analizar episodio <span aria-hidden="true" className="ml-1">↗</span></button>
        {m.permalink && <a href={m.permalink} target="_blank" rel="noreferrer" aria-label={`Ver ${m.episodeTitle || "publicación"} en ${m.platform}`} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/15 px-3 text-xs font-semibold text-slate-200 transition hover:border-white/40 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#598BFF]">Ver video ↗</a>}
      </div>
    </div>
  </article>;
}

export default function MetricsModule({ focusMetricId }: { focusMetricId?: string }) {
  const { data, insert, update, remove, removeMany, mode } = useData();
  const [deleting, setDeleting] = useState(false);
  const items = data.metrics;
  const [recs, setRecs] = useState<string[]>([]);
  const [authError, setAuthError] = useState(false);
  const [recMode, setRecMode] = useState("");
  const [platform, setPlatform] = useState("Todas");
  const [account, setAccount] = useState("");
  const [seriesId, setSeriesId] = useState("");
  const [query, setQuery] = useState("");
  const [linkTarget, setLinkTarget] = useState<Record<string, string>>({});
  const [linkMsg, setLinkMsg] = useState("");
  const [shownUnlinked, setShownUnlinked] = useState(10);
  const [period, setPeriod] = useState(0);
  const [sort, setSort] = useState<"views" | "avgWatch" | "interactions" | "date">("views");
  const [shown, setShown] = useState(12);
  const [ep, setEp] = useState("");
  const [f, setF] = useState<any>({ episodeTitle: "", platform: "TikTok", date: todayInStudioTimeZone(), views: "", avgWatch: "", interactions: "", followers: "", formula: "", hook: "", duration: "", shares: "", saves: "", oneMinViews: "", estRevenue: "", completion: "", searches: "", viewedVsSwiped: "", retention: "" });

  useEffect(() => {
    if (!focusMetricId || !items.some(m => m.id === focusMetricId)) return;
    setPlatform("Todas"); setSeriesId(""); setPeriod(0); setAccount(""); setQuery(""); setShown(Math.max(12, items.length));
    requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById(`metric-${focusMetricId}`)?.scrollIntoView({ behavior: "smooth", block: "center" })));
  }, [focusMetricId, items]);

  // Nombre de cuenta: el importado de Meta o, en registros manuales, la cuenta de la app.
  const withAccount = useMemo(() => items.map(m => ({ ...m, account: m.accountName || data.accounts.find((a: any) => a.id === m.accountId)?.name || "Registro manual" })), [items, data.accounts]);
  const inPeriod = useMemo(() => withAccount.filter(m => {
    if (platform !== "Todas" && m.platform !== platform) return false;
    if (period && (!m.date || daysAgo(m.date) > period || daysAgo(m.date) < 0)) return false;
    if (seriesId && !data.episodes.some(e => e.id === m.episodeId && e.seriesId === seriesId)) return false;
    return true;
  }), [withAccount, platform, period, seriesId, data.episodes]);
  const accounts = useMemo(() => accountStats(inPeriod), [inPeriod]);
  const refAvg = accounts.find(a => a.ref)?.avg || 0;
  const filtered = useMemo(() => inPeriod.filter(m => !account || m.account === account), [inPeriod, account]);
  const reels = useMemo(() => filtered.filter(m => !query || `${m.episodeTitle} ${m.account} ${m.platform}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a, b) =>
    sort === "date" ? String(b.date).localeCompare(String(a.date)) : ((b as any)[sort] || 0) - ((a as any)[sort] || 0)), [filtered, query, sort]);
  const episodeTitles = Array.from(new Set([...data.episodes.filter(e => !seriesId || e.seriesId === seriesId).map(e => e.title), ...filtered.map(m => m.episodeTitle)].filter(Boolean)));
  const activeEp = ep && episodeTitles.includes(ep) ? ep : (episodeTitles[0] || "");
  const selectedEpisode = data.episodes.find(e => e.title === activeEp && (!seriesId || e.seriesId === seriesId));
  const selectedEpisodeMetrics = filtered.filter(m => (selectedEpisode && m.episodeId === selectedEpisode.id) || (m.episodeTitle === activeEp && (!selectedEpisode || !m.episodeId)));
  const unlinked = items.filter(m => !m.episodeId);
  const retentionValues = filtered.map(m => m.retention).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const watchValues = filtered.map(m => m.avgWatch).filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0);
  const totals = { views: filtered.reduce((a, m) => a + (m.views || 0), 0), interactions: filtered.reduce((a, m) => a + (m.interactions || 0), 0), followers: filtered.reduce((a, m) => a + (m.followers || 0), 0), reels: filtered.length };
  const retention = retentionValues.length ? Math.round(retentionValues.reduce((a, v) => a + v, 0) / retentionValues.length) : null;
  const avgWatch = watchValues.length ? Math.round(watchValues.reduce((a, v) => a + v, 0) / watchValues.length * 10) / 10 : null;
  const publishDates = useMemo(() => {
    const dates = new Map<string, { count: number; views: number }>();
    filtered.forEach(m => { if (!m.date) return; const current = dates.get(m.date) || { count: 0, views: 0 }; current.count += 1; current.views += m.views || 0; dates.set(m.date, current); });
    return Array.from(dates.entries()).sort(([a], [b]) => a.localeCompare(b)).slice(-8);
  }, [filtered]);
  const lastCapture = items.map(m => m.capturedAt).filter((value): value is string => !!value && !Number.isNaN(new Date(value).getTime())).sort().at(-1);

  async function analyzeLocal() {
    setAuthError(false);
    setRecs(templateMetricRecommendations(filtered));
    setRecMode("plantilla local en el cliente (sin IA)");
  }
  async function analyze() {
    if (mode !== "supabase") { await analyzeLocal(); return; }
    const r = await postApi("/api/analyze-metrics", { metrics: filtered });
    if (isAuthError(r)) { setAuthError(true); return; }
    setRecs(r.json?.recommendations || []);
    setRecMode(r.json?.mode || "IA");
  }
  async function submit(e: any) {
    e.preventDefault();
    await insert("metrics", {
      episodeTitle: f.episodeTitle, platform: f.platform, date: f.date,
      views: Number(f.views || 0), avgWatch: Number(f.avgWatch || 0), interactions: Number(f.interactions || 0), followers: Number(f.followers || 0),
      capturedAt: new Date().toISOString(),
      formula: f.formula, hook: f.hook, duration: Number(f.duration || 0),
      shares: NUMF(f.shares), saves: NUMF(f.saves), oneMinViews: NUMF(f.oneMinViews), estRevenue: NUMF(f.estRevenue),
      completion: NUMF(f.completion), searches: NUMF(f.searches), viewedVsSwiped: NUMF(f.viewedVsSwiped), retention: NUMF(f.retention),
    });
    setF({ ...f, views: "", interactions: "", followers: "" });
  }
  const rank = (key: string) => { const m: any = {}; filtered.forEach((x: any) => { const k = String(x[key] ?? ""); if (k) m[k] = (m[k] || 0) + x.views; }); return Object.entries(m).sort((a: any, b: any) => b[1] - a[1]).slice(0, 5); };
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const openEpisode = (title: string) => { setEp(title); requestAnimationFrame(() => document.getElementById("episode-insights")?.scrollIntoView({ behavior: "smooth", block: "start" })); };
  async function linkEpisode(m: Metric) {
    const id = linkTarget[m.id] || data.episodes.find(e => norm(e.title) === norm(m.episodeTitle))?.id;
    if (!id) return;
    const episode = data.episodes.find(e => e.id === id);
    if (!episode) return;
    try {
      await update("metrics", m.id, { ...m, episodeId: id, episodeTitle: episode.title });
      setLinkTarget(prev => ({ ...prev, [m.id]: "" }));
      setLinkMsg(`Publicación vinculada con «${episode.title}».`);
    } catch (error: any) { setLinkMsg(`No se pudo vincular: ${error?.message || String(error)}`); }
  }

  return <section className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[.2em] text-[#FF9F1C]">Estudio Viral / Intelligence Hub</p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">Centro de rendimiento</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-300">Analiza las publicaciones medidas y encuentra el siguiente paso para tus historias.</p>
      </div>
      <div className="rounded-xl border border-white/10 bg-white/[.035] px-3 py-2 text-xs text-slate-300">
        <span className="block font-semibold text-slate-100">{mode === "supabase" ? "Datos de tu cuenta" : "Datos de este navegador"}</span>
        <span>Último registro: {lastCapture ? new Intl.DateTimeFormat("es-DO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santo_Domingo" }).format(new Date(lastCapture)) : "no registrado"}</span>
      </div>
    </div>

    <div className="rounded-2xl border border-white/10 bg-[#151C2B] p-4 sm:p-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-40 flex-1 text-xs font-semibold text-slate-300">Serie
          <select className="mt-1" value={seriesId} onChange={e => { setSeriesId(e.target.value); setAccount(""); setShown(12); }}>
            <option value="">Todas las series</option>
            {data.series.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
        </label>
        <label className="min-w-40 flex-1 text-xs font-semibold text-slate-300">Plataforma
          <select className="mt-1" value={platform} onChange={e => { setPlatform(e.target.value); setAccount(""); setShown(12); }}>
            {["Todas", ...PLATFORMS].map(p => <option key={p} value={p}>{p === "Todas" ? "Todas las plataformas" : p}</option>)}
          </select>
        </label>
        <label className="min-w-36 flex-1 text-xs font-semibold text-slate-300">Publicados
          <select className="mt-1" value={period} onChange={e => { setPeriod(Number(e.target.value)); setShown(12); }}>
            <option value={0}>Cualquier fecha</option><option value={7}>Últimos 7 días</option><option value={30}>Últimos 30 días</option><option value={90}>Últimos 90 días</option>
          </select>
        </label>
      </div>
      {seriesId && <p className="mt-2 text-xs text-slate-400">El filtro de serie incluye solo publicaciones vinculadas a un episodio de esa serie.</p>}
      {account && <button type="button" onClick={() => setAccount("")} className="mt-3 text-xs font-semibold text-[#86A9FF] hover:text-white">Cuenta: {account} · quitar filtro</button>}
    </div>

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[
        { label: "Visualizaciones", value: totals.reels ? fmt(totals.views) : "—", note: `${totals.reels} publicaciones medidas`, color: "text-[#FF9F1C]" },
        { label: retention === null && avgWatch !== null ? "Tiempo visto medio" : "Retención media", value: retention !== null ? `${retention}%` : avgWatch !== null ? `${avgWatch}s` : "—", note: retentionValues.length ? `${retentionValues.length} registros con retención` : watchValues.length ? `${watchValues.length} publicaciones con tiempo visto` : "Sin dato comparable", color: "text-[#86A9FF]" },
        { label: "Interacciones", value: totals.reels ? fmt(totals.interactions) : "—", note: "Suma de publicaciones", color: "text-white" },
        { label: "Seguidores ganados", value: totals.reels ? `+${fmt(totals.followers)}` : "—", note: "Suma registrada", color: "text-[#34D399]" },
      ].map(card => <article key={card.label} className="min-h-32 rounded-2xl border border-white/10 bg-[#151C2B] p-4 shadow-[0_12px_35px_-25px_#000] sm:p-5">
        <p className="text-xs font-medium text-slate-300">{card.label}</p>
        <p className={`mt-3 text-2xl font-bold tracking-tight sm:text-3xl ${card.color}`}>{card.value}</p>
        <p className="mt-2 text-[11px] text-slate-400">{card.note}</p>
      </article>)}
    </div>

    {accounts.length > 0 && <section aria-labelledby="accounts-heading" className="rounded-[24px] border border-white/10 bg-[#101724] p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#FF9F1C]">Rendimiento por cuenta</p><h3 id="accounts-heading" className="mt-1 text-lg font-bold text-white">Cuentas por visualizaciones</h3><p className="mt-1 text-xs text-slate-300">Selecciona una cuenta para explorar sus publicaciones. Las vistas son acumuladas.</p></div>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">{accounts.length} {accounts.length === 1 ? "cuenta" : "cuentas"}</span>
      </div>
      <div className="-mx-1 mt-4 flex snap-x gap-3 overflow-x-auto px-1 pb-3">{accounts.map(s => <AccountCard key={s.name} s={s} rank={accounts.filter(a => !a.ref).indexOf(s) + 1} refAvg={refAvg} active={account === s.name} onClick={() => { setAccount(account === s.name ? "" : s.name); setShown(12); }} />)}</div>
      <p className="text-[11px] text-slate-400">El promedio de vistas y tiempo visto se calcula por publicación medida.</p>
    </section>}

    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(290px,1fr)]">
      <article className="rounded-2xl border border-white/10 bg-[#151C2B] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h3 className="text-base font-bold text-white">Rendimiento por fecha de publicación</h3><p className="mt-1 text-xs text-slate-400">Vistas actuales agrupadas por la fecha de cada video.</p></div>
          <span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-slate-300">{publishDates.length} fechas</span>
        </div>
        {publishDates.length ? <>
          <div className="mt-6 overflow-x-auto" role="region" aria-label="Gráfica de vistas por fecha de publicación" tabIndex={0}>
            <div className="flex h-48 w-full min-w-[480px] items-end gap-3 border-b border-white/15 pb-2" aria-hidden="true">
              {publishDates.map(([date, bucket]) => <div key={date} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
                <span className="text-[10px] font-semibold text-slate-200">{fmt(bucket.views)}</span>
                <div className="w-full max-w-14 rounded-t-lg bg-gradient-to-t from-[#9C5216] to-[#FF9F1C]" style={{ height: `${Math.max(8, Math.round(bucket.views / Math.max(1, ...publishDates.map(([, d]) => d.views)) * 136))}px` }} />
                <span className="truncate text-[10px] text-slate-400">{new Date(date + "T12:00:00").toLocaleDateString("es-DO", { day: "2-digit", month: "short" })}</span>
              </div>)}
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-400 sm:hidden">Desliza la gráfica para ver todas las fechas.</p>
          <ul className="sr-only" aria-label="Datos de la gráfica">{publishDates.map(([date, bucket]) => <li key={date}>{date}: {bucket.views.toLocaleString()} vistas acumuladas de {bucket.count} publicaciones.</li>)}</ul>
        </> : <div className="mt-6 grid h-48 place-items-center rounded-xl border border-dashed border-white/15 bg-black/10 px-5 text-center text-sm text-slate-400">Las publicaciones medidas aparecerán aquí al importar o registrar métricas.</div>}
        <p className="mt-3 text-[11px] leading-relaxed text-slate-400">Esta vista no mide evolución diaria ni compara períodos: aún no se guardan capturas históricas. Los videos más antiguos han tenido más tiempo para acumular vistas.</p>
      </article>
      {(() => { const L = learnFromMetrics(filtered); return <article className="rounded-2xl border border-[#598BFF]/25 bg-[linear-gradient(145deg,rgba(89,139,255,.14),rgba(21,28,43,1)_58%)] p-5">
        <p className="text-[11px] font-bold uppercase tracking-[.16em] text-[#9DB8FF]">Insights</p>
        <h3 className="mt-2 text-lg font-bold text-white">Tu próximo movimiento creativo</h3>
        {L ? <ul className="mt-3 list-inside list-disc space-y-1.5 text-sm text-slate-200">{L.hooks.length > 0 && <li>Ganchos observados: {L.hooks.join(" · ")}</li>}{L.formulas.length > 0 && <li>Fórmulas observadas: {L.formulas.join(" · ")}</li>}{L.durations.length > 0 && <li>Duraciones observadas: {L.durations.join(", ")}</li>}</ul> : <p className="mt-3 text-sm leading-relaxed text-slate-300">Registra al menos dos videos con vistas para detectar patrones. Cualquier recomendación indicará qué datos utilizó.</p>}
        <button onClick={analyze} disabled={!filtered.length} className="mt-5 rounded-xl bg-[#FF9F1C] px-4 py-2.5 text-sm font-bold text-[#090D16] hover:brightness-110">Analizar datos disponibles</button>
        {authError && <div className="mt-3"><AiAuthNotice onLocalTemplate={analyzeLocal} /></div>}
        {recs.length > 0 && <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3"><ol className="ml-4 list-decimal space-y-2 text-sm text-slate-200">{recs.map((r, i) => <li key={i}>{r}</li>)}</ol><p className="mt-3 text-xs text-slate-400">Fuente: {recMode || "no indicada"} · {filtered.length} publicaciones seleccionadas</p></div>}
      </article>; })()}
    </div>

    <MetaConnect />

    <div>
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-base font-bold text-white">Cobertura de plataformas</h3><span className="text-xs text-slate-400">Registros disponibles en el estudio</span></div>
      <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">{PLATFORMS.map(p => { const count = withAccount.filter(m => m.platform === p).length; return <div key={p} className="rounded-xl border border-white/10 bg-[#151C2B] p-3"><span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold ${pstyle(p).badge}`}>{pstyle(p).short}</span><p className="mt-2 text-sm font-semibold text-white">{p}</p><p className="mt-1 text-xs text-slate-400">{count ? `${count} ${count === 1 ? "publicación medida" : "publicaciones medidas"}` : p === "TikTok" || p === "YouTube Shorts" ? "Sin registros · carga manual" : "Sin registros · revisa Meta"}</p></div>; })}</div>
    </div>


    <div>
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#598BFF]">Explorar contenido</p><h3 className="mt-1 text-lg font-bold text-white">Biblioteca de publicaciones</h3><p className="mt-1 text-xs text-slate-300">Miniaturas y resultados de cada video medido. Las vistas son acumuladas.</p></div><span className="rounded-full border border-white/10 bg-[#151C2B] px-3 py-1 text-xs text-slate-300">{reels.length} {reels.length === 1 ? "resultado" : "resultados"}</span>
        {reels.length > 0 && <button type="button" disabled={deleting} onClick={async () => {
          const filtered = reels.length < items.length;
          if (!window.confirm(`¿Eliminar ${reels.length} ${reels.length === 1 ? "métrica" : "métricas"}${filtered ? " (las que muestran los filtros actuales)" : " (todas)"}? Esta acción no se puede deshacer.${filtered ? "" : "\n\nLas métricas importadas de Facebook e Instagram volverán si importas otra vez."}`)) return;
          setDeleting(true); try { await removeMany("metrics", reels.map((m: any) => m.id)); } finally { setDeleting(false); }
        }} className="rounded-full border border-red-400/30 px-3 py-1 text-xs text-red-200 hover:bg-red-500/10">{deleting ? "Eliminando…" : `Eliminar ${reels.length === items.length ? "todas" : "estas " + reels.length}`}</button>}</div>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="min-w-52 flex-1 text-xs font-semibold text-slate-300">Buscar episodio o cuenta<input className="mt-1" type="search" value={query} onChange={e => { setQuery(e.target.value); setShown(12); }} placeholder="Buscar publicaciones…" /></label>
        <label className="min-w-44 text-xs font-semibold text-slate-300">Ordenar<select className="mt-1" value={sort} onChange={e => setSort(e.target.value as any)}><option value="views">Más vistas</option><option value="avgWatch">Más tiempo visto</option><option value="interactions">Más interacciones</option><option value="date">Más recientes</option></select></label>
      </div>
      {reels.length ? <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{reels.slice(0, shown).map((m, i) => <ReelCard key={m.id} m={m} rank={i + 1} refAvg={refAvg} onDelete={() => remove("metrics", m.id)} onOpenEpisode={() => openEpisode(m.episodeTitle)} />)}</div> : <div className="mt-3 rounded-2xl border border-dashed border-white/15 bg-[#151C2B] p-8 text-center text-sm text-slate-300">{items.length ? "No hay publicaciones para estos filtros." : "Todavía no hay métricas. Conecta Meta o registra un video a mano."}</div>}
      {reels.length > shown && <button onClick={() => setShown(shown + 12)} className="mt-3 w-full rounded-xl border border-white/10 bg-white/5 py-2.5 text-sm font-semibold hover:bg-white/10">Ver más ({reels.length - shown} restantes)</button>}
      {refAvg > 0 && <p className="mt-2 text-[11px] text-slate-400">«× ref» compara vistas por Reel con la cuenta de referencia. Revisa también las métricas propias de cada plataforma.</p>}
    </div>

    <EpisodeInsights title={activeEp} titles={episodeTitles} episode={selectedEpisode} metrics={selectedEpisodeMetrics} onSelect={setEp} />

    {unlinked.length > 0 && <section aria-labelledby="unlinked-title" className="rounded-2xl border border-[#FF9F1C]/25 bg-[#151C2B] p-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 id="unlinked-title" className="font-bold text-white">Pendientes de vincular</h3><p className="mt-1 text-xs text-slate-300">Revisa cada coincidencia antes de asociar la publicación a un episodio.</p></div><span className="rounded-full bg-[#FF9F1C]/15 px-2.5 py-1 text-xs font-bold text-[#FFCB84]">{unlinked.length}</span></div>
      {linkMsg && <p role="status" className="mt-3 rounded-lg border border-white/10 bg-white/5 p-2 text-xs text-slate-200">{linkMsg}</p>}
      <div className="mt-3 space-y-2">{unlinked.slice(0, shownUnlinked).map(m => { const suggestion = data.episodes.find(e => norm(e.title) === norm(m.episodeTitle)); const target = linkTarget[m.id] ?? suggestion?.id ?? ""; return <div key={m.id} className="flex flex-wrap items-end gap-3 rounded-xl border border-white/10 bg-black/15 p-3">
        <div className="min-w-44 flex-1"><p className="text-sm font-semibold text-white">{m.episodeTitle || "Sin título"}</p><p className="mt-1 text-xs text-slate-400">{m.platform} · {m.date || "sin fecha"}{suggestion ? ` · sugerencia: ${suggestion.title}` : ""}</p></div>
        <label className="min-w-44 flex-1 text-xs font-semibold text-slate-300">Episodio<select className="mt-1" value={target} onChange={e => setLinkTarget(prev => ({ ...prev, [m.id]: e.target.value }))}><option value="">Elegir episodio</option>{data.episodes.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}</select></label>
        <button type="button" disabled={!target} onClick={() => linkEpisode(m)} className="rounded-xl border border-[#FF9F1C]/50 px-3 py-2.5 text-xs font-bold text-[#FFCB84] hover:bg-[#FF9F1C]/10">Vincular</button>
      </div>; })}</div>
      {unlinked.length > shownUnlinked && <button type="button" onClick={() => setShownUnlinked(shownUnlinked + 10)} className="mt-3 rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/5">Ver {Math.min(10, unlinked.length - shownUnlinked)} pendientes más</button>}
      {!data.episodes.length && <p className="mt-3 text-xs text-slate-400">Crea un episodio en Creative Studio para poder vincular estas publicaciones.</p>}
    </section>}

    {/* Análisis complementario con los registros disponibles */}
    <details className="rounded-2xl border border-white/10 bg-[#151C2B] p-4 sm:p-5">
      <summary className="cursor-pointer font-bold text-white">Comparador 4B · mismo episodio</summary>
      {episodeTitles.length > 0 ? <>
        <p className="mt-2 text-xs text-slate-400">Cada tarjeta conserva las métricas propias de su plataforma. Si hay varias publicaciones, se muestra la más reciente.</p>
        <select className="mt-3 max-w-md" aria-label="Episodio a comparar" value={activeEp} onChange={e => setEp(e.target.value)}>{episodeTitles.map(e => <option key={e}>{e}</option>)}</select>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {PLATFORMS.map(p => { const matches = filtered.filter(x => x.episodeTitle === activeEp && x.platform === p).sort((a, b) => String(b.date).localeCompare(String(a.date))); const m = matches[0]; return <article key={p} className="rounded-xl border border-white/10 bg-black/20 p-4"><span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${pstyle(p).badge}`}>{p}</span>{m ? <div className="mt-2 space-y-1 text-sm"><p className="text-lg font-black">{m.views.toLocaleString()} <span className="text-xs font-normal text-slate-400">vistas acumuladas</span></p><p className="text-xs text-slate-400">Publicado {m.date || "sin fecha"}{matches.length > 1 ? ` · ${matches.length} publicaciones` : ""}</p>{platformCells(m).map((c, i) => <p key={i} className="text-xs text-amber-200">• {c}</p>)}<p className="text-xs text-slate-400">{m.interactions.toLocaleString()} interacciones</p></div> : <p className="mt-2 text-sm text-slate-400">Sin registros de este episodio</p>}</article>; })}
        </div>
      </> : <p className="mt-2 text-sm text-slate-400">Sin métricas todavía.</p>}
    </details>

    <details className="rounded-2xl border border-white/10 bg-[#151C2B] p-4 sm:p-5">
      <summary className="cursor-pointer font-bold text-white">Rankings por fórmula, gancho y duración</summary>
      <div className="mt-3 grid gap-3 md:grid-cols-3">{[["formula", "Fórmula"], ["hook", "Gancho"], ["duration", "Duración (s)"]].map(([k, label]) => { const r = rank(k); return <div key={k} className="rounded-xl bg-black/20 p-3"><b className="text-sm">{label}</b>{r.length ? r.map(([n, v]: any, i: number) => <p key={i} className="mt-1 text-xs"><span className="text-slate-500">{i + 1}.</span> {n} — <b>{fmt(Number(v))}</b> vistas</p>) : <p className="mt-1 text-xs text-slate-500">Sin datos (se rellena al enlazar Reels con episodios).</p>}</div>; })}</div>
    </details>

    <details className="rounded-2xl border border-white/10 bg-[#151C2B] p-4 sm:p-5">
      <summary className="cursor-pointer font-bold text-white">Tabla de publicaciones ({reels.length})</summary>
      <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[740px] text-sm"><thead><tr className="text-left text-slate-300"><th>Episodio</th><th>Cuenta</th><th>Publicación</th><th>Plataforma</th><th>Vistas</th><th>Prom.</th><th>Interacc.</th><th>Acciones</th></tr></thead>
        <tbody>{reels.slice(0, shown).map(m => <tr key={m.id} className="border-t border-slate-800"><td><div className="flex min-w-48 items-center gap-2"><div className={`h-10 w-8 shrink-0 overflow-hidden rounded bg-gradient-to-br ${pstyle(m.platform).bg}`}>{m.thumb && <img src={m.thumb} alt="" loading="lazy" className="h-full w-full object-cover" />}</div><span className="line-clamp-2" title={m.episodeTitle}>{m.episodeTitle || "Sin título"}</span></div></td><td className="max-w-[160px] truncate text-slate-300">{m.account}</td><td>{m.date || "—"}</td><td>{m.platform}</td><td>{m.views.toLocaleString()}</td><td>{m.avgWatch}s</td><td>{m.interactions}</td><td><details className="relative"><summary className="w-fit cursor-pointer list-none rounded-lg border border-white/15 px-2 py-1 text-xs text-slate-200" aria-label={`Acciones para ${m.episodeTitle || "publicación"}`}>Opciones</summary><div className="absolute right-0 z-10 mt-1 min-w-32 rounded-lg border border-white/15 bg-[#151C2B] p-1 shadow-xl"><button type="button" className="w-full rounded px-2 py-1.5 text-left text-xs text-rose-200 hover:bg-rose-500/15" onClick={() => { if (window.confirm("¿Eliminar esta métrica? Esta acción no se puede deshacer.")) remove("metrics", m.id); }}>Eliminar métrica</button></div></details></td></tr>)}</tbody></table></div>
      {reels.length > shown && <p className="mt-2 text-xs text-slate-400">Mostrando {shown} de {reels.length}. Usa «Ver más» en la biblioteca para cargar el resto.</p>}
    </details>

    <details className="rounded-2xl border border-white/10 bg-[#151C2B] p-4 sm:p-5">
      <summary className="cursor-pointer font-bold text-white">Registrar un video a mano · TikTok, YouTube y otros</summary>
      <form className="mt-3" onSubmit={submit}>
        <div className="grid gap-2 md:grid-cols-4">
            <label className="text-xs font-medium text-slate-300">Título del episodio<input className="mt-1" placeholder="Ej.: Episodio 2" value={f.episodeTitle} onChange={set("episodeTitle")} required /></label>
            <label className="text-xs font-medium text-slate-300">Plataforma<select className="mt-1" value={f.platform} onChange={set("platform")}>{PLATFORMS.map(p => <option key={p}>{p}</option>)}</select></label>
            <label className="text-xs font-medium text-slate-300">Fecha de publicación<input className="mt-1" type="date" value={f.date} onChange={set("date")} /></label>
            <label className="text-xs font-medium text-slate-300">Duración (s)<input className="mt-1" type="number" placeholder="Segundos" value={f.duration} onChange={set("duration")} /></label>
            <label className="text-xs font-medium text-slate-300">Vistas<input className="mt-1" type="number" placeholder="Vistas acumuladas" value={f.views} onChange={set("views")} /></label>
            <label className="text-xs font-medium text-slate-300">Promedio de reproducción (s)<input className="mt-1" type="number" placeholder="Segundos" value={f.avgWatch} onChange={set("avgWatch")} /></label>
            <label className="text-xs font-medium text-slate-300">Interacciones<input className="mt-1" type="number" placeholder="Total" value={f.interactions} onChange={set("interactions")} /></label>
            <label className="text-xs font-medium text-slate-300">Seguidores ganados<input className="mt-1" type="number" placeholder="Total" value={f.followers} onChange={set("followers")} /></label>
            <label className="text-xs font-medium text-slate-300">Fórmula usada<input className="mt-1" placeholder="Opcional" value={f.formula} onChange={set("formula")} /></label>
            <label className="text-xs font-medium text-slate-300">Gancho usado<input className="mt-1" placeholder="Opcional" value={f.hook} onChange={set("hook")} /></label>
        </div>
        <p className="mt-3 text-xs text-slate-400">Métricas según plataforma (rellena las de la plataforma elegida):</p>
        <div className="mt-1 grid gap-2 md:grid-cols-4">
            <label className="text-xs font-medium text-slate-300">Instagram · compartidos<input className="mt-1" type="number" placeholder="Total" value={f.shares} onChange={set("shares")} /></label>
            <label className="text-xs font-medium text-slate-300">Instagram · guardados<input className="mt-1" type="number" placeholder="Total" value={f.saves} onChange={set("saves")} /></label>
            <label className="text-xs font-medium text-slate-300">Facebook · vistas de 1 min<input className="mt-1" type="number" placeholder="Total" value={f.oneMinViews} onChange={set("oneMinViews")} /></label>
            <label className="text-xs font-medium text-slate-300">Facebook · ingresos estimados (US$)<input className="mt-1" type="number" step="0.01" placeholder="US$" value={f.estRevenue} onChange={set("estRevenue")} /></label>
            <label className="text-xs font-medium text-slate-300">TikTok · visto completo (%)<input className="mt-1" type="number" placeholder="Porcentaje" value={f.completion} onChange={set("completion")} /></label>
            <label className="text-xs font-medium text-slate-300">TikTok · desde búsquedas<input className="mt-1" type="number" placeholder="Total" value={f.searches} onChange={set("searches")} /></label>
            <label className="text-xs font-medium text-slate-300">Shorts · visto vs. deslizado (%)<input className="mt-1" type="number" placeholder="Porcentaje" value={f.viewedVsSwiped} onChange={set("viewedVsSwiped")} /></label>
            <label className="text-xs font-medium text-slate-300">Shorts · retención (%)<input className="mt-1" type="number" placeholder="Porcentaje" value={f.retention} onChange={set("retention")} /></label>
        </div>
        <button className="mt-3 rounded bg-amber-500 px-4 py-2 font-bold text-black">Guardar métrica</button>
      </form>
    </details>
  </section>;
}
