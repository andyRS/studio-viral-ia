"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import CopyButton, { DownloadJson, DolaButton } from "./CopyButton";
import PlatformAdaptations from "./PlatformAdaptations";
import AiAuthNotice from "./AiAuthNotice";
import { useData } from "@/lib/DataContext";
import { postApi, isAuthError } from "@/lib/api-client";
import { learnFromMetrics } from "@/lib/learning";
import { buildHookBank } from "@/lib/hooks";
import HookPicker from "./HookPicker";
import MontajePanel from "./MontajePanel";
import { STYLES, type StyleKey } from "@/lib/knowledge";
import { templateSeries, templateNext } from "@/lib/story";
import { isGenericName } from "@/lib/cast";
import { buildFlowBatch } from "@/lib/production";

type View = "inicio" | "nueva" | "continuar" | "resultado";

const IDEAS: Record<StyleKey, string[]> = {
  frutinovela: [
    "Un plátano motoconchista de Los Mina se enamora de la hija de una familia rica de cocos de Piantini",
    "La esposa descubre que su marido, que 'trabaja en Nueva York', vive en el mismo barrio con otra",
    "Un colmadero gana la lotería y todo el barrio aparece diciendo que es su familia",
  ],
  cristiana: [
    "Una hija se avergüenza de su madre vendedora de dulces hasta que la ve orar por ella en la iglesia",
    "Un padre que abandonó a sus hijos vuelve enfermo y pide perdón en Nochebuena",
    "Un joven se burla de la fe de su abuela hasta que una noche ella es la única que contesta su llamada",
  ],
  cine90: [
    "Una mujer encuentra en una tienda de antigüedades las cartas de amor que su madre nunca envió",
    "Un taxista lleva cada año, el mismo día, a la misma pasajera al malecón sin saber por qué",
    "Una cantante de boleros reconoce en primera fila al hombre que la dejó plantada en el altar",
  ],
};

export default function GeneratorModule({ focusEpisodeId }: { focusEpisodeId?: string } = {}) {
  const { data, insert, remove, mode } = useData();
  const focusedEpisodeRef = useRef<string | null>(null);
  const [view, setView] = useState<View>("inicio");
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState(false);
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<{ episode: any; seriesId: string; part: number } | null>(null);

  // Historia nueva
  const [idea, setIdea] = useState("");
  const [style, setStyleRaw] = useState<StyleKey>("frutinovela");
  // El estilo es obligatorio: hay que elegirlo antes de crear (no vale el valor por defecto).
  const [styleChosen, setStyleChosen] = useState(false);
  const setStyle = (k: StyleKey) => { setStyleRaw(k); setStyleChosen(true); };
  const [accountId, setAccountId] = useState("");
  const [duration, setDuration] = useState(90);
  const [notes, setNotes] = useState("");
  // Continuar
  const [seriesId, setSeriesId] = useState("");
  const [wish, setWish] = useState("");
  const [chosenHook, setChosenHook] = useState<string[] | null>(null);

  const episodesOf = (sid: string) => data.episodes.filter((e: any) => e.seriesId === sid).sort((a: any, b: any) => String(a.createdAt).localeCompare(String(b.createdAt)));
  const seriesList = useMemo(() => data.series.map((s: any) => {
    const eps = episodesOf(s.id); const last = eps[eps.length - 1];
    return { ...s, eps, last, style: (eps[0]?.output?.seriesBible?.style || "frutinovela") as StyleKey };
  }).sort((a: any, b: any) => String(b.last?.createdAt || "").localeCompare(String(a.last?.createdAt || ""))), [data.series, data.episodes]);
  const current = seriesList.find((s: any) => s.id === seriesId);
  const currentChars = data.characters.filter((c: any) => c.seriesId === seriesId);
  // Elenco completo de la serie: la ficha más reciente de cada personaje (con fruta, cabeza y voz)
  // sale de los episodios guardados; los que solo están en Personajes se añaden tal cual.
  const currentCast = useMemo(() => {
    const byName = new Map<string, any>();
    for (const c of currentChars) byName.set(String(c.name).toLowerCase(), { ...c });
    for (const e of current?.eps || []) for (const c of e.output?.cast || []) byName.set(String(c.name).toLowerCase(), { ...byName.get(String(c.name).toLowerCase()), ...c });
    return Array.from(byName.values());
  }, [currentChars, current]);
  const currentNeedsRepair = !!current && (currentCast.length < 2 || currentCast.some((c: any) =>
    isGenericName(c.name) || /edita su descripción|ropa característica/i.test(`${c.visualES || ""} ${c.clothing || ""}`) ||
    (current.style !== "cine90" && !c.fruit && !/cabeza/i.test(c.visualES || ""))
  ));
  const learnings = useMemo(() => learnFromMetrics(data.metrics)?.text, [data.metrics]);
  const bank = useMemo(() => buildHookBank(data.episodes, data.metrics), [data.episodes, data.metrics]);
  const bankTop = bank.slice(0, 10).map(h => ({ gancho: h.hook, vistas: h.views, plataformas: h.platforms }));
  const account = data.accounts.find((a: any) => a.id === accountId) || data.accounts[0];

  async function call(path: string, body: any, local: () => any) {
    // Sin sesión: plantilla local en el navegador (elenco de frutas y escenas completas, sin IA).
    if (mode !== "supabase") return { data: local(), note: "Modo sin sesión: borrador creado con la plantilla local y guardado en este navegador. Inicia sesión para que la IA escriba el guion." };
    const r = await postApi(path, body);
    if (isAuthError(r)) { setAuthError(true); return null; }
    if (!r.json?.ok) { setNotice(r.json?.error || "No se pudo generar el contenido. Inténtalo de nuevo."); return null; }
    const d = r.json.data;
    return { data: d, note: d?.notice || (d?.mode === "plantilla-local" ? "Borrador creado con la plantilla local." : "Elenco, escenas y guion creados con la IA. Revísalos antes de producir.") };
  }

  async function saveEpisode(sid: string, part: number, ep: any, bible?: any) {
    const output = { ...ep, partNumber: part, seriesBible: bible ?? ep.seriesBible };
    await insert("episodes", {
      title: ep.title || `Episodio ${part}`, theme: ep.summary || ep.title || "", duration: ep.duration || duration, status: "Guion",
      previousSummary: "", accountId: account?.id, seriesId: sid, createdAt: new Date().toISOString(),
      versions: [output], output, platformAdaptations: ep.platformAdaptations || [], platform_adaptations: ep.platformAdaptations || [],
    });
    return output;
  }

  async function createStory() {
    if (!styleChosen) { setNotice("Elige primero el estilo de la historia."); return; }
    if (!idea.trim()) { setNotice("Escribe la idea de la historia o elige una de las sugerencias."); return; }
    setLoading(true); setNotice(""); setAuthError(false);
    try {
      const body = { idea, style, duration, account, notes, learnings, chosenHook };
      const res = await call("/api/series", body, () => templateSeries(body)); if (!res) return;
      const d = res.data;
      const s = await insert("series", { title: d.series?.title || idea.slice(0, 60), description: d.series?.logline || idea, accountId: account?.id });
      for (const c of d.characters || []) await insert("characters", { ...c, seriesId: s.id });
      const bible = { style, logline: d.series?.logline, world: d.series?.world, tone: d.series?.tone };
      const out = await saveEpisode(s.id, 1, d.episode, bible);
      setSeriesId(s.id); setResult({ episode: out, seriesId: s.id, part: 1 }); setView("resultado"); setNotice(res.note); setChosenHook(null);
    } catch (error: any) { setNotice(`No se pudo guardar la historia: ${error?.message || String(error)}`); }
    finally { setLoading(false); }
  }

  async function continueStory() {
    if (!current) return;
    if (currentNeedsRepair) { setNotice("Esta serie conserva personajes de plantilla. Recréala con Gemini antes de continuar para no gastar una generación en un guion inutilizable."); return; }
    setLoading(true); setNotice(""); setAuthError(false);
    try {
      const eps = current.eps; const part = eps.length + 1;
      const bible = eps[0]?.output?.seriesBible || { style: "frutinovela", logline: current.description };
      const body = {
        series: { title: current.title, logline: current.description }, bible, style: bible.style, partNumber: part, wish, duration, account, learnings, chosenHook,
        characters: currentCast.map((c: any) => ({ name: c.name, role: c.role, fruit: c.fruit, fruitEmoji: c.fruitEmoji, headES: c.headES, visualES: c.visualES, visualEN: c.visualEN, clothing: c.clothing, voice: c.voice, subtitleColor: c.subtitleColor, speechStyle: c.speechStyle, pronunciations: c.pronunciations, flowPrompt: c.flowPrompt })),
        history: eps.map((e: any, i: number) => ({ part: i + 1, title: e.title, summary: e.output?.summary || e.theme })),
      };
      const res = await call("/api/next-episode", body, () => templateNext(body)); if (!res) return;
      for (const c of res.data.newCharacters || []) await insert("characters", { ...c, seriesId: current.id });
      const out = await saveEpisode(current.id, part, res.data.episode, bible);
      setResult({ episode: out, seriesId: current.id, part }); setView("resultado"); setWish(""); setChosenHook(null);
      setNotice([res.note, (res.data.newCharacters || []).length ? `Personajes nuevos añadidos: ${res.data.newCharacters.map((c: any) => c.name).join(", ")}.` : ""].filter(Boolean).join(" "));
    } catch (error: any) { setNotice(`No se pudo guardar el episodio: ${error?.message || String(error)}`); }
    finally { setLoading(false); }
  }

  function openEpisode(sid: string, ep: any, part: number) { setSeriesId(sid); setResult({ episode: ep.output || {}, seriesId: sid, part }); setView("resultado"); setNotice(""); }
  useEffect(() => {
    if (!focusEpisodeId) { focusedEpisodeRef.current = null; return; }
    if (focusedEpisodeRef.current === focusEpisodeId) return;
    const episode = data.episodes.find(ep => ep.id === focusEpisodeId);
    if (!episode) return;
    const siblings = data.episodes.filter(ep => ep.seriesId === episode.seriesId)
      .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
    const part = episode.output?.partNumber || siblings.findIndex(ep => ep.id === episode.id) + 1 || 1;
    openEpisode(episode.seriesId || "", episode, part);
    focusedEpisodeRef.current = focusEpisodeId;
  }, [focusEpisodeId, data.episodes]);

  const Back = ({ to = "inicio" as View }) => <button onClick={() => { setView(to); setNotice(""); setAuthError(false); setChosenHook(null); }} className="mb-4 text-sm text-slate-400 hover:text-white">← Volver</button>;

  return (
    <section>
      {view === "inicio" && <>
        <h2 className="text-xl font-bold">¿Qué quieres crear hoy?</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <button onClick={() => setView("nueva")} className="choice-card group">
            <span className="choice-icon bg-gradient-to-br from-amber-400 to-orange-600 text-black">✦</span>
            <span className="text-lg font-bold">Crear historia nueva</span>
            <span className="text-sm text-slate-400">Parte de tu idea para crear la serie, los personajes fijos y el episodio 1.</span>
          </button>
          <button onClick={() => setView("continuar")} disabled={!seriesList.length} className="choice-card group">
            <span className="choice-icon bg-violet-500/20 text-violet-200">▶</span>
            <span className="text-lg font-bold">Continuar una serie</span>
            <span className="text-sm text-slate-400">{seriesList.length ? "Elige una serie y prepara el siguiente episodio con sus personajes." : "Aún no tienes series. Crea la primera."}</span>
          </button>
        </div>
        {!!bank.length && <>
          <h3 className="mt-8 text-sm font-semibold uppercase tracking-wider text-slate-400">🎣 Banco de ganchos</h3>
          <div className="mt-3 overflow-x-auto rounded-xl bg-[#121826]"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-slate-400"><th className="p-2">Gancho</th><th className="p-2">Episodio</th><th className="p-2">Vistas</th><th className="p-2">Plataformas</th></tr></thead>
            <tbody>{bank.slice(0, 12).map((h, i) => <tr key={i} className="border-t border-slate-800"><td className="p-2 font-medium">{h.hook}</td><td className="p-2 text-slate-400">{h.source}</td><td className="p-2">{h.views ? h.views.toLocaleString() : <span className="text-slate-500">sin métricas</span>}</td><td className="p-2 text-xs text-slate-400">{h.platforms.join(", ") || "—"}</td></tr>)}</tbody></table></div>
          <p className="mt-1 text-xs text-slate-500">Registra las vistas en Métricas con el mismo título del episodio para revisar qué ganchos rindieron más.</p>
        </>}
        {!!seriesList.length && <>
          <h3 className="mt-8 text-sm font-semibold uppercase tracking-wider text-slate-400">Tus series</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {seriesList.map((s: any) => (
              <div key={s.id} className="rounded-xl bg-[#121826] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-300/80">{STYLES[s.style as StyleKey]?.label || "Serie"}</p>
                <p className="mt-1 font-bold">{s.title}</p>
                <p className="mt-1 line-clamp-2 text-sm text-slate-400">{s.last?.output?.summary || s.description}</p>
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-xs text-slate-500">{s.eps.length} episodio(s)</span>
                  <button onClick={() => { setSeriesId(s.id); setView("continuar"); }} className="ml-auto rounded bg-amber-500 px-3 py-1.5 text-xs font-bold">Continuar</button>
                </div>
              </div>
            ))}
          </div>
        </>}
      </>}

      {view === "nueva" && <>
        <Back />
        <h2 className="text-xl font-bold">Historia nueva</h2>
        <div className="mt-4 space-y-4">
          <fieldset>
            <legend className="field-label">Estilo <span className="normal-case tracking-normal text-amber-300">· obligatorio{styleChosen ? "" : ": elige uno"}</span></legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {(Object.keys(STYLES) as StyleKey[]).map(k => (
                <button key={k} type="button" aria-pressed={styleChosen && style === k} onClick={() => setStyle(k)} className={`rounded-xl border px-3 py-3 text-left text-sm ${styleChosen && style === k ? "border-amber-400/60 bg-amber-400/10 text-amber-100" : "border-white/10 bg-white/[.03] text-slate-300"}`}>{STYLES[k].label}</button>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor="generator-idea" className="field-label block">Idea de la historia</label>
            <textarea id="generator-idea" value={idea} onChange={e => setIdea(e.target.value)} placeholder="Ej.: Una madre humilde descubre que su hijo rico la niega delante de sus amigos…" />
            <div className="mt-2 flex flex-wrap gap-2">
              {IDEAS[style].map(t => <button key={t} onClick={() => setIdea(t)} className="rounded-full border border-white/10 bg-white/[.03] px-3 py-1.5 text-left text-xs text-slate-300 hover:bg-white/10">💡 {t}</button>)}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label htmlFor="generator-account" className="field-label block">Cuenta principal</label>
              <select id="generator-account" value={account?.id || ""} onChange={e => setAccountId(e.target.value)}>{data.accounts.map((a: any) => <option key={a.id} value={a.id}>{a.name} · {a.platform}</option>)}</select></div>
            <div><label htmlFor="generator-duration" className="field-label block">Duración</label>
              <select id="generator-duration" value={duration} onChange={e => setDuration(Number(e.target.value))}><option value={45}>45 s</option><option value={60}>1 min</option><option value={90}>1 min 30</option><option value={120}>2 min</option><option value={180}>3 min</option></select></div>
          </div>
          <div><label htmlFor="generator-notes" className="field-label block">Notas opcionales</label>
            <input id="generator-notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ej.: que la abuela se llame Doña Guanábana, que pase en Navidad…" /></div>
          <HookPicker online={mode === "supabase"} chosen={chosenHook} onChoose={setChosenHook} body={() => ({ idea, style, learnings, bank: bankTop })} />
          <button disabled={loading} onClick={createStory} className="w-full rounded bg-amber-500 px-5 py-3 text-base font-bold sm:w-auto">{loading ? "Creando la serie…" : "Crear serie y episodio 1"}</button>
        </div>
      </>}

      {view === "continuar" && <>
        <Back />
        <h2 className="text-xl font-bold">Continuar una serie</h2>
        {!current ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {seriesList.map((s: any) => <button key={s.id} onClick={() => setSeriesId(s.id)} className="choice-card"><span className="font-bold">{s.title}</span><span className="text-sm text-slate-400">{s.eps.length} episodio(s)</span></button>)}
          </div>
        ) : (
          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_360px]">
            <div className="space-y-4">
              {currentNeedsRepair && <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
                <p className="font-bold">Esta serie necesita personajes reales de fruta antes de continuar.</p>
                <p className="mt-1 text-xs leading-5">El borrador anterior se conserva. Gemini puede crear una serie nueva desde la misma idea, con apariencia y vestuario consistentes.</p>
                <button onClick={() => { setIdea(current.description || current.title); setStyle(current.style); setView("nueva"); setNotice(""); }} className="mt-3 rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-slate-950">Recrear serie con Gemini</button>
              </div>}
              <div className="rounded-xl bg-[#121826] p-4">
                <div className="flex items-center gap-2"><p className="font-bold">{current.title}</p>{seriesList.length > 1 && <button onClick={() => setSeriesId("")} className="ml-auto text-xs text-slate-400 hover:text-white">Cambiar serie</button>}</div>
                <p className="mt-1 text-sm text-slate-400">{current.description}</p>
                <ol className="timeline mt-4">
                  {current.eps.map((e: any, i: number) => (
                    <li key={e.id}>
                      <button onClick={() => openEpisode(current.id, e, i + 1)} className="text-left">
                        <span className="text-xs font-semibold text-amber-300">Episodio {i + 1}</span>
                        <span className="block text-sm font-medium">{e.title}</span>
                        <span className="block text-xs text-slate-400">{e.output?.summary || e.theme}</span>
                      </button>
                    </li>
                  ))}
                  {!current.eps.length && <li><span className="text-sm text-slate-400">Esta serie aún no tiene episodios.</span></li>}
                </ol>
              </div>
              <div className="rounded-xl bg-[#121826] p-4">
                <label htmlFor="generator-next-wish" className="field-label block">¿Qué quieres que pase en el episodio {current.eps.length + 1}? (opcional)</label>
                <textarea id="generator-next-wish" value={wish} onChange={e => setWish(e.target.value)} placeholder="Déjalo vacío para proponer un giro." />
                <div className="mt-3"><HookPicker online={mode === "supabase"} chosen={chosenHook} onChoose={setChosenHook} body={() => ({ wish, style: current.style, series: { title: current.title, logline: current.description }, characters: currentChars.map((c: any) => ({ name: c.name })), history: current.eps.map((e: any, i: number) => ({ part: i + 1, summary: e.output?.summary || e.theme })), learnings, bank: bankTop })} /></div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <label htmlFor="generator-next-duration" className="sr-only">Duración del próximo episodio</label>
                  <select id="generator-next-duration" value={duration} onChange={e => setDuration(Number(e.target.value))} className="w-auto"><option value={45}>45 s</option><option value={60}>1 min</option><option value={90}>1 min 30</option><option value={120}>2 min</option><option value={180}>3 min</option></select>
                  <button disabled={loading} onClick={continueStory} className="rounded bg-amber-500 px-5 py-2.5 font-bold">{loading ? "Escribiendo…" : `Crear episodio ${current.eps.length + 1}`}</button>
                </div>
              </div>
            </div>
            <aside className="rounded-xl bg-[#121826] p-4 lg:self-start">
              <p className="field-label">Personajes fijos ({currentChars.length})</p>
              <ul className="space-y-2">
                {currentChars.map((c: any) => (
                  <li key={c.id} className="flex gap-2 text-sm">
                    <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.subtitleColor }} />
                    <span><b>{c.name}</b> <span className="text-slate-400">— {c.visualES}</span></span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-slate-500">Se usan idénticos en cada episodio. Edítalos en Personajes.</p>
            </aside>
          </div>
        )}
      </>}

      {view === "resultado" && result && <Result
        episode={result.episode} part={result.part} seriesTitle={data.series.find((s: any) => s.id === result.seriesId)?.title}
        onBack={() => setView("inicio")} onNext={() => { setSeriesId(result.seriesId); setView("continuar"); }}
        onRecreate={() => {
          const oldSeries = data.series.find((s: any) => s.id === result.seriesId);
          const oldEpisode = data.episodes.find((e: any) => e.seriesId === result.seriesId && (e.output === result.episode || e.output?.title === result.episode?.title));
          setIdea(oldSeries?.description || oldEpisode?.theme || result.episode?.description || "");
          setStyle((result.episode?.seriesBible?.style || "frutinovela") as StyleKey);
          setDuration(Number(result.episode?.duration || oldEpisode?.duration || 90));
          setView("nueva");
          setNotice("Revisa la idea y crea una versión nueva con Gemini. El borrador anterior se conserva hasta que decidas eliminarlo.");
        }} />}

      {authError && <div className="mt-4"><AiAuthNotice /></div>}
      {notice && <p role="status" className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-100">{notice}</p>}
      {view === "inicio" && !!data.episodes.length && <EpisodeArchive episodes={data.episodes} series={data.series} onOpen={openEpisode} onDelete={(id: string) => remove("episodes", id)} />}
    </section>
  );
}

function episodeMarkdown(out: any, seriesTitle: string, part: number) {
  const cast = Array.isArray(out.cast) ? out.cast : [];
  const scenes = Array.isArray(out.scenes) ? out.scenes : [];
  return [
    `# ${seriesTitle || "Serie"} · Episodio ${part}: ${out.title || ""}`, "", out.summary || "", "",
    `**Gancho:** ${(out.hook || []).join(" / ")}`, "",
    "## Elenco", "",
    ...cast.flatMap((c: any) => [`### ${c.fruitEmoji ? c.fruitEmoji + " " : ""}${c.name}${c.fruit ? ` — ${c.fruit}` : ""}`, `- Rol: ${c.role || "—"}`, c.headES ? `- Cabeza: ${c.headES}` : `- Apariencia: ${c.visualES || "—"}`, `- Ropa fija: ${c.clothing || "—"}`, `- Voz: ${c.voice || c.speechStyle || "—"}`, `- Pronunciaciones: ${(c.pronunciations || []).join("; ") || "—"}`, `- Color de subtítulo: ${String(c.subtitleColor || "").replace("#", "")}`, "", "Prompt de ficha para Flow:", "```", c.flowPrompt || "", "```", ""]),
    "## Escenas", "",
    ...scenes.flatMap((s: any) => [`### Escena ${s.n} · ${(s.n - 1) * 8}-${s.n * 8} s · ${s.speaker}`, `> ${s.line}`, "", "Imagen para Flow:", "```", s.imagePromptFlow, "```", "Animación (Seedance):", "```", s.animationPrompt, "```", ""]),
  ].join("\n");
}

function DownloadText({ text, filename, label }: { text: string; filename: string; label: string }) {
  return <button type="button" className="rounded bg-slate-700 px-3 py-1.5 text-xs font-semibold" onClick={() => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
  }}>{label}</button>;
}

function Result({ episode: out, part, seriesTitle, onBack, onNext, onRecreate }: any) {
  type Tab = "elenco" | "escenas" | "guion" | "prompts" | "plataformas" | "archivos" | "montaje";
  const cast: any[] = Array.isArray(out.cast) ? out.cast : [];
  const scenes: any[] = Array.isArray(out.scenes) ? out.scenes : [];
  const [tab, setTab] = useState<Tab>(cast.length ? "elenco" : "guion");
  const [reviewed, setReviewed] = useState(false);
  useEffect(() => { setReviewed(false); setTab(cast.length ? "elenco" : "guion"); }, [out]);
  const fromAI = !!out.mode && out.mode !== "plantilla-local" && cast.length >= 2;
  const isTemplate = out.mode === "plantilla-local";
  const fullDuration = out.duration || scenes.length * 8 || (out.scriptBlocks || []).length * 15;
  const dolaDuration = out.dolaDuration || 60;
  const sec = scenes.length ? 8 : 15;
  const tabs: [Tab, string][] = [...(cast.length ? [["elenco", "Elenco"], ["escenas", "Escenas"]] as [Tab, string][] : []), ["guion", "Guion"], ["prompts", "Prompts"], ["plataformas", "Plataformas"], ["archivos", "Archivos"], ["montaje", "Montaje"]];
  const lote = useMemo(() => buildFlowBatch(out), [out]);
  const allScenes = scenes.map((s: any) => `ESCENA ${s.n} (${s.speaker})\n\nIMAGEN PARA FLOW:\n${s.imagePromptFlow}\n\nANIMACIÓN:\n${s.animationPrompt}`).join("\n\n----------\n\n");
  return <>
    <button onClick={onBack} className="mb-4 text-sm text-slate-400 hover:text-white">← Inicio</button>
    <div className="flex flex-wrap items-start gap-3">
      <div className="flex-1 min-w-[220px]">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-300/80">{seriesTitle} · Episodio {part}</p>
        <h2 className="text-xl font-bold">{out.title || `Episodio ${part}`}</h2>
        {out.summary && <p className="mt-1 text-sm text-slate-400">{out.summary}</p>}
      </div>
      <button onClick={onNext} className="rounded bg-amber-500 px-4 py-2 text-sm font-bold">Crear episodio {part + 1} →</button>
    </div>
    <div className={`mt-4 rounded-xl border p-4 text-sm ${fromAI ? "border-emerald-400/25 bg-emerald-400/[.07] text-emerald-100" : "border-amber-400/30 bg-amber-400/[.08] text-amber-100"}`}>
      <p className="font-bold">{fromAI ? `Guion escrito por la IA · ${cast.length} personajes · ${scenes.length || (out.scriptBlocks || []).length} escenas · ${fullDuration} s` : isTemplate ? "Borrador de la plantilla local (sin IA)" : "Borrador anterior sin elenco de producción"}</p>
      <p className="mt-1 text-xs leading-5">{fromAI ? "Revisa el elenco y las escenas antes de producir. Cada escena es una imagen de Flow y un clip de 8 s." : isTemplate ? "Tiene elenco de frutas y escenas completas, pero el diálogo es de estructura genérica. Vuelve a crearla con la IA cuando esté disponible." : "Este episodio se creó con una versión anterior. Recréalo para tener el elenco y las escenas de producción."}</p>
      {!fromAI && <button onClick={onRecreate} className="mt-3 rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400">Recrear con la IA</button>}
      {out.shortForLongPlatforms && <p className="mt-2 text-xs">{out.shortForLongPlatforms}</p>}
    </div>
    {!!(out.hook || []).length && <div className="mt-4 rounded-xl border border-amber-400/20 bg-gradient-to-br from-amber-400/10 to-transparent p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-300">Gancho de los primeros 3 s</p>
      <p className="mt-1 text-lg font-bold">{(out.hook || []).join(" / ")}</p>
    </div>}
    <div className="tabs mt-5">{tabs.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={tab === k ? "tab-active" : ""}>{l}</button>)}</div>
    <div className="mt-4">
      {tab === "elenco" && <div className="grid gap-3 md:grid-cols-2">
        {cast.map((c: any) => <article key={c.name} className="rounded-2xl border border-white/10 bg-[#151C2B] p-4">
          <div className="flex items-start gap-3">
            {c.fruitEmoji && <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/5 text-3xl" aria-hidden="true">{c.fruitEmoji}</span>}
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-white">{c.name}{c.fruit && <span className="font-normal text-slate-400"> — {c.fruit}</span>}</h3>
              <p className="text-xs text-amber-200/90">{c.role}</p>
            </div>
            <span className="flex items-center gap-1.5 rounded-full bg-black/30 px-2 py-1 text-[11px] text-slate-300" title="Color de subtítulo"><span className="h-3 w-3 rounded-full ring-1 ring-white/30" style={{ backgroundColor: c.subtitleColor }} />{String(c.subtitleColor || "").replace("#", "")}</span>
          </div>
          <dl className="mt-3 space-y-1.5 text-xs leading-5">
            {c.headES ? <div><dt className="inline font-semibold text-slate-200">Cabeza: </dt><dd className="inline text-slate-300">{c.headES}</dd></div> : <div><dt className="inline font-semibold text-slate-200">Apariencia: </dt><dd className="inline text-slate-300">{c.visualES}</dd></div>}
            <div><dt className="inline font-semibold text-slate-200">Ropa fija: </dt><dd className="inline text-slate-300">{c.clothing}</dd></div>
            <div><dt className="inline font-semibold text-slate-200">Voz: </dt><dd className="inline text-slate-300">{c.voice || c.speechStyle}</dd></div>
            {!!(c.pronunciations || []).length && <div><dt className="inline font-semibold text-slate-200">Pronunciación: </dt><dd className="inline text-slate-300">{c.pronunciations.join("; ")}</dd></div>}
          </dl>
          {c.flowPrompt && <details className="prompt-box mt-3"><summary><span>Prompt de ficha para Flow</span></summary><div className="px-3 pb-1"><CopyButton text={c.flowPrompt} /></div><p className="prompt-text">{c.flowPrompt}</p></details>}
        </article>)}
      </div>}
      {tab === "escenas" && <div>
        <section className="mb-4 rounded-2xl border border-sky-400/25 bg-sky-400/[.06] p-4" aria-label="Lote para Flow">
          <div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-white">⚡ Lote para Flow</h3><span className="text-xs text-slate-300">{lote.count.fichas} fichas + {lote.count.escenas} escenas en un solo pegado</span>
            <a href="https://flow.google.com/" target="_blank" rel="noreferrer" className="ml-auto text-xs font-semibold text-sky-300 hover:text-sky-200">Abrir Flow ↗</a></div>
          <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-xs leading-5 text-slate-300">
            <li>Copia el lote completo y pégalo una sola vez en Flow.</li>
            <li>Flow crea primero las fichas <b>[P01]</b>, <b>[P02]</b>… y las usa como referencia en las escenas <b>[001]</b>, <b>[002]</b>…</li>
            <li>Cada imagen queda nombrada con su identificador: así sabes a qué escena va sin revisarlas una por una.</li>
          </ol>
          <div className="mt-3 flex flex-wrap gap-2">
            <CopyButton text={lote.full} label={`Copiar lote completo (${lote.count.fichas + lote.count.escenas} imágenes)`} />
            <CopyButton text={lote.fichas} label="Solo fichas" />
            <CopyButton text={lote.escenas} label="Solo escenas" />
            <CopyButton text={lote.animaciones} label="Todas las animaciones" />
            <CopyButton text={lote.dialogos} label="Diálogos en limpio" />
          </div>
          <p className="mt-2 text-[11px] text-slate-400">Si Flow corta un lote largo, pega primero «Solo fichas» y luego «Solo escenas».</p>
        </section>
        <div className="mb-3 flex flex-wrap items-center gap-2"><p className="text-sm text-slate-300">{scenes.length} escenas de 8 s: una imagen de Flow y un clip por escena, un solo personaje hablando.</p><span className="ml-auto"><CopyButton text={allScenes} label="Copiar todas las escenas" /></span></div>
        <ol className="space-y-3">{scenes.map((s: any) => { const c = cast.find((x: any) => x.name === s.speaker); return <li key={s.n} className="rounded-2xl border border-white/10 bg-[#151C2B] p-4">
          <div className="flex flex-wrap items-center gap-2"><span className="rounded-lg bg-amber-400 px-2 py-0.5 text-xs font-black text-black">{s.n}</span><span className="text-xs text-slate-400">{(s.n - 1) * 8}-{s.n * 8} s · {s.setting}</span></div>
          <p className="mt-2 text-sm"><span className="mr-1">{c?.fruitEmoji || "🎙️"}</span><b style={{ color: c?.subtitleColor || "#fff" }}>{s.speaker}</b> <span className="text-slate-400">({s.emotion})</span>: “{s.line}”</p>
          <details className="prompt-box mt-2"><summary><span>Imagen para Flow</span></summary><div className="px-3 pb-1"><CopyButton text={s.imagePromptFlow} /></div><p className="prompt-text">{s.imagePromptFlow}</p></details>
          <details className="prompt-box mt-2"><summary><span>Animación (Pavo IA / Seedance)</span></summary><div className="px-3 pb-1"><CopyButton text={s.animationPrompt} /></div><p className="prompt-text whitespace-pre-line">{s.animationPrompt}</p></details>
        </li>; })}</ol>
      </div>}
      {tab === "guion" && <div className="space-y-3">
        {(out.scriptBlocks || []).map((b: any, i: number) => (
          <div key={i} className="rounded-xl bg-[#121826] p-4">
            <p className="text-xs font-semibold text-amber-300">{scenes.length ? "Escena" : "Bloque"} {b.block ?? i + 1} · {b.time}</p>
            {b.scene && <p className="mt-1 text-sm text-slate-400">{b.scene}</p>}
            <div className="mt-2 space-y-1">{(b.dialogue || []).map((d: any, j: number) => <p key={j} className="text-sm"><b>{d.speaker}:</b> “{d.text}”</p>)}</div>
          </div>
        ))}
        {out.dialogueRules && <p className="text-xs text-slate-500">{out.dialogueRules}</p>}
      </div>}
      {tab === "prompts" && <div>
        <div className="mb-3 rounded-xl border border-white/10 bg-[#151C2B] p-3 text-xs text-slate-300">{out.dolaIsAdaptation ? `La versión Dola condensa el episodio de ${fullDuration} s a ${dolaDuration} s. Los prompts por escena siguen abajo.` : `La versión Dola cubre el episodio completo de ${fullDuration} s.`}</div>
        {fromAI && <label className="mb-3 flex items-start gap-2 rounded-xl border border-white/10 bg-white/[.03] p-3 text-xs text-slate-200"><input type="checkbox" className="mt-0.5" checked={reviewed} onChange={event => setReviewed(event.target.checked)} />He revisado el guion, los personajes y la duración antes de abrir Dola.</label>}
        <details className="prompt-box" open><summary><span>Prompt Dola {dolaDuration} s{out.dolaIsAdaptation ? " · adaptación" : ""}</span></summary><div className="flex flex-wrap gap-2 px-3 pb-1"><CopyButton text={out.dolaPrompt || ""} />{fromAI && reviewed && <DolaButton text={out.dolaPrompt || ""} />}</div><p className="prompt-text">{out.dolaPrompt}</p></details>
        {(out.prompts || []).map((p: string, i: number) => <details key={i} className="prompt-box"><summary><span>{scenes.length ? "Escena" : "Bloque"} {i + 1} · {i * sec}-{(i + 1) * sec}s</span></summary><div className="px-3 pb-1"><CopyButton text={p} /></div><p className="prompt-text whitespace-pre-line">{p}</p></details>)}
      </div>}
      {tab === "plataformas" && <PlatformAdaptations adaptations={out.platformAdaptations || out.platform_adaptations || []} />}
      {tab === "archivos" && <div className="rounded-xl bg-[#121826] p-4 space-y-3">
        <p className="text-sm text-slate-300">Portada: <b>{out.coverText}</b></p>
        <p className="text-sm text-slate-400">{out.description} {(out.hashtags || []).join(" ")}</p>
        <div className="flex flex-wrap gap-2">
          <DownloadJson data={out.guionJson || {}} filename="guion.json" />
          {cast.length > 0 && <DownloadText text={episodeMarkdown(out, seriesTitle, part)} filename={`elenco-escenas-ep${part}.md`} label="Descargar elenco y escenas (.md)" />}
          {scenes.length > 0 && <DownloadText text={lote.full} filename={`lote-flow-ep${part}.txt`} label="Descargar lote para Flow (.txt)" />}
          <DownloadJson data={out.platformAdaptations || []} filename="adaptaciones-plataformas.json" />
        </div>
        <p className="text-xs text-slate-500">guion.json es el archivo para el montaje con subtitular.py: colores sin #, gancho de 2 líneas, cierre y un clip por escena.</p>
      </div>}
      {tab === "montaje" && <MontajePanel guion={out.guionJson || {}} title={`${seriesTitle || "serie"} ${part}`} />}
    </div>
  </>;
}

function EpisodeArchive({ episodes, series, onOpen, onDelete }: any) {
  const [open, setOpen] = useState(false);
  return <div className="mt-8">
    <button onClick={() => setOpen(!open)} aria-expanded={open} className="text-sm font-semibold uppercase tracking-wider text-slate-400 hover:text-white">{open ? "▾" : "▸"} Todos los episodios ({episodes.length})</button>
    {open && <div className="mt-3 space-y-2">
      {[...episodes].reverse().map((ep: any) => {
        const s = series.find((x: any) => x.id === ep.seriesId);
        return <div key={ep.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-[#121826] p-3 text-sm">
          <span className="flex-1 min-w-[200px]"><b>{ep.title}</b> <span className="text-xs text-slate-500">· {s?.title || "Sin serie"}</span></span>
          <button className="rounded bg-slate-700 px-3 py-1 text-xs" onClick={() => onOpen(ep.seriesId, ep, ep.output?.partNumber || 1)}>Ver</button>
          <button className="text-xs text-slate-400 hover:text-red-300" onClick={() => { if (window.confirm("¿Eliminar el episodio «" + ep.title + "»? Esta acción no se puede deshacer.")) onDelete(ep.id); }}>Eliminar episodio</button>
        </div>;
      })}
    </div>}
  </div>;
}
