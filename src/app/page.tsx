"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DataProvider, SessionBar, useData } from "@/lib/DataContext";
import AccountsModule from "@/components/AccountsModule";
import CharactersModule from "@/components/CharactersModule";
import FormulasModule from "@/components/FormulasModule";
import GeneratorModule from "@/components/GeneratorModule";
import ProductionModule from "@/components/ProductionModule";
import CalendarModule from "@/components/CalendarModule";
import MetricsModule from "@/components/MetricsModule";
import ViralAnalyzerModule from "@/components/ViralAnalyzerModule";
import DropshippingModule from "@/components/DropshippingModule";
import DolaStudioModule from "@/components/DolaStudioModule";

const I = (d: string, size = "h-[18px] w-[18px]") => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={size + " shrink-0"} aria-hidden="true">
    {d.split("|").map((p, i) => <path key={i} d={p} />)}
  </svg>
);
const ICONS: Record<string, ReactNode> = {
  inicio: I("M3 10.5 12 3l9 7.5V21H3z|M9 21v-7h6v7"),
  creative: I("M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4z|M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"),
  intelligence: I("M4 20V10|M10 20V4|M16 20v-7|M22 20H2"),
  publish: I("M5 6h14v14H5z|M5 10h14|M9 4v4|M15 4v4"),
  generador: I("M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4z|M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"),
  personajes: I("M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19|M10 10.5a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5z|M20 19v-1.5a3.5 3.5 0 0 0-2.5-3.35|M15.5 4.15a3.25 3.25 0 0 1 0 6.2"),
  formulas: I("M5 4h14v16H5z|M9 8h6|M9 12h6|M9 16h3"),
  produccion: I("M4 5h4v14H4z|M10 5h4v9h-4z|M16 5h4v6h-4z"),
  calendario: I("M5 6h14v14H5z|M5 10h14|M9 4v4|M15 4v4"),
  metricas: I("M4 20V10|M10 20V4|M16 20v-7|M22 20H2"),
  virales: I("M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z|M21 21l-5-5"),
  dropshipping: I("M6 7h12l-1 13H7z|M9 7a3 3 0 0 1 6 0"),
  cuentas: I("M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z|M4 21a8 8 0 0 1 16 0"),
  dola: I("M4 5h16v12H4z|M8 21h8|M12 17v4|M10 9l4 2-4 2z"),
  mas: I("M5 12h.01|M12 12h.01|M19 12h.01"),
  buscar: I("M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z|M21 21l-5-5"),
  flecha: I("M5 12h14|M13 6l6 6-6 6", "h-4 w-4"),
};

type Mod = { id: string; label: string; desc: string };
const MODULES: Record<string, Mod> = {
  inicio: { id: "inicio", label: "Inicio inteligente", desc: "Proyectos, producción y rendimiento en un solo lugar" },
  generador: { id: "generador", label: "Generador", desc: "Guion, prompts y versiones por plataforma" },
  dola: { id: "dola", label: "Estudio Dola", desc: "Prompts y herramienta de video" },
  personajes: { id: "personajes", label: "Personajes", desc: "Identidad visual y voces de cada serie" },
  formulas: { id: "formulas", label: "Fórmulas", desc: "Estructuras narrativas para reutilizar" },
  produccion: { id: "produccion", label: "Producción", desc: "Etapas, revisión de clips y costos" },
  metricas: { id: "metricas", label: "Métricas", desc: "Rendimiento real de tus publicaciones" },
  virales: { id: "virales", label: "Analizador", desc: "Analiza la estructura de un video" },
  calendario: { id: "calendario", label: "Calendario", desc: "Publicaciones planificadas por cuenta" },
  cuentas: { id: "cuentas", label: "Cuentas", desc: "Perfiles conectados a tu flujo de publicación" },
  dropshipping: { id: "dropshipping", label: "Dropshipping", desc: "Productos y pruebas comerciales" },
};
type Workspace = { id: string; title: string; short: string; desc: string; defaultModule: string; modules: string[] };
const WORKSPACES: Workspace[] = [
  { id: "inicio", title: "Inicio inteligente", short: "Inicio", desc: "Vista general del estudio", defaultModule: "inicio", modules: [] },
  { id: "creative", title: "Creative Studio", short: "Crear", desc: "Historias, personajes y producción", defaultModule: "generador", modules: ["generador", "dola", "personajes", "formulas", "produccion"] },
  { id: "intelligence", title: "Intelligence Hub", short: "Medir", desc: "Métricas y análisis", defaultModule: "metricas", modules: ["metricas", "virales"] },
  { id: "publish", title: "Publish & Grow", short: "Publicar", desc: "Calendario y cuentas", defaultModule: "calendario", modules: ["calendario", "cuentas"] },
];
const ALL_IDS = Object.keys(MODULES);
const workspaceOf = (id: string) => WORKSPACES.find(w => w.id === "inicio" && id === "inicio" || w.modules.includes(id))?.id || "dropshipping";
const normalize = (value: string) => value.toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
const formatNumber = (value: number) => new Intl.NumberFormat("es-DO").format(value);
type SearchResult = { key: string; id: string; kind: string; title: string; detail: string; module: string; preferredTab?: "mesa" };

function ModuleView({ id, focus, onOpenEpisode }: { id: string; focus: SearchResult | null; onOpenEpisode: (episodeId: string) => void }) {
  switch (id) {
    case "inicio": return <HomeModule />;
    case "cuentas": return <AccountsModule />;
    case "personajes": return <CharactersModule focusCharacterId={focus?.kind === "Personaje" ? focus.id : undefined} />;
    case "formulas": return <FormulasModule />;
    case "generador": return <GeneratorModule focusEpisodeId={focus?.kind === "Episodio" ? focus.id : undefined} focusTab={focus?.preferredTab} />;
    case "produccion": return <ProductionModule onOpenEpisode={onOpenEpisode} />;
    case "calendario": return <CalendarModule focusEntryId={focus?.kind === "Publicación programada" ? focus.id : undefined} />;
    case "metricas": return <MetricsModule focusMetricId={focus?.kind === "Publicación medida" ? focus.id : undefined} />;
    case "virales": return <ViralAnalyzerModule />;
    case "dola": return <DolaStudioModule />;
    default: return <DropshippingModule />;
  }
}

function Brand({ onClick }: { onClick: () => void }) {
  return <button onClick={onClick} className="studio-brand" aria-label="Ir a Inicio inteligente">
    <span className="studio-brand-mark" aria-hidden="true"><span>EV</span></span>
    <span className="min-w-0 text-left">
      <span className="block text-[15px] font-extrabold tracking-tight text-white">Estudio Viral</span>
      <span className="block text-[10px] font-semibold uppercase tracking-[.16em] text-[#9eacc3]">Creative Intelligence</span>
    </span>
  </button>;
}

function HomeModule() {
  const { data } = useData();
  const latest = [...data.episodes].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))).slice(0, 4);
  const pending = data.productionCards.filter(c => c.stage !== "Publicado");
  const today = new Date();
  const todayKey = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, "0"), String(today.getDate()).padStart(2, "0")].join("-");
  const scheduled = data.calendarEntries.filter(e => e.date >= todayKey).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4);
  const totalViews = data.metrics.reduce((sum, item) => sum + (Number(item.views) || 0), 0);
  const facts = [
    { label: "Series", value: formatNumber(data.series.length), caption: "Guardadas" },
    { label: "Episodios", value: formatNumber(data.episodes.length), caption: "En la biblioteca" },
    { label: "En producción", value: formatNumber(pending.length), caption: "Tarjetas pendientes" },
    { label: "Visualizaciones", value: data.metrics.length ? formatNumber(totalViews) : "—", caption: data.metrics.length ? "De publicaciones medidas" : "Sin métricas cargadas" },
  ];
  return <section className="space-y-6" aria-labelledby="home-title">
    <div className="studio-hero">
      <div className="relative z-10 max-w-2xl">
        <p className="studio-eyebrow text-[#ffbf65]">CENTRO DEL ESTUDIO</p>
        <h1 id="home-title" className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Tu estudio, en contexto.</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-[#b7c3d5]">Revisa lo que estás produciendo, las próximas publicaciones y el rendimiento disponible antes de dar el siguiente paso.</p>
      </div>
      <span className="studio-hero-orbit" aria-hidden="true" />
    </div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {facts.map(f => <div key={f.label} className="studio-panel p-4 sm:p-5">
        <p className="studio-eyebrow">{f.label}</p>
        <p className="mt-3 text-3xl font-extrabold tracking-tight text-white">{f.value}</p>
        <p className="mt-1 text-xs text-[#aab8cc]">{f.caption}</p>
      </div>)}
    </div>
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="studio-panel p-5">
        <div className="flex items-start justify-between gap-3">
          <div><p className="studio-eyebrow">CREATIVE STUDIO</p><h2 className="mt-1 text-lg font-bold text-white">Episodios recientes</h2></div>
          <span className="text-xs text-[#aab8cc]">{data.episodes.length} en total</span>
        </div>
        {latest.length ? <ul className="mt-4 divide-y divide-white/[.08]">{latest.map(ep => <li key={ep.id} className="flex items-center justify-between gap-3 py-3">
          <div className="min-w-0"><p className="truncate text-sm font-semibold text-white">{ep.title}</p><p className="text-xs text-[#aab8cc]">{ep.status || "Sin estado"}{ep.createdAt ? " · " + ep.createdAt.slice(0, 10) : ""}</p></div>
          <span className="shrink-0 rounded-full border border-white/10 px-2 py-1 text-[11px] text-[#d4deed]">{ep.duration ? ep.duration + " s" : "Episodio"}</span>
        </li>)}</ul> : <p className="mt-4 rounded-xl border border-dashed border-white/10 p-4 text-sm text-[#aab8cc]">Todavía no hay episodios guardados.</p>}
      </div>
      <div className="studio-panel p-5">
        <div><p className="studio-eyebrow">PUBLISH & GROW</p><h2 className="mt-1 text-lg font-bold text-white">Próximas publicaciones</h2></div>
        {scheduled.length ? <ul className="mt-4 divide-y divide-white/[.08]">{scheduled.map(entry => <li key={entry.id} className="flex items-center justify-between gap-3 py-3">
          <div className="min-w-0"><p className="truncate text-sm font-semibold text-white">{entry.title}</p><p className="text-xs text-[#aab8cc]">{entry.platform || "Plataforma sin asignar"}</p></div>
          <span className="shrink-0 text-xs text-[#d4deed]">{entry.date}</span>
        </li>)}</ul> : <p className="mt-4 rounded-xl border border-dashed border-white/10 p-4 text-sm text-[#aab8cc]">No hay publicaciones próximas en el calendario.</p>}
      </div>
    </div>
  </section>;
}

function nextAction(id: string): { label: string; module: string } | null {
  if (id === "inicio") return { label: "Crear episodio", module: "generador" };
  if (id === "generador") return { label: "Nueva producción", module: "produccion" };
  if (["dola", "personajes", "formulas", "produccion"].includes(id)) return { label: "Crear episodio", module: "generador" };
  if (id === "metricas") return { label: "Analizar viral", module: "virales" };
  if (id === "virales") return { label: "Ver métricas", module: "metricas" };
  if (id === "calendario") return { label: "Gestionar cuentas", module: "cuentas" };
  if (id === "cuentas") return { label: "Programar publicación", module: "calendario" };
  return null;
}

function DashboardInner() {
  const [active, setActive] = useState("inicio");
  const [sheet, setSheet] = useState(false);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null);
  const [focusVersion, setFocusVersion] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const sheetTriggerRef = useRef<HTMLButtonElement>(null);
  const sheetPanelRef = useRef<HTMLDivElement>(null);
  const { data, error } = useData();

  // La vuelta de OAuth de Meta usa ?modulo=metricas; se conservan todos los IDs anteriores.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("modulo");
    if (id && ALL_IDS.includes(id)) setActive(id);
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
        setSearchOpen(true);
      }
      if (event.key === "Escape") { setSearchOpen(false); setSheet(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (!sheet) return;
    const panel = sheetPanelRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const getFocusable = () => Array.from(panel?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') || []);
    (panel?.querySelector<HTMLElement>("[data-sheet-close]") || getFocusable()[0] || panel)?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const focusable = getFocusable();
      if (!focusable.length) { event.preventDefault(); panel?.focus(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !panel?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !panel?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    const closeOnDesktop = () => { if (window.innerWidth >= 768) setSheet(false); };
    window.addEventListener("keydown", trapFocus);
    window.addEventListener("resize", closeOnDesktop);
    return () => {
      window.removeEventListener("keydown", trapFocus);
      window.removeEventListener("resize", closeOnDesktop);
      document.body.style.overflow = previousOverflow;
      sheetTriggerRef.current?.focus({ preventScroll: true });
    };
  }, [sheet]);

  const index = useMemo<SearchResult[]>(() => [
    ...data.characters.map(ch => ({
      key: "character-" + ch.id, id: ch.id, kind: "Personaje", title: ch.name,
      detail: data.series.find(s => s.id === ch.seriesId)?.title || "Ficha de personaje", module: "personajes",
    })),
    ...data.episodes.map(ep => ({
      key: "episode-" + ep.id, id: ep.id, kind: "Episodio", title: ep.title,
      detail: ep.status || data.series.find(s => s.id === ep.seriesId)?.title || "Episodio guardado", module: "generador",
    })),
    ...data.calendarEntries.map(entry => ({
      key: "calendar-" + entry.id, id: entry.id, kind: "Publicación programada", title: entry.title,
      detail: [entry.platform, entry.date].filter(Boolean).join(" · "), module: "calendario",
    })),
    ...data.metrics.map(m => ({
      key: "metric-" + m.id, id: m.id, kind: "Publicación medida", title: m.episodeTitle || "Sin título",
      detail: [m.platform, m.date, formatNumber(m.views || 0) + " vistas"].filter(Boolean).join(" · "), module: "metricas",
    })),
  ], [data.characters, data.episodes, data.calendarEntries, data.metrics, data.series]);
  const results = useMemo(() => {
    const q = normalize(query);
    return q ? index.filter(item => normalize(item.title + " " + item.detail + " " + item.kind).includes(q)).slice(0, 8) : [];
  }, [index, query]);

  const go = (id: string) => {
    if (!ALL_IDS.includes(id)) return;
    setActive(id);
    setSheet(false);
    setSearchOpen(false);
    setQuery("");
    setSelectedResult(null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const chooseResult = (result: SearchResult) => {
    go(result.module);
    setSelectedResult(result);
    setFocusVersion(version => version + 1);
  };
  const openProductionEpisode = (episodeId: string) => {
    const episode = data.episodes.find(item => item.id === episodeId);
    if (episode) chooseResult({ key: `scene-${episode.id}`, id: episode.id, kind: "Episodio", title: episode.title, detail: "Mesa de escenas", module: "generador", preferredTab: "mesa" });
  };
  const current = MODULES[active] || MODULES.inicio;
  const workspaceId = workspaceOf(active);
  const workspace = WORKSPACES.find(w => w.id === workspaceId);
  const action = nextAction(active);
  const activeModules = workspace?.modules || [];

  return <div className="studio-shell min-h-screen md:flex">
    <aside className="studio-sidebar hidden md:flex md:w-[264px] xl:w-[280px] shrink-0 flex-col sticky top-0 h-screen" aria-label="Navegación principal">
      <div className="px-5 pb-5 pt-6"><Brand onClick={() => go("inicio")} /></div>
      <div className="px-3">
        <p className="studio-eyebrow px-3 pb-2">ESPACIOS DE TRABAJO</p>
        <nav aria-label="Espacios de trabajo" className="space-y-1">
          {WORKSPACES.map(w => <div key={w.id}>
            <button onClick={() => go(w.defaultModule)} aria-current={workspaceId === w.id ? "page" : undefined} className={"studio-workspace-button " + (workspaceId === w.id ? "studio-workspace-active" : "")}>
              <span className="studio-workspace-icon">{ICONS[w.id]}</span>
              <span className="min-w-0 flex-1 text-left"><span className="block text-sm font-semibold">{w.title}</span><span className="block truncate text-[11px] text-[#99a9bf]">{w.desc}</span></span>
            </button>
            {workspaceId === w.id && w.modules.length > 0 && <div className="studio-subnav" aria-label={"Módulos de " + w.title}>
              {w.modules.map(id => <button key={id} onClick={() => go(id)} aria-current={active === id ? "page" : undefined} className={"studio-subnav-button " + (active === id ? "studio-subnav-active" : "")}>{ICONS[id]}<span>{MODULES[id].label}</span></button>)}
            </div>}
          </div>)}
        </nav>
      </div>
      <div className="mt-auto px-3 pb-5 pt-5">
        <div className="border-t border-white/[.08] pt-4">
          <p className="studio-eyebrow px-3 pb-2">ESPACIO INDEPENDIENTE</p>
          <button onClick={() => go("dropshipping")} aria-current={active === "dropshipping" ? "page" : undefined} className={"studio-workspace-button " + (active === "dropshipping" ? "studio-workspace-active" : "")}>
            <span className="studio-workspace-icon">{ICONS.dropshipping}</span><span className="text-sm font-semibold">Dropshipping</span>
          </button>
        </div>
        <div className="mt-4 px-2"><SessionBar /></div>
      </div>
    </aside>

    <div className="min-w-0 flex-1">
      <header className="studio-topbar sticky top-0 z-30">
        <div className="studio-mobile-brand md:hidden"><Brand onClick={() => go("inicio")} /></div>
        <div className="hidden min-w-0 lg:block">
          <p className="studio-eyebrow">{workspace?.title || "ESPACIO INDEPENDIENTE"}</p>
          <p className="truncate text-sm font-semibold text-white">{current.label}</p>
        </div>
        <div className="studio-search-wrap">
          <form role="search" onSubmit={event => { event.preventDefault(); if (results[0]) chooseResult(results[0]); }} className="studio-search-form">
            <span className="text-[#98a9bf]">{ICONS.buscar}</span>
            <label htmlFor="studio-global-search" className="sr-only">Buscar personajes, episodios y publicaciones</label>
            <input id="studio-global-search" ref={searchRef} type="search" value={query} onChange={event => { setQuery(event.target.value); setSearchOpen(true); }} onFocus={() => setSearchOpen(true)} placeholder="Buscar personajes, episodios, publicaciones…" autoComplete="off" aria-controls="studio-search-results" aria-expanded={searchOpen && !!query} />
            <kbd className="studio-shortcut hidden xl:inline-flex">Ctrl K</kbd>
          </form>
          {searchOpen && query.trim() && <div id="studio-search-results" className="studio-search-results" aria-label="Resultados de búsqueda">
            <p className="studio-eyebrow px-3 pb-2">RESULTADOS EN TU ESTUDIO</p>
            {results.length ? <ul className="space-y-1">{results.map(result => <li key={result.key}><button type="button" onClick={() => chooseResult(result)} className="studio-search-result">
              <span className="min-w-0 flex-1 text-left"><span className="block truncate text-sm font-semibold text-white">{result.title}</span><span className="block truncate text-xs text-[#a9b8cc]">{result.detail}</span></span>
              <span className="shrink-0 rounded-full border border-white/10 px-2 py-1 text-[10px] text-[#cbd7e7]">{result.kind}</span>
            </button></li>)}</ul> : <p className="px-3 py-3 text-sm text-[#b6c3d5]">Sin resultados en tus datos guardados.</p>}
          </div>}
        </div>
        {action && <button onClick={() => go(action.module)} className="studio-primary-action"><span>{action.label}</span>{ICONS.flecha}</button>}
      </header>

      <main id="main-content" className="px-4 pb-28 pt-6 sm:px-6 md:pb-12 md:pt-8 xl:px-10">
        <div className={"mx-auto w-full " + (active === "dola" ? "max-w-[1600px]" : "max-w-[1380px]")}>
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="studio-heading-icon">{ICONS[workspaceId] || ICONS.dropshipping}</div>
              <div className="min-w-0">
                <p className="studio-eyebrow">{workspace?.title && workspace.title.toLowerCase() === current.label.toLowerCase() ? current.label : `${workspace?.title || "ESPACIO INDEPENDIENTE"} / ${current.label}`}</p>
                <p className="mt-1 text-sm text-[#b8c5d7]">{current.desc}</p>
              </div>
            </div>
            <div className="md:hidden"><SessionBar compact /></div>
          </div>
          {activeModules.length > 0 && <nav className="studio-mobile-subnav md:hidden" aria-label={"Módulos de " + workspace?.title}>
            {activeModules.map(id => <button key={id} onClick={() => go(id)} aria-current={active === id ? "page" : undefined} className={active === id ? "is-active" : ""}>{MODULES[id].label}</button>)}
          </nav>}
          {selectedResult && <div role="status" className="mb-5 flex items-start gap-3 rounded-xl border border-[#598BFF]/30 bg-[#598BFF]/10 p-3 text-sm">
            <span className="min-w-0 flex-1"><strong className="block text-white">{selectedResult.title}</strong><span className="text-[#c3d0e2]">{selectedResult.kind} · {selectedResult.detail}</span></span>
            <button onClick={() => setSelectedResult(null)} aria-label="Cerrar resultado de búsqueda" className="rounded-md px-2 text-[#c3d0e2] hover:text-white">✕</button>
          </div>}
          {error && <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
          <div key={`${active}-${focusVersion}`} className="module-enter"><ModuleView id={active} focus={selectedResult} onOpenEpisode={openProductionEpisode} /></div>
        </div>
      </main>
    </div>

    <nav className="studio-mobile-nav md:hidden" aria-label="Espacios de trabajo">
      {WORKSPACES.map(w => <button key={w.id} onClick={() => go(w.defaultModule)} aria-current={workspaceId === w.id ? "page" : undefined} className={workspaceId === w.id ? "is-active" : ""}>{ICONS[w.id]}<span>{w.short}</span></button>)}
      <button ref={sheetTriggerRef} onClick={() => setSheet(true)} aria-haspopup="dialog" aria-expanded={sheet} className={active === "dropshipping" ? "is-active" : ""}>{ICONS.mas}<span>Más</span></button>
    </nav>

    {sheet && <div className="studio-sheet-backdrop md:hidden" role="dialog" aria-modal="true" aria-label="Todos los módulos">
      <button className="absolute inset-0 w-full bg-black/70" aria-label="Cerrar menú" onClick={() => setSheet(false)} />
      <div ref={sheetPanelRef} tabIndex={-1} className="studio-sheet relative mt-auto max-h-[85vh] overflow-y-auto p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold text-white">Todos los módulos</h2><button data-sheet-close="" onClick={() => setSheet(false)} aria-label="Cerrar menú" className="rounded-lg border border-white/10 px-3 py-1.5 text-[#d4deed]">✕</button></div>
        {WORKSPACES.filter(w => w.modules.length).map(w => <div key={w.id} className="mt-5">
          <p className="studio-eyebrow">{w.title}</p>
          <div className="mt-2 grid grid-cols-2 gap-2">{w.modules.map(id => <button key={id} onClick={() => go(id)} className="studio-sheet-item">{ICONS[id]}<span>{MODULES[id].label}</span></button>)}</div>
        </div>)}
        <div className="mt-5 border-t border-white/10 pt-4"><p className="studio-eyebrow">ESPACIO INDEPENDIENTE</p><button onClick={() => go("dropshipping")} className="studio-sheet-item mt-2 w-full">{ICONS.dropshipping}<span>Dropshipping</span></button></div>
      </div>
    </div>}
  </div>;
}

export default function Dashboard() {
  return <DataProvider><DashboardInner /></DataProvider>;
}
