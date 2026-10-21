"use client";
import { useEffect, useState, type ReactNode } from "react";
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

const I = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px] shrink-0" aria-hidden="true">
    {d.split("|").map((p, i) => <path key={i} d={p} />)}
  </svg>
);
const ICONS: Record<string, ReactNode> = {
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
};

type Mod = { id: string; label: string; desc: string };
const GROUPS: { title: string; items: Mod[] }[] = [
  { title: "Crear", items: [
    { id: "generador", label: "Generador", desc: "Guion, prompts Seedance 2.5 y 4 versiones por plataforma" },
    { id: "dola", label: "Estudio Dola", desc: "Dola integrado al lado de tus prompts" },
    { id: "personajes", label: "Personajes", desc: "Fichas fijas, colores y pronunciaciones" },
    { id: "formulas", label: "Fórmulas", desc: "Estructuras virales probadas" },
  ]},
  { title: "Producir", items: [
    { id: "produccion", label: "Producción", desc: "Kanban, checklist por clip y costos" },
    { id: "calendario", label: "Calendario", desc: "Publicaciones por cuenta" },
  ]},
  { title: "Medir", items: [
    { id: "metricas", label: "Métricas", desc: "Rendimiento y comparación entre plataformas" },
    { id: "virales", label: "Analizador", desc: "Extrae la fórmula de videos virales" },
  ]},
  { title: "Vender", items: [
    { id: "dropshipping", label: "Dropshipping", desc: "Productos, ángulos, guiones y landing" },
  ]},
  { title: "Ajustes", items: [
    { id: "cuentas", label: "Cuentas", desc: "Tus perfiles en cada red" },
  ]},
];
const ALL = GROUPS.flatMap(g => g.items);
const MOBILE_TABS = ["generador", "personajes", "produccion", "metricas"];

function ModuleView({ id }: { id: string }) {
  switch (id) {
    case "cuentas": return <AccountsModule />;
    case "personajes": return <CharactersModule />;
    case "formulas": return <FormulasModule />;
    case "generador": return <GeneratorModule />;
    case "produccion": return <ProductionModule />;
    case "calendario": return <CalendarModule />;
    case "metricas": return <MetricsModule />;
    case "virales": return <ViralAnalyzerModule />;
    case "dola": return <DolaStudioModule />;
    default: return <DropshippingModule />;
  }
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 text-[13px] font-black text-black shadow-lg shadow-orange-900/40">EV</div>
      <div className="leading-tight">
        <p className="text-[15px] font-extrabold tracking-tight">Estudio Viral</p>
        <p className="text-[11px] text-slate-400">Microdramas con IA · RD</p>
      </div>
    </div>
  );
}

function DashboardInner() {
  const [active, setActive] = useState("generador");
  const [sheet, setSheet] = useState(false);
  // ?modulo=metricas abre directamente ese módulo (lo usa la vuelta de Facebook).
  useEffect(() => { const m = new URLSearchParams(window.location.search).get("modulo"); if (m && ALL.some(x => x.id === m)) setActive(m); }, []);
  const { error } = useData();
  const go = (id: string) => { setActive(id); setSheet(false); if (typeof window !== "undefined") window.scrollTo({ top: 0 }); };
  const current = ALL.find(m => m.id === active)!;

  return (
    <div className="min-h-screen md:flex">
      {/* Barra lateral (escritorio) */}
      <aside className="hidden md:flex md:w-64 shrink-0 flex-col border-r border-white/5 bg-[#0d1220]/80 backdrop-blur px-4 py-5 sticky top-0 h-screen">
        <Brand />
        <div className="mt-4"><SessionBar /></div>
        <nav className="mt-5 flex-1 overflow-y-auto space-y-5 pr-1">
          {GROUPS.map(g => (
            <div key={g.title}>
              <p className="px-3 text-[10px] font-semibold uppercase tracking-[.14em] text-slate-500">{g.title}</p>
              <div className="mt-1.5 space-y-0.5">
                {g.items.map(m => (
                  <button key={m.id} onClick={() => go(m.id)} aria-current={active === m.id}
                    className={`nav-item ${active === m.id ? "nav-item-active" : ""}`}>
                    {ICONS[m.id]}<span>{m.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <p className="mt-4 text-[11px] leading-relaxed text-slate-500">Regla 4B: primero la fórmula base de Instagram y después una versión distinta para cada plataforma.</p>
      </aside>

      {/* Encabezado (móvil) */}
      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-white/5 bg-[#0b0f19]/90 px-4 py-3 backdrop-blur">
        <Brand />
        <div className="shrink-0"><SessionBar compact /></div>
      </header>

      <main className="flex-1 min-w-0 px-4 pb-28 pt-5 md:px-8 md:pb-10 md:pt-8">
        <div className={`mx-auto w-full ${active === "dola" ? "max-w-[1600px]" : "max-w-6xl"}`}>
          <div className="mb-6 flex items-start gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/[.04] text-amber-300">{ICONS[current.id]}</div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-slate-500">{GROUPS.find(g => g.items.includes(current))?.title}</p>
              <p className="text-sm text-slate-400">{current.desc}</p>
            </div>
          </div>
          {error && <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
          <div key={active} className="module-enter"><ModuleView id={active} /></div>
        </div>
      </main>

      {/* Barra inferior (móvil) */}
      <nav className="md:hidden fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-white/10 bg-[#0d1220]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        {MOBILE_TABS.map(id => {
          const m = ALL.find(x => x.id === id)!;
          return (
            <button key={id} onClick={() => go(id)} className={`tab-item ${active === id ? "text-amber-300" : "text-slate-400"}`}>
              {ICONS[id]}<span>{m.label}</span>
            </button>
          );
        })}
        <button onClick={() => setSheet(true)} className={`tab-item ${!MOBILE_TABS.includes(active) ? "text-amber-300" : "text-slate-400"}`}>
          {ICONS.mas}<span>Más</span>
        </button>
      </nav>

      {/* Menú "Más" (móvil) */}
      {sheet && (
        <div className="md:hidden fixed inset-0 z-50" role="dialog" aria-modal="true">
          <button aria-label="Cerrar" className="absolute inset-0 bg-black/60" onClick={() => setSheet(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-3xl border-t border-white/10 bg-[#111827] p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" />
            <SessionBar />
            {GROUPS.map(g => (
              <div key={g.title} className="mt-4">
                <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-slate-500">{g.title}</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {g.items.map(m => (
                    <button key={m.id} onClick={() => go(m.id)}
                      className={`flex items-center gap-2 rounded-xl border px-3 py-3 text-left text-sm ${active === m.id ? "border-amber-400/50 bg-amber-400/10 text-amber-200" : "border-white/10 bg-white/[.03] text-slate-200"}`}>
                      {ICONS[m.id]}<span>{m.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  return <DataProvider><DashboardInner /></DataProvider>;
}
