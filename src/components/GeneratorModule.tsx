"use client";
import { useMemo, useState } from "react";
import { DolaButton } from "./CopyButton";
import CopyButton, { DownloadJson } from "./CopyButton";
import PlatformAdaptations, { BaseFormulaCard } from "./PlatformAdaptations";
import AiAuthNotice from "./AiAuthNotice";
import { useData } from "@/lib/DataContext";
import { postApi, isAuthError } from "@/lib/api-client";
import { templateEpisode } from "@/lib/llm";

export default function GeneratorModule(){
  const { data, insert, remove, mode } = useData();
  const accounts = data.accounts; const allSeries = data.series; const formulas = data.formulas; const allCharacters = data.characters;
  const [accountId, setAccountId] = useState("");
  const [seriesId, setSeriesId] = useState("");
  const [formulaId, setFormulaId] = useState("");
  const [selectedChars, setSelectedChars] = useState<string[]>([]);
  const [theme, setTheme] = useState("Manguito descubre que Doña Aguacate le oculta una herencia");
  const [duration, setDuration] = useState(90);
  const [prev, setPrev] = useState("");
  const [part, setPart] = useState(1);
  const [out, setOut] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState(false);
  const [notice, setNotice] = useState("");

  const series = allSeries.find(s => s.id === seriesId) || allSeries[0];
  const seriesCharacters = useMemo(() => series ? allCharacters.filter(c => c.seriesId === series.id) : allCharacters, [allCharacters, series]);
  const characters = selectedChars.length ? allCharacters.filter(c => selectedChars.includes(c.id)) : seriesCharacters;
  const formula = formulas.find(f => f.id === formulaId) || formulas[0];
  const account = accounts.find(a => a.id === accountId) || accounts[0];

  function buildInput(){
    return { theme, duration, previousSummary: prev, partNumber: part, seriesTitle: series?.title || "Manguito y Doña Aguacate", account, series, characters, formula };
  }
  async function persistEpisode(dataOut: any){
    const adaptations = dataOut.platformAdaptations || dataOut.platform_adaptations || [];
    const normalized = { ...dataOut, platformAdaptations: adaptations, platform_adaptations: adaptations };
    await insert("episodes", {
      title: theme, theme, duration, status: "Guion", previousSummary: prev,
      accountId: account?.id, seriesId: series?.id, formulaId: formula?.id,
      createdAt: new Date().toISOString(), versions: [normalized], output: normalized,
      platformAdaptations: adaptations, platform_adaptations: adaptations,
    });
    return normalized;
  }
  async function applyResult(dataOut: any, note: string){
    const normalized = await persistEpisode(dataOut);
    setOut(normalized); setNotice(note);
  }
  async function genLocal(){
    setAuthError(false);
    await applyResult(templateEpisode(buildInput()), "Generado con plantilla local en el cliente (sin IA). La API protegida /api/generate requiere iniciar sesión.");
  }
  async function gen(){
    setLoading(true); setAuthError(false); setNotice("");
    try {
      if (mode !== "supabase") { await genLocal(); return; }
      const r = await postApi("/api/generate", buildInput());
      if (isAuthError(r)) { setAuthError(true); return; }
      if (!r.json?.ok) { setNotice("Error de la API: " + (r.json?.error || ("HTTP " + r.status)) + " — puedes usar la plantilla local."); return; }
      await applyResult(r.json.data, r.json.data?.mode === "plantilla-local" ? "Generado con plantilla local del servidor (sin LLM_API_KEY) y guardado en Supabase." : "Generado con IA y guardado en Supabase (tabla episodes).");
    } finally { setLoading(false); }
  }
  function toggleChar(id: string){
    setSelectedChars(prevSel => prevSel.includes(id) ? prevSel.filter(x => x !== id) : [...prevSel, id]);
  }
  function loadEpisode(ep: any){
    if (ep.output) { setOut({ ...ep.output, platformAdaptations: ep.platformAdaptations || ep.output.platformAdaptations || [] }); setTheme(ep.theme || ep.title); setDuration(ep.duration || 90); }
  }

  return <section>
    <h2 className="text-xl font-bold">Generador de episodios</h2>
    <div className="mt-4"><BaseFormulaCard/></div>

    <div className="grid gap-2 md:grid-cols-3 mt-4">
      <select value={account?.id || ""} onChange={e => setAccountId(e.target.value)}><option value="">Cuenta…</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.platform})</option>)}</select>
      <select value={series?.id || ""} onChange={e => { setSeriesId(e.target.value); setSelectedChars([]); }}><option value="">Serie…</option>{allSeries.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select>
      <select value={formula?.id || ""} onChange={e => setFormulaId(e.target.value)}><option value="">Fórmula…</option>{formulas.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
    </div>
    <div className="mt-3 rounded bg-[#121826] p-3">
      <p className="text-xs text-slate-400 mb-2">Personajes (si no marcas ninguno, se usan todos los de la serie):</p>
      <div className="flex flex-wrap gap-2">
        {seriesCharacters.map(c => <label key={c.id} className="flex items-center gap-1 text-sm rounded bg-slate-800 px-2 py-1">
          <input type="checkbox" className="w-auto" checked={selectedChars.includes(c.id)} onChange={() => toggleChar(c.id)}/> {c.name}
        </label>)}
        {seriesCharacters.length === 0 && <span className="text-xs text-slate-500">Sin personajes en esta serie.</span>}
      </div>
    </div>
    <div className="grid gap-2 md:grid-cols-4 mt-3">
      <input value={theme} onChange={e => setTheme(e.target.value)} placeholder="Tema"/>
      <select value={duration} onChange={e => setDuration(Number(e.target.value))}><option value={30}>30s</option><option value={60}>60s</option><option value={90}>90s</option><option value={120}>2 min</option><option value={180}>3 min</option></select>
      <input value={prev} onChange={e => setPrev(e.target.value)} placeholder="Resumen episodio anterior (activa Anteriormente... en TikTok)"/>
      <input type="number" min={1} value={part} onChange={e => setPart(Number(e.target.value))} placeholder="N.º de parte"/>
    </div>
    <button disabled={loading} onClick={gen} className="mt-3 rounded bg-amber-500 text-black font-bold px-5 py-2">{loading ? "Generando..." : "Generar episodio + 4 fichas ✨"}</button>
    {mode !== "supabase" && <p className="text-xs text-amber-200 mt-2">Modo sin login: el generador usa la plantilla local en tu navegador y guarda el episodio en localStorage. La IA de /api/generate requiere iniciar sesión.</p>}
    {authError && <AiAuthNotice onLocalTemplate={genLocal}/>}
    {notice && <p className="text-xs text-emerald-300 mt-2">{notice}</p>}

    {out && <div className="mt-5 space-y-4">
      <div className="rounded bg-[#121826] p-4"><h3 className="font-bold">a) Guion por bloques de 15s (desde la FÓRMULA BASE)</h3>{(out.scriptBlocks || []).map((b: any, i: number) => <div key={i} className="text-sm mt-2 border-b border-slate-800 pb-2"><b>Bloque {b.block} · {b.time}</b> — {b.scene}<br/>{(b.dialogue || []).map((d: any, j: number) => <span key={j}>{d.speaker}: “{d.text}”<br/></span>)}</div>)}<CopyButton text={JSON.stringify(out.scriptBlocks, null, 2)}/></div>
      <div className="rounded bg-[#121826] p-4"><h3 className="font-bold">b) Prompts por bloque (Seedance 2.5) + Dola 60s</h3>{(out.prompts || []).map((p: string, i: number) => <details key={i} className="prompt-box" open={i===0}><summary><span>Bloque {i+1} · {i*15}-{(i+1)*15}s</span><CopyButton text={p}/></summary><p className="prompt-text">{p}</p></details>)}<details className="prompt-box" open><summary><span>Prompt Dola 60s</span><CopyButton text={out.dolaPrompt||""}/><DolaButton text={out.dolaPrompt||""}/></summary><p className="px-3 pb-1 text-[11px] text-amber-200/90">En Dola: activa la habilidad «Zehlas 1min», sube las fichas de los personajes en el orden en que aparecen arriba, pega el prompt y envía. Si Dola entrega 30 s, respóndele «continúa».</p><p className="prompt-text">{out.dolaPrompt}</p></details></div>
      <div className="rounded bg-[#121826] p-4"><h3 className="font-bold">c) Reglas de diálogo</h3><p className="text-sm">{out.dialogueRules}</p><CopyButton text={out.dialogueRules || ""}/><h3 className="font-bold mt-3">d) Gancho base / Portada base / Descripción base</h3><p className="text-sm">{(out.hook || []).join(" / ")}<br/>Portada: {out.coverText}<br/>{out.description}<br/>{(out.hashtags || []).join(" ")}</p><p className="text-xs text-slate-400">Ojo: este texto base NO se publica igual en todas partes — publica con la ficha 4B de cada plataforma (abajo).</p></div>
      <PlatformAdaptations adaptations={out.platformAdaptations || out.platform_adaptations || []}/>
      <div className="flex gap-2 flex-wrap"><DownloadJson data={out.guionJson || {}}/><DownloadJson data={out.platformAdaptations || out.platform_adaptations || []} filename="adaptaciones-plataformas.json"/></div>
      <p className="text-xs text-slate-500">Modo: {out.mode || "LLM"} · Episodio guardado {mode === "supabase" ? "en Supabase (tabla episodes, con platform_adaptations y versions)" : "en localStorage (episodes)"}.</p>
    </div>}

    <h3 className="font-bold mt-6">📚 Episodios guardados (historial de versiones)</h3>
    <div className="space-y-2 mt-2">
      {[...data.episodes].reverse().map(ep => <div key={ep.id} className="rounded bg-[#121826] p-3 flex flex-wrap items-center gap-2 text-sm">
        <b className="flex-1 min-w-[200px]">{ep.title}</b>
        <span className="text-xs text-slate-400">{ep.duration}s · {ep.status} · {(ep.versions || []).length} versión(es) · {(ep.platformAdaptations || ep.platform_adaptations || []).length} fichas 4B</span>
        <button className="rounded bg-slate-700 px-3 py-1 text-xs" onClick={() => loadEpisode(ep)}>Ver</button>
        <button className="text-red-400 text-xs" onClick={() => remove("episodes", ep.id)}>Eliminar</button>
      </div>)}
      {data.episodes.length === 0 && <p className="text-sm text-slate-400">Todavía no has generado episodios.</p>}
    </div>
  </section>;
}
