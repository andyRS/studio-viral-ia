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
import SceneDesk from "./SceneDesk";
import { STYLES, type StyleKey } from "@/lib/knowledge";
import { templateSeries, templateNext } from "@/lib/story";
import { isGenericName } from "@/lib/cast";
import { buildFlowBatch } from "@/lib/production";
import { seriesSignals } from "@/lib/seriesSignals";

type View = "inicio" | "nueva" | "continuar" | "resultado";
// Duración del máster (prompt maestro): 8 a 16 escenas de 8 s; 64-128 s.
const DURATIONS = [64, 72, 80, 88, 96, 104, 128];

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

export default function GeneratorModule({ focusEpisodeId, focusTab }: { focusEpisodeId?: string; focusTab?: "mesa" } = {}) {
  const { data, insert, remove, mode } = useData();
  const focusedEpisodeRef = useRef<string | null>(null);
  const [view, setView] = useState<View>("inicio");
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState(false);
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<{ episode: any; episodeId: string; seriesId: string; part: number } | null>(null);

  // Historia nueva
  const [idea, setIdea] = useState("");
  const [style, setStyleRaw] = useState<StyleKey>("frutinovela");
  // El estilo es obligatorio: hay que elegirlo antes de crear (no vale el valor por defecto).
  const [styleChosen, setStyleChosen] = useState(false);
  const setStyle = (k: StyleKey) => { setStyleRaw(k); setStyleChosen(true); };
  const [accountId, setAccountId] = useState("");
  const [duration, setDuration] = useState(88);
  const [notes, setNotes] = useState("");
  // Tipo de pedido: historia nueva o réplica de un viral ajeno (se copia estructura y emoción).
  const [kind, setKind] = useState<"nueva" | "replica">("nueva");
  const [replica, setReplica] = useState("");
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
  const currentSignals = current ? seriesSignals(current.eps, data.metrics) : [];
  // La biblia en Personajes prevalece sobre copias antiguas dentro de episodios.
  const currentCast = useMemo(() => {
    const byName = new Map<string, any>();
    for (const e of current?.eps || []) for (const c of e.output?.cast || []) byName.set(String(c.name).toLowerCase(), { ...byName.get(String(c.name).toLowerCase()), ...c });
    for (const c of currentChars) byName.set(String(c.name).toLowerCase(), { ...byName.get(String(c.name).toLowerCase()), ...c });
    return Array.from(byName.values());
  }, [currentChars, current]);
  const missingCurrentMasters = currentCast.filter(c => !currentChars.some(saved => saved.name.toLowerCase() === String(c.name).toLowerCase() && saved.imageUrl && saved.referenceApprovedAt));
  const currentNeedsRepair = !!current && (current.eps.some((e: any) => e.status === "Borrador" || e.output?.mode === "plantilla-local") || currentCast.length < 2 || currentCast.some((c: any) =>
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
    const referenceVersions = Object.fromEntries((ep.cast || []).map((c: any) => [String(c.name).toLowerCase(), data.characters.find(x => x.seriesId === sid && x.name.toLowerCase() === String(c.name).toLowerCase())?.referenceVersion || 1]));
    const output = { ...ep, partNumber: part, seriesBible: bible ?? ep.seriesBible, referenceVersions };
    const saved = await insert("episodes", {
      title: ep.title || `Episodio ${part}`, theme: ep.summary || ep.title || "", duration: ep.duration || duration, status: ep.mode === "plantilla-local" ? "Borrador" : "Guion",
      previousSummary: "", accountId: account?.id, seriesId: sid, createdAt: new Date().toISOString(),
      versions: [output], output, platformAdaptations: ep.platformAdaptations || [], platform_adaptations: ep.platformAdaptations || [],
    });
    return { output, episodeId: saved.id as string };
  }

  async function createStory() {
    if (!styleChosen) { setNotice("Elige primero el estilo de la historia."); return; }
    if (!idea.trim() && !(kind === "replica" && replica.trim())) { setNotice(kind === "replica" ? "Describe el viral que quieres replicar." : "Escribe la idea de la historia o elige una de las sugerencias."); return; }
    setLoading(true); setNotice(""); setAuthError(false);
    try {
      const body = { idea, style, duration, account, notes, learnings, chosenHook, replica: kind === "replica" ? replica : "" };
      const res = await call("/api/series", body, () => templateSeries(body)); if (!res) return;
      const d = res.data;
      const s = await insert("series", { title: d.series?.title || idea.slice(0, 60), description: d.series?.logline || idea, accountId: account?.id });
      for (const c of d.characters || []) await insert("characters", { ...c, seriesId: s.id });
      const bible = { style, logline: d.series?.logline, world: d.series?.world, tone: d.series?.tone };
      const saved = await saveEpisode(s.id, 1, d.episode, bible);
      setSeriesId(s.id); setResult({ episode: saved.output, episodeId: saved.episodeId, seriesId: s.id, part: 1 }); setView("resultado"); setNotice(res.note); setChosenHook(null);
    } catch (error: any) { setNotice(`No se pudo guardar la historia: ${error?.message || String(error)}`); }
    finally { setLoading(false); }
  }

  async function continueStory() {
    if (!current) return;
    if (currentNeedsRepair) { setNotice("Esta serie contiene un borrador de plantilla o personajes incompletos. Recréala con Gemini antes de continuar."); return; }
    if (missingCurrentMasters.length) { setNotice(`Aprueba las fichas maestras antes de continuar: ${missingCurrentMasters.map(c => c.name).join(", ")}.`); return; }
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
      const saved = await saveEpisode(current.id, part, res.data.episode, bible);
      setResult({ episode: saved.output, episodeId: saved.episodeId, seriesId: current.id, part }); setView("resultado"); setWish(""); setChosenHook(null);
      setNotice([res.note, (res.data.newCharacters || []).length ? `Personajes nuevos añadidos: ${res.data.newCharacters.map((c: any) => c.name).join(", ")}.` : ""].filter(Boolean).join(" "));
    } catch (error: any) { setNotice(`No se pudo guardar el episodio: ${error?.message || String(error)}`); }
    finally { setLoading(false); }
  }

  function openEpisode(sid: string, ep: any, part: number) { setSeriesId(sid); setResult({ episode: ep.output || {}, episodeId: ep.id, seriesId: sid, part }); setView("resultado"); setNotice(""); }
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
            <fieldset className="mb-3">
              <legend className="field-label">Tipo</legend>
              <div className="flex flex-wrap gap-2">{([["nueva", "Historia nueva (Parte 1)"], ["replica", "Réplica de un viral"]] as const).map(([k, l]) =>
                <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={`rounded-full border px-3 py-1.5 text-xs ${kind === k ? "border-amber-400/60 bg-amber-400/10 text-amber-100" : "border-white/10 bg-white/[.03] text-slate-300"}`}>{l}</button>)}</div>
            </fieldset>
            {kind === "replica" && <div className="mb-3"><label htmlFor="generator-replica" className="field-label block">Describe el viral</label>
              <textarea id="generator-replica" value={replica} onChange={e => setReplica(e.target.value)} placeholder="Qué pasa en el vídeo, su gancho, quién humilla a quién, qué objeto revela el giro… Se copia la estructura y la emoción, nunca los personajes ni el diálogo." /></div>}
            <label htmlFor="generator-idea" className="field-label block">{kind === "replica" ? "Idea para adaptarlo a RD" : "Idea de la historia"}</label>
            <textarea id="generator-idea" value={idea} onChange={e => setIdea(e.target.value)} placeholder="Ej.: Una madre humilde descubre que su hijo rico la niega delante de sus amigos…" />
            <div className="mt-2 flex flex-wrap gap-2">
              {IDEAS[style].map(t => <button key={t} onClick={() => setIdea(t)} className="rounded-full border border-white/10 bg-white/[.03] px-3 py-1.5 text-left text-xs text-slate-300 hover:bg-white/10">💡 {t}</button>)}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label htmlFor="generator-account" className="field-label block">Cuenta principal</label>
              <select id="generator-account" value={account?.id || ""} onChange={e => setAccountId(e.target.value)}>{data.accounts.map((a: any) => <option key={a.id} value={a.id}>{a.name} · {a.platform}</option>)}</select></div>
            <div><label htmlFor="generator-duration" className="field-label block">Duración del máster</label>
              <select id="generator-duration" value={duration} onChange={e => setDuration(Number(e.target.value))}>{DURATIONS.map(d => <option key={d} value={d}>{d} s · {d / 8} escenas</option>)}</select></div>
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
                <p className="font-bold">Esta serie necesita un guion y personajes validados antes de continuar.</p>
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
                        <span className="block text-sm font-medium">{e.title}{e.status === "Borrador" || e.output?.mode === "plantilla-local" ? " · Borrador" : ""}</span>
                        <span className="block text-xs text-slate-400">{e.output?.summary || e.theme}</span>
                      </button>
                    </li>
                  ))}
                  {!current.eps.length && <li><span className="text-sm text-slate-400">Esta serie aún no tiene episodios.</span></li>}
                </ol>
              </div>
              {!!currentSignals.length && <div className="rounded-xl border border-white/10 bg-[#151C2B] p-4"><h3 className="text-sm font-bold">Rendimiento de las partes</h3><p className="mt-1 text-xs text-slate-400">Vistas registradas de episodios vinculados, separadas por plataforma.</p><div className="mt-3 space-y-3">{currentSignals.map(signal => <div key={signal.platform} className="rounded-lg bg-black/20 p-3 text-xs"><b>{signal.platform}</b><p className="mt-1 text-slate-200">{signal.parts.map(p => `Parte ${p.part}: ${p.views.toLocaleString("es")} vistas`).join(" → ")}</p><p className={`mt-2 ${signal.suggestFreshStart ? "text-amber-200" : "text-slate-400"}`}>{signal.suggestFreshStart ? "Tres partes caen con ventanas comparables. Considera cerrar esta historia y probar una Parte 1 nueva." : signal.comparable ? "Sin señal suficiente para recomendar cerrar la serie." : "Las fechas de captura no permiten comparar las partes a la misma edad; no se recomienda cerrar la serie con estos datos."}</p></div>)}</div></div>}
              {!!missingCurrentMasters.length && !currentNeedsRepair && <p className="rounded-xl border border-amber-400/25 bg-amber-400/10 p-3 text-xs text-amber-100">Antes de continuar, aprueba la ficha maestra de: {missingCurrentMasters.map(c => c.name).join(", ")}. Abre un episodio de la serie y entra en «1 · Biblia».</p>}
              <div className="rounded-xl bg-[#121826] p-4">
                <label htmlFor="generator-next-wish" className="field-label block">¿Qué quieres que pase en el episodio {current.eps.length + 1}? (opcional)</label>
                <textarea id="generator-next-wish" value={wish} onChange={e => setWish(e.target.value)} placeholder="Déjalo vacío para proponer un giro." />
                <div className="mt-3"><HookPicker online={mode === "supabase"} chosen={chosenHook} onChoose={setChosenHook} body={() => ({ wish, style: current.style, series: { title: current.title, logline: current.description }, characters: currentChars.map((c: any) => ({ name: c.name })), history: current.eps.map((e: any, i: number) => ({ part: i + 1, summary: e.output?.summary || e.theme })), learnings, bank: bankTop })} /></div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <label htmlFor="generator-next-duration" className="sr-only">Duración del próximo episodio</label>
                  <select id="generator-next-duration" value={duration} onChange={e => setDuration(Number(e.target.value))} className="w-auto">{DURATIONS.map(d => <option key={d} value={d}>{d} s · {d / 8} escenas</option>)}</select>
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
        episode={result.episode} episodeId={result.episodeId} seriesId={result.seriesId} part={result.part} seriesTitle={data.series.find((s: any) => s.id === result.seriesId)?.title} initialTab={focusTab}
        onBack={() => setView("inicio")} onNext={() => { setSeriesId(result.seriesId); setView("continuar"); }}
        onRecreate={() => {
          const oldSeries = data.series.find((s: any) => s.id === result.seriesId);
          const oldEpisode = data.episodes.find((e: any) => e.seriesId === result.seriesId && (e.output === result.episode || e.output?.title === result.episode?.title));
          setIdea(oldSeries?.description || oldEpisode?.theme || result.episode?.description || "");
          setStyle((result.episode?.seriesBible?.style || "frutinovela") as StyleKey);
          const previousDuration = Number(result.episode?.duration || oldEpisode?.duration || 88);
          setDuration(DURATIONS.reduce((best, option) => Math.abs(option - previousDuration) < Math.abs(best - previousDuration) ? option : best, 88));
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
  const f = out.ficha || {}; const so = out.social || {};
  const lote = buildFlowBatch(out);
  return [
    `# ${seriesTitle || "Serie"} · Episodio ${part}: ${out.title || ""}`, "",
    f.biblicalBase ? `**Base bíblica:** ${f.biblicalBase}` : "",
    `**Sinopsis:** ${f.synopsis || out.summary || ""}`,
    `**Gancho:** ${f.hookImage || ""} — «${f.hookText || (out.hook || []).join(" / ")}»`,
    f.conflict ? `**Conflicto:** ${f.conflict}` : "", f.development ? `**Desarrollo:** ${f.development}` : "",
    f.climax ? `**Clímax:** ${f.climax}` : "", f.resolution ? `**Resolución:** ${f.resolution}` : "", f.closing ? `**Cierre:** ${f.closing}` : "", "",
    "## Guion por escenas", "",
    ...scenes.flatMap((s: any) => [`### Escena ${s.n} — ${s.title || ""} (${(s.n - 1) * 8}-${s.n * 8} s)`, `- Objetivo: ${s.goal || "—"}`, `- Personajes: ${(s.characters || []).join(", ") || "—"}`, `- Emoción: ${s.emotion}`, `- Plano: ${s.shot || "—"}`, `- Acción visual: ${s.setting}`, `- ${s.speaker}: «${s.line}»`, `- Efectos: ${s.sfx || "—"}`, `- Música: ${s.music || "—"}`, `- Transición: ${s.transition || "—"}`, `- Conexión: ${s.nextLink || "—"}`, ""]),
    "## Fase 1 · Elenco", "",
    ...cast.flatMap((c: any) => [`### ${c.fruitEmoji ? c.fruitEmoji + " " : ""}${c.name}${c.fruit ? ` — ${c.fruit}` : ""}`, `- Rol: ${c.role || "—"}`, c.headES ? `- Cabeza: ${c.headES}` : `- Apariencia: ${c.visualES || "—"}`, `- Ropa fija: ${c.clothing || "—"}`, `- Voz: ${c.voice || c.speechStyle || "—"}`, `- Pronunciaciones: ${(c.pronunciations || []).join("; ") || "—"}`, `- Color de subtítulo: ${String(c.subtitleColor || "").replace("#", "")}`, "", "Prompt de ficha para Flow:", "```", c.flowPrompt || "", "```", ""]),
    "## Fase 2 · Imágenes (adjunta las fichas maestras aprobadas)", "", "```", lote.full, "```", "",
    "## Fase 3 · Animación", "",
    ...scenes.flatMap((s: any) => [`### Escena ${s.n} — primer fotograma: imagen [${String(s.n).padStart(3, "0")}]`, `Referencias a seleccionar: ${(s.references || []).join(", ") || "ninguna"}`, "```", s.animationPrompt, "```", ""]),
    "## Redes", "", `- Título: ${so.title || ""}`, ...(so.hooks || []).map((h: string, i: number) => `- Gancho ${i + 1}: ${h}`), `- Texto del fotograma cero: ${so.frameZeroText || ""}`, `- Descripción TikTok: ${so.tiktokDescription || ""}`, `- Pregunta final: ${so.question || ""}`, `- Portada: ${so.coverIdea || ""}`, `- Música: ${so.music || ""}`, so.biblicalPassage ? `- Pasaje bíblico: ${so.biblicalPassage}` : "",
  ].filter(l => l !== "").join("\n");
}

function DownloadText({ text, filename, label }: { text: string; filename: string; label: string }) {
  return <button type="button" className="rounded bg-slate-700 px-3 py-1.5 text-xs font-semibold" onClick={() => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
  }}>{label}</button>;
}

const Field = ({ label, value }: { label: string; value?: string }) => value ? <div><dt className="inline font-semibold text-slate-200">{label}: </dt><dd className="inline text-slate-300">{value}</dd></div> : null;
const RefChips = ({ refs }: { refs?: string[] }) => <p className="mt-2 text-[11px] text-sky-200">Referencias a seleccionar (fuera del prompt): {(refs || []).length ? (refs || []).map(r => <span key={r} className="ml-1 rounded-full bg-sky-400/15 px-2 py-0.5">{r}</span>) : <span className="text-slate-400">ninguna</span>}</p>;

function Result({ episode: out, episodeId, seriesId, part, seriesTitle, initialTab, onBack, onNext, onRecreate }: any) {
  type Tab = "guion" | "elenco" | "imagenes" | "animacion" | "mesa" | "redes" | "plataformas" | "archivos";
  const { data, update } = useData();
  const cast: any[] = Array.isArray(out.cast) ? out.cast : [];
  const scenes: any[] = Array.isArray(out.scenes) ? out.scenes : [];
  const ficha = out.ficha || null; const social = out.social || null;
  const [tab, setTab] = useState<Tab>("guion");
  const [reviewed, setReviewed] = useState(false);
  useEffect(() => { setReviewed(false); setTab(initialTab && out.mode !== "plantilla-local" ? initialTab : "guion"); }, [out, initialTab]);
  const fromAI = !!out.mode && out.mode !== "plantilla-local" && cast.length >= 2;
  const isTemplate = out.mode === "plantilla-local";
  const master = cast.map(c => data.characters.find(x => x.seriesId === seriesId && x.name.toLowerCase() === String(c.name).toLowerCase()));
  const referencesReady = !!cast.length && master.every(c => !!c?.imageUrl && !!c?.referenceApprovedAt);
  const snapshotValid = !!out.referenceVersions && master.every((c, i) => Number(c?.referenceVersion || 1) === Number(out.referenceVersions[String(cast[i].name).toLowerCase()]));
  const productionReady = referencesReady && snapshotValid;
  const referenceSignature = master.map(c => `${c?.id || "missing"}:${c?.referenceVersion || 0}`).join("|");
  const missingMasters = cast.filter((_, i) => !master[i]?.imageUrl || !master[i]?.referenceApprovedAt).map(c => c.name);
  const fullDuration = out.duration || scenes.length * 8 || (out.scriptBlocks || []).length * 15;
  const dolaDuration = out.dolaDuration || 60;
  const sec = scenes.length ? 8 : 15;
  const lote = useMemo(() => buildFlowBatch(out), [out]);
  const tabs: [Tab, string][] = [["guion", "Guion"], ...(cast.length ? [["elenco", "1 · Biblia"]] as [Tab, string][] : []), ...(fromAI && scenes.length ? [["imagenes", "2 · Imágenes"], ["animacion", "3 · Animación"], ["mesa", "4 · Mesa y montaje"]] as [Tab, string][] : []), ...(social ? [["redes", "Redes"]] as [Tab, string][] : []), ["plataformas", "Plataformas"], ...(!isTemplate ? [["archivos", "Archivos"]] as [Tab, string][] : [])];
  async function uploadMaster(c: any, file: File | undefined) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { window.alert("Exporta la ficha en menos de 2 MB para guardarla en tu cuenta."); return; }
    if (c.referenceApprovedAt && !window.confirm(`Se creará una nueva versión pendiente de aprobación para ${c.name}. ¿Continuar?`)) return;
    const reader = new FileReader();
    reader.onload = () => { const history = [...(c.referenceHistory || [])]; if (c.referenceApprovedAt && c.imageUrl) history.push({ version: c.referenceVersion || 1, imageUrl: c.imageUrl, approvedAt: c.referenceApprovedAt }); void update("characters", c.id, { imageUrl: reader.result as string, referenceApprovedAt: undefined, referenceVersion: Number(c.referenceVersion || 0) + 1, referenceHistory: history }); };
    reader.readAsDataURL(file);
  }
  const sceneId = (n: number) => `[${String(n).padStart(3, "0")}]`;
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
      <p className="mt-1 text-xs leading-5">{fromAI ? "Orden de trabajo: aprueba las fichas maestras → genera imágenes con esas referencias → anima y revisa cada escena → monta el vídeo." : isTemplate ? "El diálogo es genérico. Este borrador no ofrece prompts de producción ni montaje; vuelve a crear el guion con Gemini." : "Este episodio se creó con una versión anterior. Recréalo para tener el elenco y las escenas de producción."}</p>
      {!fromAI && <button onClick={onRecreate} className="mt-3 rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400">Recrear con la IA</button>}
      {out.shortForLongPlatforms && <p className="mt-2 text-xs">{out.shortForLongPlatforms}</p>}
    </div>
    {fromAI && !referencesReady && <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-100">Faltan fichas maestras aprobadas: {missingMasters.join(", ")}. Súbelas y apruébalas en «1 · Biblia» antes de producir.</div>}
    {fromAI && referencesReady && !snapshotValid && <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-100">La ficha maestra cambió desde que se creó este guion, o el episodio es anterior al control de versiones. Regenera el episodio para alinear prompts y personajes.</div>}
    <div className="tabs mt-5">{tabs.map(([k, l]) => <button key={k} onClick={() => setTab(k)} disabled={(k === "imagenes" || k === "animacion" || k === "mesa") && !productionReady} className={`${tab === k ? "tab-active" : ""} disabled:cursor-not-allowed disabled:opacity-40`}>{l}</button>)}</div>
    <div className="mt-4">
      {tab === "guion" && <div className="space-y-3">
        {ficha && <section className="rounded-2xl border border-amber-400/20 bg-gradient-to-br from-amber-400/10 to-transparent p-4">
          <h3 className="font-bold text-white">Ficha del episodio</h3>
          <dl className="mt-2 space-y-1.5 text-sm leading-6">
            <Field label="Base bíblica" value={ficha.biblicalBase} />
            <Field label="Sinopsis" value={ficha.synopsis} />
            <Field label="Gancho (imagen)" value={ficha.hookImage} />
            <Field label="Frase del fotograma cero" value={ficha.hookText} />
            <Field label="Conflicto principal" value={ficha.conflict} />
            <Field label="Desarrollo" value={ficha.development} />
            <Field label="Clímax" value={ficha.climax} />
            <Field label="Resolución" value={ficha.resolution} />
            <Field label="Cierre" value={ficha.closing} />
          </dl>
          {out.selfScore && <div className="mt-3 flex flex-wrap gap-2 text-xs">{([["Gancho 0-1 s", out.selfScore.hook], ["Claridad sin contexto", out.selfScore.clarity], ["Escalada", out.selfScore.escalation], ["Giro final", out.selfScore.twist], ["Ganas de comentar", out.selfScore.comments]] as [string, number | null][]).filter(([, v]) => v).map(([k, v]) =>
            <span key={k} className={`rounded-full px-2.5 py-1 font-semibold ${v! >= 8 ? "bg-emerald-500/15 text-emerald-200" : "bg-rose-500/15 text-rose-200"}`}>{k}: {v}/10</span>)}<span className="self-center text-slate-500">Autoevaluación de la IA</span></div>}
        </section>}
        {!ficha && !!(out.hook || []).length && <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-4"><p className="text-[11px] font-semibold uppercase tracking-wider text-amber-300">Gancho de los primeros 3 s</p><p className="mt-1 text-lg font-bold">{(out.hook || []).join(" / ")}</p></div>}
        {scenes.length ? scenes.map((s: any) => { const c = cast.find((x: any) => x.name === s.speaker); return <article key={s.n} className="rounded-xl bg-[#121826] p-4">
          <p className="text-xs font-semibold text-amber-300">ESCENA {String(s.n).padStart(2, "0")} — {s.title || ""} · {(s.n - 1) * 8}-{s.n * 8} s</p>
          <p className="mt-2 text-sm"><span className="mr-1">{c?.fruitEmoji || "🎙️"}</span><b style={{ color: c?.subtitleColor || "#fff" }}>{s.speaker}</b> <span className="text-slate-400">({s.emotion})</span>: “{s.line}”</p>
          <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs leading-5 sm:grid-cols-2">
            <Field label="Objetivo" value={s.goal} /><Field label="Personajes" value={(s.characters || []).join(", ") || "—"} />
            <Field label="Plano" value={s.shot} /><Field label="Acción visual" value={s.setting} />
            <Field label="Efectos" value={s.sfx} /><Field label="Música" value={s.music} />
            <Field label="Transición" value={s.transition} /><Field label="Conexión" value={s.nextLink} />
          </dl>
        </article>; }) : (out.scriptBlocks || []).map((b: any, i: number) => (
          <div key={i} className="rounded-xl bg-[#121826] p-4">
            <p className="text-xs font-semibold text-amber-300">Bloque {b.block ?? i + 1} · {b.time}</p>
            {b.scene && <p className="mt-1 text-sm text-slate-400">{b.scene}</p>}
            <div className="mt-2 space-y-1">{(b.dialogue || []).map((d: any, j: number) => <p key={j} className="text-sm"><b>{d.speaker}:</b> “{d.text}”</p>)}</div>
          </div>
        ))}
        {out.dialogueRules && <p className="text-xs text-slate-500">{out.dialogueRules}</p>}
      </div>}
      {tab === "elenco" && <div>
        <p className="mb-3 text-sm text-slate-300">Genera la ficha una vez en Flow, guárdala aquí y apruébala. En todos los episodios siguientes se usa esta referencia maestra, no una ficha inventada de nuevo.</p>
        <div className="grid gap-3 md:grid-cols-2">{cast.map((generated: any, i: number) => { const c = master[i] || generated; return <article key={c.name} className="rounded-2xl border border-white/10 bg-[#151C2B] p-4">
          <div className="flex items-start gap-3">
            {c.fruitEmoji && <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/5 text-3xl" aria-hidden="true">{c.fruitEmoji}</span>}
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-white">{c.name}{c.fruit && <span className="font-normal text-slate-400"> — {c.fruit}</span>}</h3>
              <p className="text-xs text-amber-200/90">{c.role}</p>
              <p className="text-[11px] text-slate-500">Archivo en Flow: [P{String(i + 1).padStart(2, "0")}]</p>
            </div>
            <span className="flex items-center gap-1.5 rounded-full bg-black/30 px-2 py-1 text-[11px] text-slate-300" title="Color de subtítulo"><span className="h-3 w-3 rounded-full ring-1 ring-white/30" style={{ backgroundColor: c.subtitleColor }} />{String(c.subtitleColor || "").replace("#", "")}</span>
          </div>
          <dl className="mt-3 space-y-1.5 text-xs leading-5">
            {c.headES ? <Field label="Cabeza" value={c.headES} /> : <Field label="Apariencia" value={c.visualES} />}
            <Field label="Ropa fija" value={c.clothing} /><Field label="Voz" value={c.voice || c.speechStyle} />
            {!!(c.pronunciations || []).length && <Field label="Pronunciación" value={c.pronunciations.join("; ")} />}
          </dl>
          <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
            {c.imageUrl && <img src={c.imageUrl} alt={`Ficha maestra de ${c.name}`} className="mb-2 aspect-[9/16] max-h-56 w-full rounded-lg object-contain" />}
            <p className={`text-xs font-semibold ${c.referenceApprovedAt ? "text-emerald-300" : "text-amber-200"}`}>{c.referenceApprovedAt ? `✓ Ficha aprobada · versión ${c.referenceVersion || 1}` : c.imageUrl ? "Ficha pendiente de aprobación" : "Falta subir la ficha de Flow"}</p>
            {c.id && <div className="mt-2 flex flex-wrap gap-2 text-xs"><label className="cursor-pointer rounded-lg border border-white/15 px-3 py-1.5">{c.imageUrl ? "Nueva versión" : "Subir ficha"}<input type="file" accept="image/*" className="sr-only" onChange={e => uploadMaster(c, e.target.files?.[0])} /></label>{c.imageUrl && <><button type="button" onClick={() => { void update("characters", c.id, { referenceApprovedAt: new Date().toISOString() }); }} className="rounded-lg bg-emerald-400 px-3 py-1.5 font-bold text-slate-950">Aprobar</button><a href={c.imageUrl} download={`${c.name}-ficha-v${c.referenceVersion || 1}.png`} className="rounded-lg border border-white/15 px-3 py-1.5">Descargar copia</a></>}</div>}
          </div>
          {c.flowPrompt && <details className="prompt-box mt-3"><summary><span>Prompt de ficha para Flow</span></summary><div className="px-3 pb-1"><CopyButton text={c.flowPrompt} /></div><p className="prompt-text">{c.flowPrompt}</p></details>}
        </article>; })}</div>
      </div>}
      {tab === "imagenes" && productionReady && <div>
        <section className="mb-4 rounded-2xl border border-sky-400/25 bg-sky-400/[.06] p-4" aria-label="Lote para Flow">
          <div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-white">Lote de escenas para Flow</h3><span className="text-xs text-slate-300">{lote.count.escenas} escenas con fichas maestras aprobadas</span>
            <a href="https://flow.google.com/" target="_blank" rel="noreferrer" className="ml-auto text-xs font-semibold text-sky-300 hover:text-sky-200">Abrir Flow ↗</a></div>
          <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-xs leading-5 text-slate-300">
            <li>Adjunta las fichas aprobadas del elenco como referencia en Flow.</li>
            <li>Copia las escenas <b>[001]</b>, <b>[002]</b>… conservando los personajes de esas fichas.</li>
            <li>Cada imagen queda nombrada con su identificador. Aprueba las imágenes antes de pasar a la Fase 3.</li>
          </ol>
          <div className="mt-3 flex flex-wrap gap-2">
            <CopyButton text={lote.full} label={`Copiar ${lote.count.escenas} escenas`} />
          </div>
          <p className="mt-2 text-[11px] text-slate-400">Si Flow corta un lote largo, copia los prompts de escena por separado. No regeneres las fichas maestras de la serie.</p>
        </section>
        <ol className="space-y-3">{scenes.map((s: any) => <li key={s.n} className="rounded-2xl border border-white/10 bg-[#151C2B] p-4">
          <div className="flex flex-wrap items-center gap-2"><span className="rounded-lg bg-amber-400 px-2 py-0.5 text-xs font-black text-black">{sceneId(s.n)}</span><span className="text-sm font-semibold">{s.title}</span><span className="text-xs text-slate-400">· {s.shot}</span></div>
          <RefChips refs={s.references} />
          <details className="prompt-box mt-2"><summary><span>Prompt para imagen (Flow)</span></summary><div className="px-3 pb-1"><CopyButton text={s.imagePromptFlow} /></div><p className="prompt-text">{s.imagePromptFlow}</p></details>
        </li>)}</ol>
      </div>}
      {tab === "animacion" && productionReady && <div>
        <div className="mb-3 rounded-xl border border-white/10 bg-[#151C2B] p-3 text-xs text-slate-300">{scenes.length ? "Fase 3: usa cada imagen aprobada como primer fotograma y pega su prompt en Pavo IA / Seedance. " : ""}{out.dolaIsAdaptation ? `La versión Dola dura ${dolaDuration} s y conserva el inicio y el cierre. Escenas: ${(out.dolaSceneNumbers || []).join(", ")}.` : `La versión Dola cubre el episodio completo de ${fullDuration} s.`}</div>
        {fromAI && <label className="mb-3 flex items-start gap-2 rounded-xl border border-white/10 bg-white/[.03] p-3 text-xs text-slate-200"><input type="checkbox" className="mt-0.5" checked={reviewed} onChange={event => setReviewed(event.target.checked)} />He revisado el guion, los personajes y la duración antes de abrir Dola.</label>}
        <details className="prompt-box"><summary><span>Prompt Dola {dolaDuration} s{out.dolaIsAdaptation ? " · adaptación" : ""}</span></summary><div className="flex flex-wrap gap-2 px-3 pb-1"><CopyButton text={out.dolaPrompt || ""} />{fromAI && reviewed && <DolaButton text={out.dolaPrompt || ""} />}</div><p className="prompt-text">{out.dolaPrompt}</p></details>
        {scenes.length ? <>
          <div className="my-3 flex flex-wrap gap-2"><CopyButton text={lote.animaciones} label="Copiar todas las animaciones" /><CopyButton text={lote.dialogos} label="Diálogos en limpio" /></div>
          <ol className="space-y-3">{scenes.map((s: any) => <li key={s.n} className="rounded-2xl border border-white/10 bg-[#151C2B] p-4">
            <div className="flex flex-wrap items-center gap-2"><span className="rounded-lg bg-amber-400 px-2 py-0.5 text-xs font-black text-black">{String(s.n).padStart(2, "0")}</span><span className="text-sm font-semibold">{s.title}</span><span className="text-xs text-slate-400">· primer fotograma: imagen {sceneId(s.n)}</span></div>
            <RefChips refs={s.references} />
            <details className="prompt-box mt-2"><summary><span>Prompt para animación (Pavo IA / Seedance)</span></summary><div className="px-3 pb-1"><CopyButton text={s.animationPrompt} /></div><p className="prompt-text whitespace-pre-line">{s.animationPrompt}</p></details>
          </li>)}</ol>
        </> : (out.prompts || []).map((p: string, i: number) => <details key={i} className="prompt-box mt-2"><summary><span>Bloque {i + 1} · {i * sec}-{(i + 1) * sec}s</span></summary><div className="px-3 pb-1"><CopyButton text={p} /></div><p className="prompt-text whitespace-pre-line">{p}</p></details>)}
      </div>}
      {tab === "redes" && social && <div className="space-y-2">
        {out.cover && <div className="rounded-2xl border border-amber-400/25 bg-amber-400/[.06] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-300">Portada</p>
          <p className="mt-1 text-sm"><b>Fotograma:</b> {out.cover.frame}</p>
          <p className="mt-2 text-lg font-black leading-tight">{(out.cover.lines || []).join(" / ")}</p>
          <p className="mt-1 inline-block rounded bg-amber-400 px-2 py-0.5 text-xs font-black text-black">{out.cover.part}</p>
          <div className="mt-2"><CopyButton text={`${(out.cover.lines || []).join("\n")}\n${out.cover.part}`} label="Copiar texto de portada" /></div>
        </div>}
        {([["Título", social.title], ...(social.hooks || []).map((h: string, i: number) => [`Gancho ${i + 1}`, h]), ["Texto del fotograma cero", social.frameZeroText], ["Descripción para TikTok", social.tiktokDescription], ["Pregunta final", social.question], ["Idea de portada 9:16", social.coverIdea], ["Música recomendada", social.music], ["Pasaje bíblico", social.biblicalPassage]] as [string, string][]).filter(([, v]) => v).map(([k, v]) =>
          <div key={k} className="flex flex-wrap items-start gap-2 rounded-xl bg-[#121826] p-3"><div className="min-w-0 flex-1"><p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{k}</p><p className="mt-0.5 text-sm">{v}</p></div><CopyButton text={v} /></div>)}
        <p className="text-xs text-slate-500">Los textos se añaden en la edición: nunca van dentro de los prompts de imagen o video.</p>
      </div>}
      {tab === "plataformas" && <PlatformAdaptations adaptations={out.platformAdaptations || out.platform_adaptations || []} />}
      {tab === "archivos" && <div className="rounded-xl bg-[#121826] p-4 space-y-3">
        <p className="text-sm text-slate-300">Portada: <b>{out.coverText}</b></p>
        <p className="text-sm text-slate-400">{out.description} {(out.hashtags || []).join(" ")}</p>
        <div className="flex flex-wrap gap-2">
          <DownloadJson data={out.guionJson || {}} filename="guion.json" />
          {cast.length > 0 && <DownloadText text={episodeMarkdown(out, seriesTitle, part)} filename={`produccion-ep${part}.md`} label="Descargar producción completa (.md)" />}
          {scenes.length > 0 && <DownloadText text={lote.full} filename={`lote-flow-ep${part}.txt`} label="Descargar escenas para Flow (.txt)" />}
          <DownloadJson data={out.platformAdaptations || []} filename="adaptaciones-plataformas.json" />
        </div>
        <p className="text-xs text-slate-500">guion.json es el archivo para el montaje con subtitular.py. El .md trae la ficha del episodio, el guion por escenas, las 3 fases y el paquete de redes.</p>
      </div>}
      {tab === "mesa" && productionReady && <SceneDesk key={episodeId} episodeId={episodeId} scenes={scenes} guion={out.guionJson || {}} title={`${seriesTitle || "serie"} ${part}`} referencesReady={referencesReady} referenceSignature={referenceSignature} />}
      {(tab === "imagenes" || tab === "animacion" || tab === "mesa") && !productionReady && <p className="rounded-xl border border-amber-400/25 bg-amber-400/10 p-4 text-sm text-amber-100">Revisa la biblia y la versión de las fichas maestras antes de continuar.</p>}
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
          <span className="flex-1 min-w-[200px]"><b>{ep.title}</b> <span className="text-xs text-slate-500">· {s?.title || "Sin serie"}</span>{ep.status === "Borrador" || ep.output?.mode === "plantilla-local" ? <span className="ml-2 rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] text-amber-200">Borrador</span> : null}</span>
          <button className="rounded bg-slate-700 px-3 py-1 text-xs" onClick={() => onOpen(ep.seriesId, ep, ep.output?.partNumber || 1)}>Ver</button>
          <button className="text-xs text-slate-400 hover:text-red-300" onClick={() => { if (window.confirm("¿Eliminar el episodio «" + ep.title + "»? Esta acción no se puede deshacer.")) onDelete(ep.id); }}>Eliminar episodio</button>
        </div>;
      })}
    </div>}
  </div>;
}
