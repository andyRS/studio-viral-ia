"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import CopyButton, { DownloadJson, DolaButton } from "./CopyButton";
import PlatformAdaptations from "./PlatformAdaptations";
import AiAuthNotice from "./AiAuthNotice";
import { useData } from "@/lib/DataContext";
import { postApi, isAuthError } from "@/lib/api-client";
import { learnFromMetrics } from "@/lib/learning";
import { buildHookBank } from "@/lib/hooks";
import { useDeleteSeries, confirmDelete } from "@/lib/useDelete";
import HookPicker from "./HookPicker";
import IdeasPanel from "./IdeasPanel";
import FlowSendButton from "./FlowSendButton";
import type { StoryIdea } from "@/lib/ideas";
import SceneDesk from "./SceneDesk";
import { STYLES, type StyleKey } from "@/lib/knowledge";
import { templateSeries, templateNext } from "@/lib/story";
import { isGenericName } from "@/lib/cast";
import { buildFlowBatch, refreshPrompts, PROMPT_RULES_VERSION, sceneCountFor } from "@/lib/production";
import { seriesSignals } from "@/lib/seriesSignals";
import { stylePublish, formatDescription, viralHashtags } from "@/lib/platforms";
import { profileText } from "@/lib/profiles";

type View = "inicio" | "nueva" | "continuar" | "resultado";
type EpisodeTab = "guion" | "elenco" | "imagenes" | "animacion" | "mesa" | "redes" | "plataformas" | "archivos";
// Lo que hay dentro de cada episodio, en el orden de trabajo (accesos directos del centro de series).
const EPISODE_SECTIONS: [EpisodeTab, string, string][] = [
  ["guion", "Guion", "Ficha, escenas y diálogos"],
  ["elenco", "Personajes canónicos", "Fichas maestras de los personajes"],
  ["imagenes", "Imágenes", "Prompts de imagen por escena"],
  ["animacion", "Animación", "Prompts de vídeo por escena"],
  ["mesa", "Mesa y montaje", "Revisar clips y montar el vídeo"],
  ["redes", "Redes", "Títulos, descripciones y hashtags"],
];
const STEP: Partial<Record<EpisodeTab, number>> = { elenco: 1, imagenes: 2, animacion: 3, mesa: 4 };
const isDraft = (e: any) => e.status === "Borrador" || e.output?.mode === "plantilla-local";
// Un episodio queda «Terminado» (y bloqueado) al descargar su vídeo final.
const FINISHED = "Terminado";
const isFinished = (e: any) => e?.status === FINISHED;
// Cliffhanger con el que cerró un episodio: lo retoma la parte siguiente.
const cliffhangerOf = (out: any) => String(out?.ficha?.closing || out?.ficha?.cierre || (Array.isArray(out?.scenes) && out.scenes.length ? out.scenes[out.scenes.length - 1].line : "") || "").trim();
// Texto corto y hashtags para Facebook y TikTok: la adaptación guardada o, si no hay, la fórmula del estilo.
function publishPack(out: any, style: string, part: number, seriesTitle = "", accountPlatform = "") {
  const ad: any[] = out?.platformAdaptations || out?.platform_adaptations || [];
  const sp = stylePublish(style);
  const title = String(out?.social?.title || out?.title || "").trim();
  // Una cuenta de Instagram (p. ej. @peliculasquenoexisten.rd) publica solo ahí; las demás, Facebook y TikTok.
  const platforms = accountPlatform === "Instagram" ? ["Instagram"] : ["Facebook", "TikTok"];
  return platforms.map(platform => {
    const a = ad.find(x => x?.platform === platform);
    // Los de la IA solo aportan el tema del episodio; el resto es la fórmula de los virales del nicho.
    const hashtags = viralHashtags(style, platform, seriesTitle, [...(a?.hashtags || []), ...(out?.hashtags || [])]);
    const text = String(a?.description || (platform === "TikTok" && out?.social?.tiktokDescription ? `${out.social.tiktokDescription}\n${hashtags.slice(0, 5).join(" ")}` : formatDescription(title, sp.word(part), hashtags))).replace(/#[^\s#]+/g, "").replace(/[ \t]+\n/g, "\n").trim();
    const credit = style === "cine90" && !/higgsfield/i.test(text) ? "\nHecho con @higgsfield.ai" : "";
    return { platform, text: text + credit, hashtags: hashtags.join(" "), extra: platform === "Facebook" ? (a?.topic || sp.topic ? `Tema al publicar: ${a?.topic || sp.topic}` : "") : (a?.bestTime ? `Mejor hora: ${a.bestTime}` : "") };
  });
}
// Duración del vídeo montado; cada escena queda en ~4,5 s tras el recorte (ritmo viral).
const DURATIONS = [40, 48, 64, 72, 80, 88, 96, 104, 128];

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
  const { data, insert, remove, update, mode } = useData();
  const deleteSeries = useDeleteSeries();
  // Ganchos ocultados del banco (se guardan en este navegador).
  const [hiddenHooks, setHiddenHooks] = useState<string[]>([]);
  useEffect(() => { try { setHiddenHooks(JSON.parse(localStorage.getItem("estudio-viral:hiddenHooks") || "[]")); } catch {} }, []);
  const saveHidden = (list: string[]) => { setHiddenHooks(list); try { localStorage.setItem("estudio-viral:hiddenHooks", JSON.stringify(list)); } catch {} };
  const hookKey = (h: string) => h.toLowerCase().replace(/\s+/g, " ").trim();
  const focusedEpisodeRef = useRef<string | null>(null);
  const [view, setView] = useState<View>("inicio");
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState(false);
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<{ episode: any; episodeId: string; seriesId: string; part: number } | null>(null);
  // Pestaña con la que se abre un episodio desde el centro de series (Guion, Personajes canónicos, Mesa…).
  const [openTab, setOpenTab] = useState<EpisodeTab | undefined>(undefined);

  // Historia nueva
  const [idea, setIdea] = useState("");
  const [style, setStyleRaw] = useState<StyleKey>("frutinovela");
  // El estilo es obligatorio: hay que elegirlo antes de crear (no vale el valor por defecto).
  const [styleChosen, setStyleChosen] = useState(false);
  const setStyle = (k: StyleKey) => { setStyleRaw(k); setStyleChosen(true); };
  const [accountId, setAccountId] = useState("");
  const [duration, setDuration] = useState(88);
  const [notes, setNotes] = useState("");
  // «Usar esta idea»: rellena la idea y deja en las notas lo que la IA debe respetar (base bíblica,
  // gancho, objeto, giro y elenco sugeridos). Las notas van a «MI PEDIDO» del prompt maestro.
  const notesFromIdea = (i: StoryIdea) => [
    i.biblicalBase && `Base bíblica: ${i.biblicalBase} (respeta los hechos; los diálogos son dramatización)`,
    i.hook?.length && `Gancho sugerido: ${i.hook.join(" / ")}`,
    i.object && `Objeto que revela: ${i.object}`,
    i.twist && `Giro: ${i.twist}`,
    i.cast?.length && `Elenco sugerido: ${i.cast.map(c => `${c.name}${c.fruit ? ` (${c.fruit})` : ""}${c.role ? `, ${c.role}` : ""}`).join("; ")}`,
  ].filter(Boolean).join(". ");
  // start = true: crea la serie al momento con esa idea; si no, solo la pasa al formulario y lleva hasta él.
  const useIdea = (i: StoryIdea, start = false) => {
    const n = notesFromIdea(i);
    setIdea(i.idea); setNotes(n); setKind("nueva"); setStyleChosen(true);
    if (start) { void createStory({ idea: i.idea, notes: n }); return; }
    setNotice("Idea pasada al formulario: revísala y pulsa «Crear serie y episodio 1».");
    setTimeout(() => document.getElementById("generator-idea")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  };
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
  const bankAll = useMemo(() => buildHookBank(data.episodes, data.metrics), [data.episodes, data.metrics]);
  const bank = useMemo(() => bankAll.filter(h => !hiddenHooks.includes(hookKey(h.hook))), [bankAll, hiddenHooks]);
  const bankTop = bank.slice(0, 10).map(h => ({ gancho: h.hook, vistas: h.views, plataformas: h.platforms }));
  const account = data.accounts.find((a: any) => a.id === accountId) || data.accounts[0];
  // Perfil de cuenta: se manda a la IA en todo lo que se genera para esa cuenta (y su elenco fijo compartido).
  const profileOf = (accId?: string) => (data.accountProfiles || []).find((p: any) => p.accountId === accId);
  const sharedCastOf = (accId?: string) => {
    const sids = new Set(data.series.filter((x: any) => x.accountId && x.accountId === accId).map((x: any) => x.id));
    const seen = new Set<string>();
    return data.characters.filter((c: any) => sids.has(c.seriesId) && c.imageUrl && c.referenceApprovedAt && !seen.has(c.name.toLowerCase()) && seen.add(c.name.toLowerCase()));
  };
  const profileFor = (accId?: string) => profileText(profileOf(accId), sharedCastOf(accId));
  // Al elegir una cuenta con perfil, el estilo y la duración se ajustan a ella (p. ej. cine de los 90, 40 s en Instagram).
  useEffect(() => {
    const p = profileOf(account?.id); if (!p) return;
    if (p.style) setStyle(p.style as StyleKey);
    if (p.platform === "Instagram") setDuration(40);
  }, [account?.id, data.accountProfiles]);

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
      title: ep.title || `Episodio ${part}`, theme: ep.summary || ep.title || "", duration: ep.duration || duration, status: ep.mode === "plantilla-local" || ep.mode === "gemini-borrador" ? "Borrador" : "Guion",
      previousSummary: "", accountId: account?.id, seriesId: sid, createdAt: new Date().toISOString(),
      versions: [output], output, platformAdaptations: ep.platformAdaptations || [], platform_adaptations: ep.platformAdaptations || [],
    });
    return { output, episodeId: saved.id as string };
  }

  async function createStory(override?: { idea: string; notes: string }) {
    const idea_ = override?.idea ?? idea, notes_ = override?.notes ?? notes, kind_ = override ? "nueva" : kind;
    if (!styleChosen && !override) { setNotice("Elige primero el estilo de la historia."); return; }
    if (!idea_.trim() && !(kind_ === "replica" && replica.trim())) { setNotice(kind === "replica" ? "Describe el viral que quieres replicar." : "Escribe la idea de la historia o elige una de las sugerencias."); return; }
    setLoading(true); setNotice(""); setAuthError(false);
    try {
      const body = { idea: idea_, style, duration, account, notes: notes_, learnings, chosenHook, replica: kind_ === "replica" ? replica : "", accountProfile: profileFor(account?.id) };
      const res = await call("/api/series", body, () => templateSeries(body)); if (!res) return;
      const d = res.data;
      const s = await insert("series", { title: d.series?.title || idea_.slice(0, 60), description: d.series?.logline || idea_, accountId: account?.id });
      // Elenco fijo de la cuenta: si la IA reutiliza a un personaje compartido, se copia su ficha aprobada.
      const shared = sharedCastOf(account?.id);
      for (const c of d.characters || []) {
        const m = shared.find((x: any) => x.name.toLowerCase() === String(c.name).toLowerCase());
        if (m) { const { id: _id, seriesId: _sid, ...master } = m; await insert("characters", { ...c, ...master, seriesId: s.id }); }
        else await insert("characters", { ...c, seriesId: s.id });
      }
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
        // Si no se pide nada, se sigue el plan guardado de la serie para esa parte (p. ej. «Parte 6: …»).
        series: { title: current.title, logline: current.description }, bible, style: bible.style, partNumber: part, wish: wish.trim() || String(bible?.plan?.[part] || ""), duration, account: data.accounts.find((a: any) => a.id === current.accountId) || account, learnings, chosenHook,
        accountProfile: profileFor(current.accountId),
        characters: currentCast.map((c: any) => ({ name: c.name, role: c.role, fruit: c.fruit, fruitEmoji: c.fruitEmoji, headES: c.headES, visualES: c.visualES, visualEN: c.visualEN, clothing: c.clothing, voice: c.voice, subtitleColor: c.subtitleColor, speechStyle: c.speechStyle, pronunciations: c.pronunciations, flowPrompt: c.flowPrompt })),
        // El último cierre (cliffhanger) va explícito: la parte nueva arranca justo ahí y termina con un gancho aún más fuerte.
        history: eps.map((e: any, i: number) => ({ part: i + 1, title: e.title, summary: e.output?.summary || e.theme, cliffhanger: cliffhangerOf(e.output) })),
        signatureSong: [...eps].reverse().find((e: any) => e.output?.social?.music)?.output?.social?.music || "",
      };
      const res = await call("/api/next-episode", body, () => templateNext(body)); if (!res) return;
      for (const c of res.data.newCharacters || []) await insert("characters", { ...c, seriesId: current.id });
      const saved = await saveEpisode(current.id, part, res.data.episode, bible);
      setResult({ episode: saved.output, episodeId: saved.episodeId, seriesId: current.id, part }); setView("resultado"); setWish(""); setChosenHook(null);
      setNotice([res.note, (res.data.newCharacters || []).length ? `Personajes nuevos añadidos: ${res.data.newCharacters.map((c: any) => c.name).join(", ")}.` : ""].filter(Boolean).join(" "));
    } catch (error: any) { setNotice(`No se pudo guardar el episodio: ${error?.message || String(error)}`); }
    finally { setLoading(false); }
  }

  function openEpisode(sid: string, ep: any, part: number, tab?: EpisodeTab) { setSeriesId(sid); setOpenTab(tab); setResult({ episode: ep.output || {}, episodeId: ep.id, seriesId: sid, part }); setView("resultado"); setNotice(""); window.scrollTo?.({ top: 0, behavior: "smooth" }); }
  function openSeries(sid: string) { setSeriesId(sid); setView("continuar"); setNotice(""); setWish(""); setChosenHook(null); }
  // Serie de una cuenta de Instagram con perfil: el episodio siguiente sale a 40 s (formato de esa cuenta).
  useEffect(() => { if (view === "continuar" && current && profileOf(current.accountId)?.platform === "Instagram") setDuration(40); }, [view, current?.id]);
  // En «Continuar» siempre hay una serie abierta: la última trabajada si no se eligió otra.
  useEffect(() => { if (view === "continuar" && !current && seriesList.length) setSeriesId(seriesList[0].id); }, [view, current, seriesList]);
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
          <button onClick={() => openSeries(seriesList[0]?.id || "")} disabled={!seriesList.length} className="choice-card group">
            <span className="choice-icon bg-violet-500/20 text-violet-200">▶</span>
            <span className="text-lg font-bold">Continuar una serie</span>
            <span className="text-sm text-slate-400">{seriesList.length ? `Abre cualquiera de tus ${seriesList.length} series, entra en sus episodios o crea el siguiente.` : "Aún no tienes series. Crea la primera."}</span>
          </button>
        </div>
        {!!bank.length && <>
          <h3 className="mt-8 text-sm font-semibold uppercase tracking-wider text-slate-400">🎣 Banco de ganchos</h3>
          <div className="mt-3 overflow-x-auto rounded-xl bg-[#121826]"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-slate-400"><th className="p-2">Gancho</th><th className="p-2">Episodio</th><th className="p-2">Vistas</th><th className="p-2">Plataformas</th><th className="p-2"></th></tr></thead>
            <tbody>{bank.slice(0, 12).map((h, i) => <tr key={i} className="border-t border-slate-800"><td className="p-2 font-medium">{h.hook}</td><td className="p-2 text-slate-400">{h.source}</td><td className="p-2">{h.views ? h.views.toLocaleString() : <span className="text-slate-500">sin métricas</span>}</td><td className="p-2 text-xs text-slate-400">{h.platforms.join(", ") || "—"}</td><td className="p-2 text-right"><button type="button" onClick={() => saveHidden([...hiddenHooks, hookKey(h.hook)])} className="text-xs text-slate-400 hover:text-red-300" title="Ocultar este gancho del banco y de las sugerencias">Ocultar</button></td></tr>)}</tbody></table></div>
          <p className="mt-1 text-xs text-slate-500">Registra las vistas en Métricas con el mismo título del episodio para revisar qué ganchos rindieron más.{hiddenHooks.length > 0 && <> · <button type="button" onClick={() => saveHidden([])} className="text-sky-300 hover:text-sky-200">Mostrar {hiddenHooks.length} oculto(s)</button></>}</p>
        </>}
        {!!seriesList.length && <>
          <h3 className="mt-8 text-sm font-semibold uppercase tracking-wider text-slate-400">Tus series</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {seriesList.map((s: any) => <SeriesCard key={s.id} s={s} chars={data.characters.filter((c: any) => c.seriesId === s.id)} onOpen={() => openSeries(s.id)} onDelete={() => { void deleteSeries(s); }} />)}
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
            <div className="mt-3"><IdeasPanel style={style} accountProfile={profileFor(account?.id)} online={mode === "supabase"} existing={data.series.map((x: any) => `${x.title}. ${x.description || ""}`)} onUse={useIdea} busy={loading} /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label htmlFor="generator-account" className="field-label block">Cuenta principal</label>
              <select id="generator-account" value={account?.id || ""} onChange={e => setAccountId(e.target.value)}>{data.accounts.map((a: any) => <option key={a.id} value={a.id}>{a.name} · {a.platform}</option>)}</select></div>
            <div><label htmlFor="generator-duration" className="field-label block">Duración del vídeo montado</label>
              <select id="generator-duration" value={duration} onChange={e => setDuration(Number(e.target.value))}>{DURATIONS.map(d => <option key={d} value={d}>{d} s · {sceneCountFor(d)} escenas</option>)}</select></div>
          </div>
          <div><label htmlFor="generator-notes" className="field-label block">Notas opcionales</label>
            <input id="generator-notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ej.: que la abuela se llame Doña Guanábana, que pase en Navidad…" /></div>
          <HookPicker online={mode === "supabase"} chosen={chosenHook} onChoose={setChosenHook} body={() => ({ idea, style, learnings, bank: bankTop, accountProfile: profileFor(account?.id) })} />
          <button disabled={loading} onClick={() => { void createStory(); }} className="w-full rounded bg-amber-500 px-5 py-3 text-base font-bold sm:w-auto">{loading ? "Creando la serie…" : "Crear serie y episodio 1"}</button>
        </div>
      </>}

      {view === "continuar" && <>
        <Back />
        <div className="flex flex-wrap items-end gap-3">
          <div><p className="field-label !mb-1">Tus series</p><h2 className="text-xl font-bold">Elige una serie y entra en sus episodios</h2></div>
          <button type="button" onClick={() => setView("nueva")} className="ml-auto rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-amber-400/60 hover:text-white">＋ Nueva serie</button>
        </div>
        {/* Todas las series a la vista: se cambia de una a otra sin volver atrás. */}
        <div role="tablist" aria-label="Series" className="series-strip mt-4">
          {seriesList.map((s: any) => {
            const active = s.id === current?.id;
            return <button key={s.id} role="tab" aria-selected={active} onClick={() => openSeries(s.id)} className={`series-tab ${active ? "series-tab-active" : ""}`}>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-300/80">{STYLES[s.style as StyleKey]?.label || "Serie"}</span>
              <span className="block truncate font-bold">{s.title}</span>
              <span className="text-xs text-slate-400">{s.eps.length} episodio{s.eps.length === 1 ? "" : "s"}{s.last ? ` · último: ${s.last.title}` : ""}</span>
            </button>;
          })}
        </div>
        {current && (
          <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_340px]">
            <div className="space-y-4 min-w-0">
              <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#1a2236] to-[#121826] p-5">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-300/80">{STYLES[current.style as StyleKey]?.label || "Serie"}</p>
                    <h3 className="mt-1 text-2xl font-bold">{current.title}</h3>
                    {current.description && <p className="mt-1 text-sm text-slate-300">{current.description}</p>}
                  </div>
                  <button type="button" onClick={async () => { if (await deleteSeries(current)) { setSeriesId(""); setView("inicio"); } }} className="text-xs text-slate-500 hover:text-red-300">Eliminar serie</button>
                </div>
                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                  <span className="stat-chip">🎬 {current.eps.length} episodio{current.eps.length === 1 ? "" : "s"}</span>
                  <span className="stat-chip">👥 {currentCast.length} personajes</span>
                  <span className={`stat-chip ${missingCurrentMasters.length ? "!border-amber-400/40 !text-amber-200" : "!border-emerald-400/40 !text-emerald-200"}`}>{missingCurrentMasters.length ? `Fichas maestras: faltan ${missingCurrentMasters.length}` : "✓ Fichas maestras aprobadas"}</span>
                </div>
              </div>
              {currentNeedsRepair && <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
                <p className="font-bold">Esta serie necesita un guion y personajes validados antes de continuar.</p>
                <p className="mt-1 text-xs leading-5">El borrador anterior se conserva. Gemini puede crear una serie nueva desde la misma idea, con apariencia y vestuario consistentes.</p>
                <button onClick={() => { setIdea(current.description || current.title); setStyle(current.style); setView("nueva"); setNotice(""); }} className="mt-3 rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-slate-950">Recrear serie con Gemini</button>
              </div>}

              <section>
                <h3 className="field-label">Episodios · haz clic para abrir</h3>
                <div className="grid gap-3">
                  {current.eps.map((e: any, i: number) => <EpisodeCard key={e.id} ep={e} part={i + 1} onOpen={(tab?: EpisodeTab) => openEpisode(current.id, e, i + 1, tab)} />)}
                  {!current.eps.length && <p className="rounded-xl border border-dashed border-white/15 p-4 text-sm text-slate-400">Esta serie aún no tiene episodios. Crea el primero abajo.</p>}
                </div>
              </section>

              {!!currentSignals.length && <div className="rounded-xl border border-white/10 bg-[#151C2B] p-4"><h3 className="text-sm font-bold">Rendimiento de las partes</h3><p className="mt-1 text-xs text-slate-400">Vistas registradas de episodios vinculados, separadas por plataforma.</p><div className="mt-3 space-y-3">{currentSignals.map(signal => <div key={signal.platform} className="rounded-lg bg-black/20 p-3 text-xs"><b>{signal.platform}</b><p className="mt-1 text-slate-200">{signal.parts.map(p => `Parte ${p.part}: ${p.views.toLocaleString("es")} vistas`).join(" → ")}</p><p className={`mt-2 ${signal.suggestFreshStart ? "text-amber-200" : "text-slate-400"}`}>{signal.suggestFreshStart ? "Tres partes caen con ventanas comparables. Considera cerrar esta historia y probar una Parte 1 nueva." : signal.comparable ? "Sin señal suficiente para recomendar cerrar la serie." : "Las fechas de captura no permiten comparar las partes a la misma edad; no se recomienda cerrar la serie con estos datos."}</p></div>)}</div></div>}

              <section className="rounded-2xl border border-amber-400/25 bg-amber-400/[.05] p-5">
                <div className="flex items-center gap-3">
                  <span className="choice-icon !mb-0 bg-gradient-to-br from-amber-400 to-orange-600 text-black">＋</span>
                  <div><h3 className="font-bold">Siguiente: episodio {current.eps.length + 1}</h3><p className="text-xs text-slate-400">Con los mismos personajes y siguiendo lo que pasó antes.</p></div>
                </div>
                {current.last && cliffhangerOf(current.last.output) && <p className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-slate-300"><span className="text-xs font-semibold uppercase tracking-wider text-amber-300">La parte {current.eps.length} terminó con</span><br /><i>«{cliffhangerOf(current.last.output)}»</i><br /><span className="text-xs text-slate-400">El episodio {current.eps.length + 1} lo retoma en la primera escena y cierra con un gancho nuevo para que pidan la siguiente parte.</span></p>}
                {!!missingCurrentMasters.length && !currentNeedsRepair && <p className="mt-3 rounded-lg border border-amber-400/25 bg-amber-400/10 p-3 text-xs text-amber-100">Antes, aprueba la ficha maestra de: {missingCurrentMasters.map(c => c.name).join(", ")}. {current.eps.length > 0 && <button type="button" onClick={() => openEpisode(current.id, current.eps[0], 1, "elenco")} className="font-semibold text-amber-300 underline">Ir a Personajes canónicos →</button>}</p>}
                {!wish.trim() && current.eps[0]?.output?.seriesBible?.plan?.[current.eps.length + 1] && <p className="mt-3 rounded-lg border border-sky-400/25 bg-sky-400/[.06] p-3 text-xs text-sky-100"><b>Plan guardado para la parte {current.eps.length + 1}:</b> {current.eps[0].output.seriesBible.plan[current.eps.length + 1]} <span className="text-sky-200/70">(se usa si dejas el campo vacío)</span></p>}
                <label htmlFor="generator-next-wish" className="field-label mt-4 block">¿Qué quieres que pase? (opcional)</label>
                <textarea id="generator-next-wish" value={wish} onChange={e => setWish(e.target.value)} placeholder="Déjalo vacío y la IA propone un giro." />
                <div className="mt-3"><HookPicker online={mode === "supabase"} chosen={chosenHook} onChoose={setChosenHook} body={() => ({ wish, accountProfile: profileFor(current.accountId), style: current.style, series: { title: current.title, logline: current.description }, characters: currentChars.map((c: any) => ({ name: c.name })), history: current.eps.map((e: any, i: number) => ({ part: i + 1, summary: e.output?.summary || e.theme })), learnings, bank: bankTop })} /></div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <label htmlFor="generator-next-duration" className="sr-only">Duración del próximo episodio</label>
                  <select id="generator-next-duration" value={duration} onChange={e => setDuration(Number(e.target.value))} className="w-auto">{DURATIONS.map(d => <option key={d} value={d}>{d} s · {sceneCountFor(d)} escenas</option>)}</select>
                  <button disabled={loading} onClick={continueStory} className="rounded-lg bg-amber-500 px-5 py-2.5 font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-60">{loading ? "Escribiendo…" : `Crear episodio ${current.eps.length + 1} →`}</button>
                </div>
              </section>
            </div>
            <aside className="rounded-2xl border border-white/10 bg-[#121826] p-4 lg:sticky lg:top-4 lg:self-start">
              <p className="field-label">Personajes fijos ({currentCast.length})</p>
              <ul className="space-y-3">
                {currentCast.map((c: any) => {
                  const saved = currentChars.find((x: any) => x.name.toLowerCase() === String(c.name).toLowerCase());
                  const ok = !!saved?.imageUrl && !!saved?.referenceApprovedAt;
                  return <li key={c.name} className="flex gap-3">
                    {saved?.imageUrl
                      ? <img src={saved.imageUrl} alt={`Ficha de ${c.name}`} className="h-12 w-12 shrink-0 rounded-xl object-cover ring-2" style={{ ["--tw-ring-color" as any]: saved.subtitleColor || c.subtitleColor }} />
                      : <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-lg font-bold text-slate-950" style={{ background: saved?.subtitleColor || c.subtitleColor || "#64748b" }}>{String(c.name).charAt(0)}</span>}
                    <span className="min-w-0 text-sm">
                      <b className="block">{c.name}</b>
                      <span className={`text-[11px] ${ok ? "text-emerald-300" : "text-amber-300"}`}>{ok ? "✓ Ficha aprobada" : "Ficha pendiente"}</span>
                      <span className="mt-0.5 block line-clamp-2 text-xs text-slate-400" title={saved?.visualES || c.visualES}>{saved?.visualES || c.visualES}</span>
                    </span>
                  </li>;
                })}
              </ul>
              <p className="mt-4 text-xs text-slate-500">Se usan idénticos en cada episodio. Edítalos en Personajes.</p>
            </aside>
          </div>
        )}
      </>}

      {view === "resultado" && result && <Result
        episode={result.episode} episodeId={result.episodeId} seriesId={result.seriesId} part={result.part} seriesTitle={data.series.find((s: any) => s.id === result.seriesId)?.title} initialTab={openTab || focusTab}
        status={data.episodes.find((e: any) => e.id === result.episodeId)?.status}
        onFinish={async () => { if (result.episodeId && !isFinished(data.episodes.find((e: any) => e.id === result.episodeId))) await update("episodes", result.episodeId, { status: FINISHED }); }}
        onUnlock={async () => { if (result.episodeId && window.confirm("¿Desbloquear este episodio para volver a editarlo?")) await update("episodes", result.episodeId, { status: "Guion" }); }}
        backLabel={data.series.find((s: any) => s.id === result.seriesId)?.title}
        onBack={() => { if (result.seriesId && data.series.some((s: any) => s.id === result.seriesId)) openSeries(result.seriesId); else setView("inicio"); }} onNext={() => { setSeriesId(result.seriesId); setView("continuar"); }}
        onRefreshPrompts={async () => {
          // Rehace los prompts con las reglas actuales, sin IA: el guion, las escenas y los personajes no cambian.
          const firstBible = data.episodes.find((e: any) => e.seriesId === result.seriesId && e.output?.seriesBible?.style)?.output?.seriesBible;
          const st = (result.episode?.seriesBible?.style || firstBible?.style || (result.episode?.cast?.some((c: any) => c.fruit) ? "frutinovela" : "cine90")) as StyleKey;
          // El acento (y la forma de hablar) que se edita en Personajes manda sobre la copia del episodio.
          const masters = data.characters.filter((c: any) => c.seriesId === result.seriesId);
          const cast = (result.episode?.cast || []).map((c: any) => { const m = masters.find((x: any) => x.name.toLowerCase() === String(c.name).toLowerCase()); return m?.speechStyle ? { ...c, speechStyle: m.speechStyle } : c; });
          const output = refreshPrompts({ ...result.episode, cast }, st);
          if (result.episodeId) await update("episodes", result.episodeId, { output });
          setResult({ ...result, episode: output });
          setNotice("Prompts actualizados con las reglas nuevas. El guion y los personajes no cambiaron; vuelve a enviar el lote a Flow si ya lo habías enviado.");
        }}
        onDelete={async () => { if (!result.episodeId || !confirmDelete(`el episodio «${result.episode?.title || "sin título"}»`)) return; await remove("episodes", result.episodeId); setResult(null); setView("inicio"); }}
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
    ...cast.flatMap((c: any) => [`### ${c.fruitEmoji ? c.fruitEmoji + " " : ""}${c.name}${c.fruit ? ` — ${c.fruit}` : ""}`, `- Rol: ${c.role || "—"}`, c.headES ? `- Aspecto: ${c.headES}` : `- Apariencia: ${c.visualES || "—"}`, `- Ropa fija: ${c.clothing || "—"}`, `- Voz: ${c.voice || c.speechStyle || "—"}`, `- Pronunciaciones: ${(c.pronunciations || []).join("; ") || "—"}`, `- Color de subtítulo: ${String(c.subtitleColor || "").replace("#", "")}`, "", "Prompt de ficha para Flow:", "```", c.flowPrompt || "", "```", ""]),
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

function Result({ episode: out, episodeId, seriesId, part, seriesTitle, initialTab, status, onFinish, onUnlock, backLabel, onBack, onNext, onRecreate, onDelete, onRefreshPrompts }: any) {
  type Tab = "guion" | "elenco" | "imagenes" | "animacion" | "mesa" | "redes" | "plataformas" | "archivos";
  const { data, update } = useData();
  const cast: any[] = Array.isArray(out.cast) ? out.cast : [];
  const scenes: any[] = Array.isArray(out.scenes) ? out.scenes : [];
  const ficha = out.ficha || null; const social = out.social || null;
  const [tab, setTab] = useState<Tab>("guion");
  const finished = status === FINISHED;
  // Terminado: se puede ver, publicar y descargar textos, pero no editar fichas, prompts ni la mesa.
  const lockedTab = finished && (tab === "elenco" || tab === "imagenes" || tab === "animacion" || tab === "mesa");
  const pack = useMemo(() => publishPack(out, out.seriesBible?.style || (cast.some((c: any) => c.fruit) ? "frutinovela" : "cine90"), part, seriesTitle || "", data.accounts.find((a: any) => a.id === data.series.find((x: any) => x.id === seriesId)?.accountId)?.platform || ""), [out, part, seriesTitle, data.accounts, data.series, seriesId]);
  const [reviewed, setReviewed] = useState(false);
  useEffect(() => { setReviewed(false); setTab(initialTab || "guion"); }, [out, initialTab]);
  const fromAI = !!out.mode && out.mode !== "plantilla-local" && out.mode !== "gemini-borrador" && cast.length >= 2;
  const isTemplate = out.mode === "plantilla-local";
  const isAIDraft = out.mode === "gemini-borrador";
  const master = cast.map(c => data.characters.find(x => x.seriesId === seriesId && x.name.toLowerCase() === String(c.name).toLowerCase()));
  const referencesReady = !!cast.length && master.every(c => !!c?.imageUrl && !!c?.referenceApprovedAt);
  const snapshotValid = !!out.referenceVersions && master.every((c, i) => Number(c?.referenceVersion || 1) === Number(out.referenceVersions[String(cast[i].name).toLowerCase()]));
  const productionReady = referencesReady && snapshotValid;
  const episodeStyle: string = out.seriesBible?.style || (/escribe am[eé]n/i.test(scenes.at(-1)?.line || "") ? "cristiana" : cast.some(c => c.fruit) ? "frutinovela" : "cine90");
  const promptsOutdated = scenes.length > 0 && Number(out.promptsVersion || 1) < PROMPT_RULES_VERSION;
  const [refreshing, setRefreshing] = useState(false);
  async function refresh() { setRefreshing(true); try { await onRefreshPrompts?.(); } finally { setRefreshing(false); } }
  const referenceSignature = master.map(c => `${c?.id || "missing"}:${c?.referenceVersion || 0}`).join("|");
  const missingMasters = cast.filter((_, i) => !master[i]?.imageUrl || !master[i]?.referenceApprovedAt).map(c => c.name);
  // Duración del vídeo montado (clips recortados a su frase); los episodios antiguos muestran la de sus clips.
  const fullDuration = out.editDuration || out.duration || scenes.length * 8 || (out.scriptBlocks || []).length * 15;
  const dolaDuration = out.dolaDuration || 60;
  const sec = scenes.length ? 8 : 15;
  const lote = useMemo(() => buildFlowBatch(out), [out]);
  const tabs: [Tab, string][] = [["guion", "Guion"], ...(cast.length ? [["elenco", "1 · Personajes canónicos"]] as [Tab, string][] : []), ...(scenes.length && cast.length >= 2 ? [["imagenes", "2 · Imágenes"], ["animacion", "3 · Animación"], ["mesa", "4 · Mesa y montaje"]] as [Tab, string][] : []), ...(social ? [["redes", "Redes"]] as [Tab, string][] : []), ["plataformas", "Plataformas"], ...(!isTemplate ? [["archivos", "Archivos"]] as [Tab, string][] : [])];
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
    <button onClick={onBack} className="mb-4 text-sm text-slate-400 hover:text-white">← {backLabel ? `Serie: ${backLabel}` : "Inicio"}</button>
    <div className="flex flex-wrap items-start gap-3">
      <div className="flex-1 min-w-[220px]">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-300/80">{seriesTitle} · Episodio {part}</p>
        <h2 className="text-xl font-bold">{out.title || `Episodio ${part}`}</h2>
        {out.summary && <p className="mt-1 text-sm text-slate-400">{out.summary}</p>}
      </div>
      <span className="flex items-center gap-3">{finished && <span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-200">🔒 Terminado</span>}{!finished && scenes.length > 0 && <button type="button" onClick={refresh} disabled={refreshing} title="Rehace los prompts de imagen, animación y Dola con las reglas actuales, sin IA y sin tocar el guion" className="text-xs text-slate-400 hover:text-amber-300 disabled:opacity-50">{refreshing ? "Actualizando…" : "Actualizar prompts"}</button>}{episodeId && !finished && <button type="button" onClick={onDelete} className="text-xs text-slate-400 hover:text-red-300">Eliminar episodio</button>}
      <button onClick={onNext} className="rounded bg-amber-500 px-4 py-2 text-sm font-bold">Crear episodio {part + 1} →</button></span>
    </div>
    <div className={`mt-4 rounded-xl border p-4 text-sm ${fromAI ? "border-emerald-400/25 bg-emerald-400/[.07] text-emerald-100" : "border-amber-400/30 bg-amber-400/[.08] text-amber-100"}`}>
      <p className="font-bold">{out.mode === "importado" ? "Parte publicada e importada · solo lectura" : out.mode === "guion-manual" ? `Guion escrito · ${cast.length} personajes · ${(out.scriptBlocks || []).length} bloques · pendiente de producción` : fromAI ? `Guion escrito por la IA · ${cast.length} personajes · ${scenes.length || (out.scriptBlocks || []).length} escenas · ${fullDuration} s` : isTemplate ? "Borrador de la plantilla local (sin IA)" : isAIDraft ? "Borrador de Gemini · pendiente de corregir" : "Borrador anterior sin elenco de producción"}</p>
      <p className="mt-1 text-xs leading-5">{fromAI ? "Orden de trabajo: aprueba las fichas maestras → genera imágenes con esas referencias → anima y revisa cada escena → monta el vídeo." : isTemplate ? "Elenco de frutas, escenas, prompts y montaje completos, pero el diálogo es de estructura genérica: revísalo antes de producir o recréalo con la IA cuando esté disponible." : isAIDraft ? `Se conservaron las escenas y personajes de Gemini, pero ${out.qualityIssues?.join("; ") || "el guion necesita revisión"}. Revísalo antes de producir o recréalo con la IA.` : "Este episodio se creó con una versión anterior. Recréalo para tener el elenco y las escenas de producción."}</p>
      {!fromAI && <button onClick={onRecreate} className="mt-3 rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400">Recrear con la IA</button>}
      {out.shortForLongPlatforms && <p className="mt-2 text-xs">{out.shortForLongPlatforms}</p>}
    </div>
    {finished && <section className="mt-4 rounded-2xl border border-emerald-400/30 bg-gradient-to-br from-emerald-400/10 to-transparent p-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-[220px] flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-300">Parte {part} terminada · vídeo descargado</p>
          <h3 className="mt-1 text-lg font-bold">Ahora publica y crea la Parte {part + 1}</h3>
          {cliffhangerOf(out) && <p className="mt-1 text-sm text-slate-300">El público se quedó con: <i>«{cliffhangerOf(out)}»</i>. La Parte {part + 1} arranca justo ahí y cierra con un gancho aún más fuerte.</p>}
        </div>
        <span className="flex flex-col items-end gap-2">
          <button type="button" onClick={onNext} className="rounded-lg bg-amber-500 px-5 py-2.5 font-bold text-slate-950 hover:bg-amber-400">Crear Parte {part + 1} →</button>
          <button type="button" onClick={onUnlock} className="text-xs text-slate-400 hover:text-white">Desbloquear para editar</button>
        </span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">{pack.map(p => <div key={p.platform} className="rounded-xl border border-white/10 bg-[#121826] p-4">
        <p className="font-bold">{p.platform === "Facebook" ? "📘" : p.platform === "Instagram" ? "📸" : "🎵"} {p.platform}</p>
        <p className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Texto corto</p>
        <p className="mt-1 whitespace-pre-line text-sm">{p.text}</p>
        <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Hashtags</p>
        <p className="mt-1 text-sm text-sky-200">{p.hashtags}</p>
        {p.extra && <p className="mt-2 text-xs text-slate-400">{p.extra}</p>}
        <div className="mt-3 flex flex-wrap gap-2"><CopyButton text={p.text} label="Copiar texto" /><CopyButton text={p.hashtags} label="Copiar hashtags" /></div>
      </div>)}</div>
    </section>}
    {promptsOutdated && !finished && <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-sky-400/30 bg-sky-400/10 p-3 text-xs text-sky-100"><span className="flex-1 min-w-[220px]">Hay reglas nuevas para los prompts (ritmo viral: hablan desde el primer segundo, sin pausas y sin música dentro del clip). Este episodio tiene los prompts de una versión anterior.</span><button type="button" onClick={refresh} disabled={refreshing} className="rounded-lg bg-sky-400 px-3 py-1.5 font-bold text-slate-950 hover:bg-sky-300 disabled:opacity-50">{refreshing ? "Actualizando…" : "Actualizar prompts"}</button></div>}
    {scenes.length > 0 && cast.length >= 2 && !referencesReady && <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-100">Faltan fichas maestras aprobadas: {missingMasters.join(", ")}. Súbelas y apruébalas en «1 · Personajes canónicos» antes de producir.</div>}
    {scenes.length > 0 && cast.length >= 2 && referencesReady && !snapshotValid && <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-100">La ficha maestra cambió desde que se creó este guion, o el episodio es anterior al control de versiones. Regenera el episodio para alinear prompts y personajes.</div>}
    <div className="tabs mt-5">{tabs.map(([k, l]) => <button key={k} onClick={() => setTab(k)} disabled={(k === "imagenes" || k === "animacion" || k === "mesa") && !productionReady} className={`${tab === k ? "tab-active" : ""} disabled:cursor-not-allowed disabled:opacity-40`}>{l}</button>)}</div>
    {lockedTab && <p className="mt-4 rounded-xl border border-emerald-400/25 bg-emerald-400/[.06] p-3 text-xs text-emerald-100">🔒 Episodio terminado: esta sección queda de solo lectura. Pulsa «Desbloquear para editar» arriba si necesitas cambiar algo.</p>}
    <fieldset disabled={lockedTab} className={`mt-4 min-w-0 ${lockedTab ? "opacity-70" : ""}`}>
      {tab === "guion" && <div className="space-y-3">
        {ficha && <EpisodeSheet ficha={ficha} score={out.selfScore} cast={cast} scenes={scenes.length} seconds={fullDuration} />}
        {!ficha && !!(out.hook || []).length && <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-4"><p className="text-[11px] font-semibold uppercase tracking-wider text-amber-300">Gancho de los primeros 3 s</p><p className="mt-1 text-lg font-bold">{(out.hook || []).join(" / ")}</p></div>}
        {scenes.length ? scenes.map((s: any) => { const c = cast.find((x: any) => x.name === s.speaker); return <article key={s.n} className="rounded-xl bg-[#121826] p-4">
          <p className="text-xs font-semibold text-amber-300">ESCENA {String(s.n).padStart(2, "0")} — {s.title || ""} · {(s.n - 1) * 8}-{s.n * 8} s</p>
          <div className="mt-2 rounded-lg border-l-4 bg-white/[.03] px-3 py-2" style={{ borderColor: c?.subtitleColor || "#94a3b8" }}>
            <p className="text-xs"><span className="mr-1">{c?.fruitEmoji || "🎙️"}</span><b style={{ color: c?.subtitleColor || "#fff" }}>{s.speaker}</b>{s.emotion && <span className="text-slate-400"> · {s.emotion}</span>}</p>
            <p className="mt-0.5 text-base font-medium leading-snug">“{s.line}”</p>
          </div>
          <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs leading-5 sm:grid-cols-2">
            <Field label="Objetivo" value={s.goal} /><Field label="Personajes" value={(s.characters || []).join(", ") || "—"} />
            <Field label="Lugar" value={s.location} /><Field label="Plano" value={s.shot} /><Field label="Acción visual" value={s.setting} />
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
            {c.headES ? <Field label="Aspecto" value={c.headES} /> : <Field label="Apariencia" value={c.visualES} />}
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
          <FlowSendButton title={`${seriesTitle || "Serie"} · ${out.title || `Episodio ${part}`}`} scenes={scenes} cast={cast} master={master} />
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
      {tab === "mesa" && productionReady && <SceneDesk key={episodeId} onDownloaded={onFinish} publish={pack} episodeId={episodeId} scenes={scenes} guion={out.guionJson || {}} title={`${seriesTitle || "serie"} ${part}`} referencesReady={referencesReady} referenceSignature={referenceSignature} style={episodeStyle} part={part} />}
      {(tab === "imagenes" || tab === "animacion" || tab === "mesa") && !productionReady && <p className="rounded-xl border border-amber-400/25 bg-amber-400/10 p-4 text-sm text-amber-100">Revisa los personajes canónicos y la versión de sus fichas maestras antes de continuar.</p>}
    </fieldset>
  </>;
}

// Tarjeta de serie del inicio: toda la tarjeta abre la serie.
function SeriesCard({ s, chars, onOpen, onDelete }: { s: any; chars: any[]; onOpen: () => void; onDelete: () => void }) {
  return <div className="group relative flex flex-col rounded-2xl border border-white/10 bg-[#121826] p-4 transition hover:-translate-y-0.5 hover:border-amber-400/50">
    <button type="button" onClick={onOpen} className="absolute inset-0 rounded-2xl" aria-label={`Abrir la serie ${s.title}`} />
    <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-300/80">{STYLES[s.style as StyleKey]?.label || "Serie"}</p>
    <p className="mt-1 text-lg font-bold">{s.title}</p>
    <p className="mt-1 line-clamp-2 text-sm text-slate-400">{s.last?.output?.summary || s.description}</p>
    <div className="mt-3 flex items-center gap-2">
      <span className="flex -space-x-1.5">{chars.slice(0, 5).map((c: any) => c.imageUrl
        ? <img key={c.id} src={c.imageUrl} alt="" title={c.name} className="h-7 w-7 rounded-full object-cover ring-2 ring-[#121826]" />
        : <span key={c.id} title={c.name} className="grid h-7 w-7 place-items-center rounded-full text-[11px] font-bold text-slate-950 ring-2 ring-[#121826]" style={{ background: c.subtitleColor || "#64748b" }}>{String(c.name).charAt(0)}</span>)}</span>
      <span className="text-xs text-slate-400">{s.eps.length} episodio{s.eps.length === 1 ? "" : "s"}</span>
    </div>
    <div className="pointer-events-none relative mt-auto flex items-center gap-3 pt-4">
      <button type="button" onClick={onDelete} className="pointer-events-auto text-xs text-slate-500 hover:text-red-300">Eliminar</button>
      <span className="ml-auto rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-950 group-hover:bg-amber-400">Abrir serie →</span>
    </div>
  </div>;
}

// Tarjeta de episodio del centro de series: abrir entero o ir directo a una sección.
function EpisodeCard({ ep, part, onOpen }: { ep: any; part: number; onOpen: (tab?: EpisodeTab) => void }) {
  const out = ep.output || {};
  const scenes = Array.isArray(out.scenes) ? out.scenes.length : 0;
  const seconds = out.duration || scenes * 8;
  const hook = Array.isArray(out.guionJson?.gancho) ? out.guionJson.gancho.join(" / ") : "";
  const sections = EPISODE_SECTIONS.filter(([k]) => k === "guion" || (k === "redes" ? !!out.social : scenes > 0 && (k !== "elenco" || (out.cast || []).length > 0)));
  return <article className="rounded-2xl border border-white/10 bg-[#121826] p-4 transition hover:border-amber-400/40">
    <div className="flex flex-wrap items-start gap-3">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-400/15 text-lg font-bold text-amber-300">{part}</span>
      <div className="min-w-[200px] flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Episodio {part}{scenes ? ` · ${scenes} escenas · ${seconds} s` : ""}{isDraft(ep) && <span className="ml-2 rounded-full bg-amber-400/15 px-2 py-0.5 normal-case tracking-normal text-amber-200">Borrador</span>}{isFinished(ep) && <span className="ml-2 rounded-full bg-emerald-400/15 px-2 py-0.5 normal-case tracking-normal text-emerald-200">🔒 Terminado</span>}</p>
        <h4 className="mt-0.5 font-bold">{ep.title}</h4>
        <p className="mt-1 line-clamp-2 text-sm text-slate-400">{out.summary || ep.theme}</p>
        {hook && <p className="mt-2 text-xs text-slate-300"><span className="text-slate-500">Gancho:</span> «{hook}»</p>}
      </div>
      <button type="button" onClick={() => onOpen()} className="w-full rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-amber-400 sm:w-auto">Abrir episodio →</button>
    </div>
    <div className="mt-3 border-t border-white/5 pt-3">
      <p className="mb-2 text-[11px] text-slate-500">Dentro encontrarás · entra directo:</p>
      <div className="flex flex-wrap gap-2">{sections.map(([k, label, hint]) => <button key={k} type="button" onClick={() => onOpen(k)} title={hint} className="section-chip">{STEP[k] && <span className="text-slate-500">{STEP[k]}·</span>}{label}</button>)}</div>
    </div>
  </article>;
}

// Ficha del episodio: gancho destacado, arco en 5 pasos y autoevaluación visual.
const ARC: [string, string, string][] = [
  ["conflict", "Conflicto", "#f97316"], ["development", "Desarrollo", "#eab308"], ["climax", "Clímax", "#ef4444"],
  ["resolution", "Resolución", "#22c55e"], ["closing", "Cierre", "#a78bfa"],
];
function EpisodeSheet({ ficha, score, cast, scenes, seconds }: { ficha: any; score: any; cast: any[]; scenes: number; seconds: number }) {
  const metrics = score ? ([["Gancho 0-1 s", score.hook], ["Claridad sin contexto", score.clarity], ["Escalada", score.escalation], ["Giro final", score.twist], ["Ganas de comentar", score.comments]] as [string, number | null][]).filter(([, v]) => v) : [];
  const avg = metrics.length ? Math.round((metrics.reduce((t, [, v]) => t + Number(v), 0) / metrics.length) * 10) / 10 : 0;
  const steps = ARC.filter(([k]) => ficha[k]);
  return <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#121826]">
    <div className="relative border-b border-white/10 bg-gradient-to-br from-amber-400/15 via-amber-400/[.04] to-transparent p-5">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-[240px] flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[.18em] text-amber-300">Ficha del episodio</p>
          {ficha.synopsis && <p className="mt-2 text-lg font-semibold leading-snug text-white">{ficha.synopsis}</p>}
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {!!seconds && <span className="stat-chip">⏱ {seconds} s</span>}
            {!!scenes && <span className="stat-chip">🎬 {scenes} escenas</span>}
            {!!cast.length && <span className="stat-chip">👥 {cast.map((c: any) => c.name).join(" · ")}</span>}
            {ficha.biblicalBase && <span className="stat-chip !border-sky-400/40 !text-sky-200">📖 {ficha.biblicalBase}</span>}
          </div>
        </div>
        {!!metrics.length && <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/25 p-3">
          <div className="grid h-16 w-16 place-items-center rounded-full text-xl font-black" style={{ background: `conic-gradient(${avg >= 8 ? "#34d399" : "#fb7185"} ${avg * 36}deg, rgba(255,255,255,.08) 0)` }}>
            <span className="grid h-12 w-12 place-items-center rounded-full bg-[#121826]">{avg}</span>
          </div>
          <div className="space-y-1">{metrics.map(([k, v]) => <div key={k} className="flex items-center gap-2 text-[11px] text-slate-300">
            <span className="w-32 truncate">{k}</span>
            <span className="h-1.5 w-16 overflow-hidden rounded-full bg-white/10"><span className={`block h-full ${Number(v) >= 8 ? "bg-emerald-400" : "bg-rose-400"}`} style={{ width: `${Number(v) * 10}%` }} /></span>
            <b className="w-5 text-right">{v}</b>
          </div>)}<p className="pt-0.5 text-[10px] text-slate-500">Autoevaluación de la IA</p></div>
        </div>}
      </div>
    </div>
    {(ficha.hookText || ficha.hookImage) && <div className="grid gap-4 border-b border-white/10 p-5 md:grid-cols-[1fr_auto]">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">🎣 Gancho · primeros 3 segundos</p>
        {ficha.hookText && <p className="mt-2 text-2xl font-black leading-tight text-white">«{ficha.hookText}»</p>}
        {ficha.hookImage && <p className="mt-2 text-sm text-slate-400"><span className="text-slate-500">En pantalla:</span> {ficha.hookImage}</p>}
      </div>
      {ficha.hookText && <div className="self-start"><CopyButton text={ficha.hookText} label="Copiar gancho" /></div>}
    </div>}
    {!!steps.length && <div className="p-5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Arco de la historia</p>
      <ol className="mt-3 grid gap-3 md:grid-cols-5">{steps.map(([k, label, color], i) => <li key={k} className={`relative rounded-xl border bg-white/[.03] p-3 ${k === "closing" ? "border-violet-400/50 bg-violet-400/[.07]" : "border-white/10"}`} style={{ borderTopColor: color, borderTopWidth: 3 }}>
        <p className="flex items-center gap-2 text-xs font-bold" style={{ color }}><span className="grid h-5 w-5 place-items-center rounded-full text-[10px] text-slate-950" style={{ background: color }}>{i + 1}</span>{label}</p>
        <p className="mt-1.5 text-sm leading-snug text-slate-200">{ficha[k]}</p>
      </li>)}</ol>
    </div>}
  </section>;
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
