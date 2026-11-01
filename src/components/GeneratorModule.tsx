"use client";
import { prepararFicha } from "@/lib/imagenFicha";
import { useEffect, useMemo, useRef, useState } from "react";
import SceneDirector from "./SceneDirector";
import { moverEscenaCorta, remapRevisiones } from "@/lib/ordenEscenas";
import { renumerarArchivos } from "@/lib/archivosTrabajo";
import { anotarPunto, leerUltimoPunto, useBorrador } from "@/lib/borradores";
import { SceneRail } from "./NarrativeDesk";
import PromptWorkbench from "./PromptWorkbench";
import CreativeDesk from "./CreativeDesk";
import ReferencePreview from "./ReferencePreview";
import GenerationStatus from "./GenerationStatus";
import { apartar, borrarPendiente, completarCreacion, leerPendiente, type CreacionPendiente } from "@/lib/creacion";
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
import StoryArchitect from "./StoryArchitect";
import { EPIC_NOTICE, STYLES, type StyleKey } from "@/lib/knowledge";
import { normalizarCapitulo, normalizarPersonajes, importarFiel, estiloDeTexto, redirigirEpisodio, vistaPreviaRevision } from "@/lib/importacion";
import { ETIQUETA_CLASE, fuenteDeTexto, fuenteSugerida, type Fuente } from "@/lib/fuentes";
import { aplicarTiempos, planTiempos, type Medicion, type ModoMontaje } from "@/lib/tiempos";
import { medirClip } from "@/lib/medirAudio";
import { aplicarAccion, costeEstimado, planificarAccion, type TomaAccion } from "@/lib/accion";
import { motorDe } from "@/lib/tiempos";
import { conAspecto as conAspectoAccion, refreshPrompts as refrescarAccion } from "@/lib/production";
import { cargarArchivos } from "@/lib/archivosTrabajo";
import { segundosClip } from "@/lib/production";
import { adaptarPersonajesLocal, escenasDelGuion, templateSeries, templateNext } from "@/lib/story";
import { fichaGenerica, isGenericName } from "@/lib/cast";
import { aspectoDe, buildFlowBatch, conAspecto, escenasEnTexto, MAX_SCENES, MIN_SCENES, refreshPrompts, PROMPT_RULES_VERSION, sceneCountFor } from "@/lib/production";
import { seriesSignals } from "@/lib/seriesSignals";
import { stylePublish, formatDescription, sinLlamadas, viralHashtags } from "@/lib/platforms";
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
    // Cristianas: fuera cualquier «comenta / AMÉN / like / sígueme / comparte» (Meta desmonetiza por eso).
    let clean = sp.word(part) ? text : (sinLlamadas(text) || formatDescription(title, "", hashtags));
    if (style === "epica" && !clean.includes(EPIC_NOTICE)) clean += `\n${EPIC_NOTICE}`;   // aviso obligatorio de la épica
    return { platform, text: clean + credit, hashtags: hashtags.join(" "), extra: platform === "Facebook" ? (a?.topic || sp.topic ? `Tema al publicar: ${a?.topic || sp.topic}` : "") : (a?.bestTime ? `Mejor hora: ${a.bestTime}` : "") };
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
  biblica: [
    "José vendido por sus hermanos: un joven traicionado por sus socios del colmado termina dirigiendo la empresa (Génesis 50:20)",
    "La viuda de Sarepta: una madre soltera con el último arroz y aceite ayuda a un desconocido (1 Reyes 17:16)",
    "Daniel en el foso: un empleado cristiano no firma un negocio sucio y lo acusan (Daniel 6:22)",
  ],
  epica: [
    "El criado de Eliseo ve Dotán rodeada por el ejército sirio; el profeta ora y el cielo se llena de carros de fuego (2 Reyes 6:16)",
    "Agar y su hijo mueren de sed en el desierto de Beerseba; el ángel le abre los ojos y ve un pozo (Génesis 21:17)",
    "Enoc, el que caminó con Dios (inspirado en la tradición de Enoc; Génesis 5:24 y Judas 14)",
  ],
  cine90: [
    "Una mujer encuentra en una tienda de antigüedades las cartas de amor que su madre nunca envió",
    "Un taxista lleva cada año, el mismo día, a la misma pasajera al malecón sin saber por qué",
    "Una cantante de boleros reconoce en primera fila al hombre que la dejó plantada en el altar",
  ],
};

export default function GeneratorModule({ focusEpisodeId, focusTab, startNew = false, initialIdea = "", onNavigate }: { focusEpisodeId?: string; focusTab?: "mesa"; startNew?: boolean; initialIdea?: string; onNavigate?: (id: string) => void } = {}) {
  const { data, insert, remove, update, mode, userId } = useData();
  const deleteSeries = useDeleteSeries();
  // Ganchos ocultados del banco (se guardan en este navegador).
  const [hiddenHooks, setHiddenHooks] = useState<string[]>([]);
  useEffect(() => { try { setHiddenHooks(JSON.parse(localStorage.getItem("estudio-viral:hiddenHooks") || "[]")); } catch {} }, []);
  const saveHidden = (list: string[]) => { setHiddenHooks(list); try { localStorage.setItem("estudio-viral:hiddenHooks", JSON.stringify(list)); } catch {} };
  const hookKey = (h: string) => h.toLowerCase().replace(/\s+/g, " ").trim();
  const focusedEpisodeRef = useRef<string | null>(null);
  const [view, setView] = useState<View>(startNew ? "nueva" : "inicio");
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState(false);
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<{ episode: any; episodeId: string; seriesId: string; part: number } | null>(null);
  // Pestaña con la que se abre un episodio desde el centro de series (Guion, Personajes canónicos, Mesa…).
  const [openTab, setOpenTab] = useState<EpisodeTab | undefined>(undefined);

  // Historia nueva
  // Borradores: lo que se escribe aquí sobrevive a cambiar de módulo o recargar (por usuario, 14 días).
  const [idea, setIdea, ideaB] = useBorrador(initialIdea ? "generador:idea-sugerida" : "generador:idea", initialIdea);
  const [style, setStyleRaw] = useState<StyleKey>("frutinovela");
  // El estilo es obligatorio: hay que elegirlo antes de crear (no vale el valor por defecto).
  const [styleChosen, setStyleChosen] = useState(false);
  const setStyle = (k: StyleKey) => { setStyleRaw(k); setStyleChosen(true); };
  const [accountId, setAccountId] = useState("");
  // Serie anclada a un canal: formato y cuentas de otras redes que reciben sus clips.
  const [formato, setFormato] = useState<"corto" | "largo">("corto");
  const [clipIds, setClipIds] = useState<string[]>([]);
  const [duration, setDuration] = useState(88);
  // Escenas elegidas a mano (0 = automático según la duración). Mandan sobre lo que diga el texto de la idea.
  const [escenas, setEscenas] = useState(0);
  const nEscenas = sceneCountFor(duration, escenas);
  const aspectoSerie = (sid?: string) => aspectoDe(data.series.find((x: any) => x.id === sid)?.format);
  // Formato de imagen del episodio: el suyo propio si lo tiene (p. ej. importado en 16:9); si no, el de la serie.
  const aspectoEp = (ep: any, sid?: string): "16:9" | "9:16" => ep?.aspecto === "16:9" || ep?.aspecto === "9:16" ? ep.aspecto : aspectoSerie(sid);
  const [notes, setNotes, notesB] = useBorrador("generador:notas", "");
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
  const [kind, setKind] = useState<TipoPedido>("nueva");
  // «Adaptar guion»: el texto completo de un guion escrito en otra IA (pegado o subido).
  const [guionOtro, setGuionOtro, guionOtroB] = useBorrador("generador:guion-externo", "");
  const [personajesOtro, setPersonajesOtro, personajesOtroB] = useBorrador("generador:personajes-externos", "");
  // Capítulo con la estructura del estudio (capitulo.json): se importa tal cual, sin IA.
  // Capítulo reconocible (clips o scenes con hablante y frase): se puede importar en modo fidelidad.
  const capitulo = useMemo(() => kind === "adaptar" ? normalizarCapitulo(guionOtro) : null, [kind, guionOtro]);
  const biblioteca = useMemo(() => kind === "adaptar" && personajesOtro.trim() ? normalizarPersonajes(personajesOtro) : null, [kind, personajesOtro]);
  const [modoImport, setModoImport] = useState<"fidelidad" | "creativa">("fidelidad");
  const [replica, setReplica] = useBorrador("generador:replica", "");
  // Continuar
  const [seriesId, setSeriesId] = useState("");
  const [wish, setWish] = useBorrador("generador:deseo", "");
  useEffect(() => { if (ideaB.restaurado || notesB.restaurado) setNotice("Recuperé lo que estabas escribiendo la última vez (idea y notas). Bórralo si ya no lo necesitas."); }, [ideaB.restaurado, notesB.restaurado]);
  const [chosenHook, setChosenHook] = useState<string[] | null>(null);

  const episodesOf = (sid: string) => data.episodes.filter((e: any) => e.seriesId === sid).sort((a: any, b: any) => String(a.createdAt).localeCompare(String(b.createdAt)));
  const seriesList = useMemo(() => data.series.map((s: any) => {
    const eps = episodesOf(s.id); const last = eps[eps.length - 1];
    // Estilo: el del primer episodio; si la serie aún no tiene (proyecto largo), el guardado en la serie o el de su cuenta.
    return { ...s, eps, last, style: (eps[0]?.output?.seriesBible?.style || s.style || (data.accountProfiles || []).find((p: any) => p.accountId === s.accountId)?.style || "frutinovela") as StyleKey };
  }).sort((a: any, b: any) => String(b.last?.createdAt || "").localeCompare(String(a.last?.createdAt || ""))), [data.series, data.episodes, data.accountProfiles]);
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
  // El canal de una serie nueva se elige siempre a mano (nunca la primera cuenta por defecto).
  const canal = data.accounts.find((a: any) => a.id === accountId);
  const largoPosible = canal?.platform === "Facebook" || canal?.platform === "YouTube";
  useEffect(() => { if (!largoPosible) setFormato("corto"); setClipIds(ids => ids.filter(id => id !== accountId)); }, [accountId, largoPosible]);
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
    // Drama bíblico: 14 escenas (~64 s tras quitar pausas): Facebook pide 60 s o más para monetizar.
    else if (p.style === "biblica") setDuration(64);
    else if (p.style === "epica") setDuration(48);
  }, [account?.id, data.accountProfiles]);

  // Cancelar la generación en curso (la IA puede terminar en el servidor, pero no se guarda nada).
  const abortRef = useRef<AbortController | null>(null);
  async function call(path: string, body: any, local: () => any) {
    // Sin sesión: plantilla local en el navegador (elenco de frutas y escenas completas, sin IA).
    if (mode !== "supabase") return { data: local(), note: "Modo sin sesión: borrador creado con la plantilla local y guardado en este navegador. Inicia sesión para que la IA escriba el guion." };
    abortRef.current = new AbortController();
    const r = await postApi(path, body, { signal: abortRef.current.signal });
    abortRef.current = null;
    if (isAuthError(r)) { setAuthError(true); return null; }
    if (!r.json?.ok) { setNotice(r.json?.error || "No se pudo generar el contenido. Inténtalo de nuevo."); return null; }
    const d = r.json.data;
    return { data: d, note: d?.notice || (d?.mode === "plantilla-local" ? "Borrador creado con la plantilla local." : "Elenco, escenas y guion creados con la IA. Revísalos antes de producir.") };
  }

  const [pendiente, setPendiente] = useState<CreacionPendiente | null>(null);
  useEffect(() => { if (mode !== "cargando") setPendiente(leerPendiente(userId)); }, [mode, userId]);
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
    if (!canal) { setNotice("Elige primero el canal de la serie (red y cuenta): cada serie nace anclada a un canal."); return; }
    const estiloCapitulo = kind_ === "adaptar" ? (estiloDeTexto(capitulo?.estilo) || biblioteca?.estilo || "") : "";
    if (!styleChosen && !override && !estiloCapitulo) { setNotice("Elige primero el estilo de la historia."); return; }
    if (kind_ === "adaptar" && !guionOtro.trim()) { setNotice("Pega o sube el guion que escribió la otra IA."); return; }
    if (kind_ !== "adaptar" && !idea_.trim() && !(kind_ === "replica" && replica.trim())) { setNotice(kind === "replica" ? "Describe el viral que quieres replicar." : "Escribe la idea de la historia o elige una de las sugerencias."); return; }
    setLoading(true); setNotice(""); setAuthError(false);
    try {
      // Historias que la cuenta ya usó (para rotar tipos del banco bíblico y no repetir).
      const usadas = data.series.filter((x: any) => x.accountId && x.accountId === account?.id).map((x: any) => {
        const ep = data.episodes.find((e: any) => e.seriesId === x.id);
        return [x.title, ep?.output?.bible?.story].filter(Boolean).join(" = ");
      });
      const body = { idea: idea_, style: styleChosen ? style : (estiloCapitulo || style), personajesExternos: kind_ === "adaptar" ? personajesOtro : "", duration, scenes: kind_ === "adaptar" && !escenas ? sceneCountFor(duration, escenasDelGuion(guionOtro) || 0) : nEscenas, formato, account, notes: notes_, learnings, chosenHook, replica: kind_ === "replica" ? replica : "", guionExterno: kind_ === "adaptar" ? guionOtro : "", accountProfile: profileFor(account?.id), usadas };
      // Fidelidad: diálogos, hablantes y orden intactos (la IA, si está, solo mejora la dirección visual).
      const fiel = kind_ === "adaptar" && capitulo && modoImport === "fidelidad";
      // Si las fichas canónicas piden 16:9, el episodio se importa en 16:9 aunque la serie sea corta (el formato es del episodio).
      const formatoImport = biblioteca?.formato === "16:9" ? "largo" : formato;
      const cuerpoFiel = { capitulo: guionOtro, personajes: personajesOtro, style: body.style, formato: formatoImport, duration, scenes: escenas ? nEscenas : capitulo?.clips.length };
      const res = fiel
        ? await call("/api/importar", cuerpoFiel, () => importarFiel(cuerpoFiel))
        : await call("/api/series", body, () => templateSeries(body)); if (!res) return;
      if (fiel) res.note = res.data.notice || res.note;
      const d = res.data;
      // Lo generado se aparta antes de guardar: si un guardado falla a mitad, se reanuda sin volver a generar.
      const p: CreacionPendiente = {
        id: `${Date.now()}`, at: new Date().toISOString(), titulo: d.series?.title || idea_.slice(0, 60),
        serie: { title: d.series?.title || idea_.slice(0, 60), description: d.series?.logline || idea_, accountId: canal.id, format: formato, clipAccountIds: clipIds, style: d.series?.style || style },
        personajes: d.characters || [], episodio: { ep: d.episode, bible: { style: d.series?.style || style, logline: d.series?.logline, world: d.series?.world, tone: d.series?.tone } }, hecho: { personajes: [] },
      };
      apartar(p, userId);
      await terminarCreacion(p, res.note);
    } catch (error: any) { setNotice(`No se pudo guardar la historia: ${error?.message || String(error)}`); }
    finally { setLoading(false); }
  }

  // Guarda (o termina de guardar) una historia ya generada. Lo hecho queda anotado paso a paso.
  async function terminarCreacion(p: CreacionPendiente, nota = "") {
    const shared = sharedCastOf(p.serie.accountId);
    try {
      const r = await completarCreacion(p, {
        insertarSerie: serie => insert("series", serie),
        // Elenco fijo de la cuenta: si la IA reutiliza a un personaje compartido, se copia su ficha aprobada.
        insertarPersonaje: (c, sid) => {
          const m = shared.find((x: any) => x.name.toLowerCase() === String(c.name).toLowerCase());
          if (m) { const { id: _id, seriesId: _sid, ...master } = m; return insert("characters", { ...c, ...master, seriesId: sid }); }
          return insert("characters", { ...c, seriesId: sid });
        },
        guardarEpisodio: (sid, ep, bible) => saveEpisode(sid, 1, ep, bible),
      }, q => apartar(q, userId));
      borrarPendiente(userId); setPendiente(null); ideaB.limpiar(); notesB.limpiar(); guionOtroB.limpiar(); personajesOtroB.limpiar();
      setSeriesId(r.seriesId); setResult({ episode: r.output, episodeId: r.episodeId, seriesId: r.seriesId, part: 1 }); setView("resultado"); setNotice(nota); setChosenHook(null);
    } catch (error: any) {
      setPendiente(leerPendiente(userId));
      setNotice(`La historia «${p.titulo}» se generó, pero no se terminó de guardar (${error?.message || String(error)}). Está apartada en este navegador: pulsa «Reintentar guardado» (no se vuelve a generar).`);
    }
  }

  // Archivos → «Adaptar un guion de otra IA»: rehace el episodio abierto con ese guion y el elenco fijo.
  // La versión anterior queda en el historial del episodio.
  async function adaptarEpisodio(texto: string, cuantas?: number) {
    if (!result?.episodeId || !current || current.id !== result.seriesId) throw new Error("Abre el episodio desde su serie para adaptarlo.");
    const part = result.part || 1;
    const eps = current.eps;
    const bible = eps[0]?.output?.seriesBible || result.episode?.seriesBible || { style: "frutinovela", logline: current.description };
    const body = {
      series: { title: current.title, logline: current.description }, bible, style: bible.style, partNumber: part, wish: "", duration, scenes: cuantas || nEscenas, formato: current.format,
      account: data.accounts.find((a: any) => a.id === current.accountId) || account, learnings, accountProfile: profileFor(current.accountId), guionExterno: texto,
      characters: currentCast.map((c: any) => ({ name: c.name, role: c.role, fruit: c.fruit, fruitEmoji: c.fruitEmoji, headES: c.headES, visualES: c.visualES, visualEN: c.visualEN, clothing: c.clothing, voice: c.voice, subtitleColor: c.subtitleColor, speechStyle: c.speechStyle, pronunciations: c.pronunciations, flowPrompt: c.flowPrompt })),
      history: eps.filter((e: any) => e.id !== result.episodeId).map((e: any, i: number) => ({ part: i + 1, title: e.title, summary: e.output?.summary || e.theme, cliffhanger: cliffhangerOf(e.output) })),
    };
    setLoading(true); setNotice(""); setAuthError(false);
    try {
      const res = await call("/api/next-episode", body, () => templateNext(body)); if (!res) return;
      for (const c of res.data.newCharacters || []) await insert("characters", { ...c, seriesId: current.id });
      // Fichas genéricas que la IA completó desde el guion: se guardan (la imagen, si la hay, se conserva).
      for (const u of res.data.castUpdates || []) {
        const m = data.characters.find((x: any) => x.seriesId === current.id && x.name.toLowerCase() === String(u.name).toLowerCase());
        if (m && fichaGenerica(m)) await update("characters", m.id, { role: u.role, visualES: u.visualES, visualEN: u.visualEN, clothing: u.clothing, voice: u.voice, speechStyle: u.speechStyle, flowPrompt: u.flowPrompt });
      }
      const ep = data.episodes.find((e: any) => e.id === result.episodeId) as any;
      const output = { ...res.data.episode, partNumber: part, seriesBible: bible };
      await update("episodes", result.episodeId, { output, title: output.title || ep?.title, theme: output.summary || ep?.theme, versions: [...(Array.isArray(ep?.versions) ? ep.versions : []), result.episode].slice(-10) });
      setResult(r => (r ? { ...r, episode: output } : r));
      setNotice([`Guion adaptado: ${output.scenes?.length || 0} escenas. La versión anterior quedó en el historial del episodio.`, res.note, (res.data.newCharacters || []).length ? `Personajes nuevos: ${res.data.newCharacters.map((c: any) => c.name).join(", ")} (crea y aprueba sus fichas).` : "", (res.data.castUpdates || []).length ? `Fichas completadas desde el guion: ${res.data.castUpdates.map((c: any) => c.name).join(", ")}.` : ""].filter(Boolean).join(" "));
    } finally { setLoading(false); }
  }

  // «1 · Personajes canónicos» → importar fichas de otra IA: actualiza a los que ya existen (por nombre) y añade
  // los nuevos a la serie; el elenco del episodio y sus prompts se rehacen con esas fichas.
  async function importarPersonajes(texto: string, opciones: { soloNombres?: string[] } = {}) {
    if (!result?.seriesId) throw new Error("Guarda primero el episodio.");
    const serie = data.series.find((x: any) => x.id === result.seriesId) as any;
    const st = (result.episode?.seriesBible?.style || (result.episode?.cast?.some((x: any) => x.fruit) ? "frutinovela" : "cine90")) as StyleKey;
    const existentes = data.characters.filter((c: any) => c.seriesId === result.seriesId);
    const body = { texto, style: st, formato: serie?.format, existentes: existentes.map((c: any) => c.name) };
    setLoading(true); setNotice(""); setAuthError(false);
    try {
      const res = opciones.soloNombres
        ? (mode === "supabase" ? await call("/api/personajes", body, () => ({})) : (() => { throw new Error("Completar fichas desde el guion necesita la IA: inicia sesión."); })())
        : await call("/api/personajes", body, () => adaptarPersonajesLocal(body)); if (!res) return;
      const solo = opciones.soloNombres?.map(n => n.toLowerCase());
      const llegan: any[] = (res.data.characters || []).filter((c: any) => !solo || solo.includes(String(c.name).toLowerCase()));
      if (!llegan.length) throw new Error("No se encontraron personajes en ese texto. Usa «NOMBRE: descripción» o un JSON con nombre y apariencia.");
      const CAMPOS = ["role", "fruit", "fruitEmoji", "headES", "visualES", "visualEN", "clothing", "voice", "speechStyle", "pronunciations", "flowPrompt"];
      const actualizados: string[] = [], nuevos: string[] = [];
      for (const c of llegan) {
        const m = existentes.find((x: any) => x.name.toLowerCase() === String(c.name).toLowerCase());
        const campos = Object.fromEntries(CAMPOS.filter(k => c[k] !== undefined && c[k] !== "").map(k => [k, c[k]]));
        if (m) { await update("characters", m.id, campos); actualizados.push(c.name); }
        else { await insert("characters", { ...c, seriesId: result.seriesId }); nuevos.push(c.name); }
      }
      // Elenco del episodio con las fichas nuevas y prompts rehechos (sin IA).
      const cast = [...(result.episode?.cast || []).map((c: any) => { const n = llegan.find(x => x.name.toLowerCase() === String(c.name).toLowerCase()); return n ? { ...c, ...Object.fromEntries(CAMPOS.filter(k => n[k] !== undefined && n[k] !== "").map(k => [k, n[k]])) } : c; }),
        ...llegan.filter(n => !(result.episode?.cast || []).some((c: any) => c.name.toLowerCase() === n.name.toLowerCase()))];
      if (result.episodeId) {
        const ep = data.episodes.find((e: any) => e.id === result.episodeId) as any;
        const output = conAspecto(refreshPrompts({ ...result.episode, cast }, st), aspectoEp(result.episode, result.seriesId));
        await update("episodes", result.episodeId, { output, versions: [...(Array.isArray(ep?.versions) ? ep.versions : []), result.episode].slice(-10) });
        setResult(r => (r ? { ...r, episode: output } : r));
      }
      setNotice([actualizados.length ? `Fichas actualizadas: ${actualizados.join(", ")} (si cambió su apariencia, sube y aprueba una imagen nueva).` : "", nuevos.length ? `Personajes nuevos: ${nuevos.join(", ")} (crea y aprueba sus fichas).` : "", res.note && !/Elenco, escenas/.test(res.note) ? res.note : ""].filter(Boolean).join(" "));
    } finally { setLoading(false); }
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
        series: { title: current.title, logline: current.description }, bible, style: bible.style, partNumber: part, wish: wish.trim() || String(bible?.plan?.[part] || ""), duration, scenes: nEscenas, formato: current.format, account: data.accounts.find((a: any) => a.id === current.accountId) || account, learnings, chosenHook,
        accountProfile: profileFor(current.accountId),
        // Continuidad: lo que el plan guarda para la parte siguiente no se abre en esta.
        nextPlan: String(bible?.plan?.[part + 1] || ""),
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

  function openEpisode(sid: string, ep: any, part: number, tab?: EpisodeTab) { anotarPunto(userId, { episodeId: ep.id, seriesId: sid, tab }); setSeriesId(sid); setOpenTab(tab); setResult({ episode: ep.output || {}, episodeId: ep.id, seriesId: sid, part }); setView("resultado"); setNotice(""); window.scrollTo?.({ top: 0, behavior: "smooth" }); }
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
    // «Retomar»: si es el último episodio editado, se abre en la pestaña donde se dejó.
    const punto = leerUltimoPunto(userId);
    openEpisode(episode.seriesId || "", episode, part, !focusTab && punto?.episodeId === episode.id ? punto.tab as EpisodeTab : undefined);
    focusedEpisodeRef.current = focusEpisodeId;
  // Solo al cambiar el episodio enfocado (focusTab, userId y openEpisode se leen en ese momento).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusEpisodeId, data.episodes]);

  const Back = ({ to = "inicio" as View }) => <button onClick={() => { setView(to); setNotice(""); setAuthError(false); setChosenHook(null); }} className="mb-4 text-sm text-slate-400 hover:text-white">← Volver</button>;

  return (
    <section>
      {view === "inicio" && <>
        <CreativeDesk onNavigate={onNavigate} onCreate={premise => { if (premise) setIdea(premise); setView("nueva"); }} onEpisode={id => { const ep = data.episodes.find(e => e.id === id); if (ep) openEpisode(ep.seriesId, ep, ep.output?.partNumber || 1); }} />
        {!!bank.length && <>
          <h3 className="mt-8 text-sm font-semibold uppercase tracking-wider text-slate-400">🎣 Banco de ganchos</h3>
          <div className="mt-3 overflow-x-auto rounded-xl bg-[#121826]"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-slate-400"><th className="p-2">Gancho</th><th className="p-2">Episodio</th><th className="p-2">Vistas</th><th className="p-2">Plataformas</th><th className="p-2"></th></tr></thead>
            <tbody>{bank.slice(0, 12).map((h, i) => <tr key={i} className="border-t border-slate-800"><td className="p-2 font-medium">{h.hook}</td><td className="p-2 text-slate-400">{h.source}</td><td className="p-2">{h.views ? h.views.toLocaleString() : <span className="text-slate-500">sin métricas</span>}</td><td className="p-2 text-xs text-slate-400">{h.platforms.join(", ") || "—"}</td><td className="p-2 text-right"><button type="button" onClick={() => saveHidden([...hiddenHooks, hookKey(h.hook)])} className="text-xs text-slate-400 hover:text-red-300" title="Ocultar este gancho del banco y de las sugerencias">Ocultar</button></td></tr>)}</tbody></table></div>
          <p className="mt-1 text-xs text-slate-500">Registra las vistas en Métricas con el mismo título del episodio para revisar qué ganchos rindieron más.{hiddenHooks.length > 0 && <> · <button type="button" onClick={() => saveHidden([])} className="text-sky-300 hover:text-sky-200">Mostrar {hiddenHooks.length} oculto(s)</button></>}</p>
        </>}
        {!!seriesList.length && <SeriesPorRed seriesList={seriesList} accounts={data.accounts} characters={data.characters}
          onOpen={openSeries} onDelete={(x: any) => { void deleteSeries(x); }} onAnchor={(x: any, accId: string) => update("series", x.id, { ...data.series.find((y: any) => y.id === x.id), accountId: accId })} />}
      </>}

      {view === "nueva" && <>
        <Back />
        <div className="creation-workspace mt-3"><p className="studio-eyebrow cinematic-gold">PREPRODUCCIÓN / NUEVA HISTORIA</p><h2 className="mt-2 text-3xl font-semibold tracking-tight">Dale forma a tu próxima historia.</h2><p className="mt-2 text-sm text-slate-400">Elige su identidad, escribe la premisa y prepara el primer episodio.</p>
        <div className="creation-brief-layout">
        <div className="creation-fields space-y-5">
          <CanalPicker accounts={data.accounts} accountId={accountId} onAccount={setAccountId} estilo={styleChosen ? style : undefined} formato={formato} onFormato={setFormato} largoPosible={largoPosible} clipIds={clipIds} onClipIds={setClipIds} />
          <fieldset>
            <legend className="field-label">Estilo <span className="normal-case tracking-normal text-amber-300">· obligatorio{styleChosen ? "" : ": elige uno"}</span></legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {(Object.keys(STYLES) as StyleKey[]).map(k => (
                <button key={k} type="button" aria-pressed={styleChosen && style === k} onClick={() => { setStyle(k); if (k === "biblica") setDuration(64); if (k === "epica") setDuration(48); }} className={`rounded-xl border px-3 py-3 text-left text-sm ${styleChosen && style === k ? "border-amber-400/60 bg-amber-400/10 text-amber-100" : "border-white/10 bg-white/[.03] text-slate-300"}`}>{STYLES[k].label}</button>
              ))}
            </div>
          </fieldset>
          <div>
            {kind === "replica" && <div className="mb-3"><label htmlFor="generator-replica" className="field-label block">Describe el viral</label>
              <textarea id="generator-replica" className="aurora-field" value={replica} onChange={e => setReplica(e.target.value)} placeholder="Qué pasa en el vídeo, su gancho, quién humilla a quién, qué objeto revela el giro… Se copia la estructura y la emoción, nunca los personajes ni el texto." /></div>}
            <CapituloDeOtraIA activo={kind === "adaptar"} onActivar={() => setKind("adaptar")} onQuitar={() => { setKind("nueva"); setGuionOtro(""); setPersonajesOtro(""); }}
              capitulo={guionOtro} onCapitulo={setGuionOtro} personajes={personajesOtro} onPersonajes={setPersonajesOtro}
              modo={modoImport} onModo={setModoImport} reconocido={!!capitulo}
              resumen={capitulo ? `Capítulo reconocido: ${capitulo.clips.length} ${capitulo.fuente === "clips" ? "clips" : "escenas"}${capitulo.gancho.length ? ", gancho" : ""}${capitulo.tarjetas.length ? `, ${capitulo.tarjetas.length} tarjetas` : ""}${capitulo.cierre ? ", cierre" : ""} (los metadatos no crean escenas).${biblioteca ? ` Personajes: ${biblioteca.personajes.length} visuales${biblioteca.narradores.length ? ` + ${biblioteca.narradores.join(", ")} como voz en off` : ""}.` : ""} ${modoImport === "fidelidad" ? `Modo fidelidad: diálogos y orden intactos${escenas && nEscenas !== capitulo.clips.length ? `; la configuración pide ${nEscenas} escenas (se explicará la diferencia)` : ""}.` : "Adaptación creativa: la IA puede reescribir; verás la lista de cambios."}${!estiloDeTexto(capitulo.estilo) && !biblioteca?.estilo && !styleChosen ? " Elige el estilo." : ""}${biblioteca?.formato === "16:9" && formato !== "largo" && modoImport === "fidelidad" ? " Las fichas piden 16:9: el episodio se importará en horizontal 16:9 (la serie sigue como está; puedes cambiarlo luego en «Imagen»)." : ""}` : guionOtro.trim() ? `Formato de otra IA: se adaptará con IA a ${!escenas && escenasDelGuion(guionOtro) ? `las ${sceneCountFor(duration, escenasDelGuion(guionOtro) || 0)} escenas del guion` : `${nEscenas} escenas`}${formato === "largo" ? " en 16:9" : ""}.` : ""} />
            {/* Compositor Aurora: la idea, el tipo de pedido (real) y el estado de la generación (real). */}
            <div className={`aurora-border p-3 ${loading ? "creation-energy" : ""}`} data-estado={loading ? "generando" : /^(No se pudo|La historia «)/.test(notice) || authError ? "error" : undefined} data-spotlight="creacion">
              <label htmlFor="generator-idea" className="field-label block">{kind === "replica" ? "Idea para adaptarlo a RD" : kind === "adaptar" ? "Ajustes para la adaptación (opcional)" : "Idea de la historia"}</label>
              <textarea id="generator-idea" className="aurora-field !border-transparent !bg-transparent !shadow-none" rows={3} value={idea} onChange={e => setIdea(e.target.value)} placeholder="Ej.: Una madre humilde descubre que su hijo rico la niega delante de sus amigos…" />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <TipoMenu kind={kind} onKind={setKind} />
                <span className="aurora-chip" title={mode === "supabase" ? "La creación usa el servicio de IA configurado" : "Sin sesión: se crea un borrador con plantilla, sin IA"}>{mode === "supabase" ? "✦ IA conectada" : "Plantilla local"}</span>
                {styleChosen && <span className="aurora-chip">{STYLES[style].label}</span>}
                <span className="ml-auto text-xs text-slate-400">{idea.trim() ? `${idea.trim().split(/\s+/).length} palabras` : ""}</span>
              </div>
            </div>
            <div className="mt-3"><IdeasPanel style={style} accountProfile={profileFor(account?.id)} online={mode === "supabase"} existing={data.series.map((x: any) => `${x.title}. ${x.description || ""}`)} onUse={useIdea} busy={loading} /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">

            <div><label htmlFor="generator-duration" className="field-label block">Duración del vídeo montado</label>
              <select id="generator-duration" value={duration} onChange={e => setDuration(Number(e.target.value))}>{DURATIONS.map(d => <option key={d} value={d}>{d} s · {sceneCountFor(d)} escenas</option>)}</select></div>
            <div><label htmlFor="generator-scenes" className="field-label block">Escenas</label>
              <select id="generator-scenes" aria-label="Cantidad de escenas" value={escenas} onChange={e => setEscenas(Number(e.target.value))}><option value={0}>Automático · {sceneCountFor(duration)} escenas</option>{Array.from({ length: MAX_SCENES - MIN_SCENES + 1 }, (_, k) => MIN_SCENES + k).map(n => <option key={n} value={n}>{n} escenas · ~{Math.round(n * 4.5)} s</option>)}</select></div>
            <AvisoEscenas texto={`${idea} ${notes} ${kind === "adaptar" ? guionOtro : ""}`} escenas={nEscenas} onUsar={setEscenas} />
          </div>
          <div><label htmlFor="generator-notes" className="field-label block">Notas opcionales</label>
            <input id="generator-notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ej.: que la abuela se llame Doña Guanábana, que pase en Navidad…" /></div>
          <HookPicker online={mode === "supabase"} chosen={chosenHook} onChoose={setChosenHook} body={() => ({ idea, style, learnings, bank: bankTop, accountProfile: profileFor(account?.id) })} />
          <button disabled={loading} onClick={() => { void createStory(); }} className={`aurora-send !h-auto !w-full rounded-full px-6 py-3 text-base font-bold sm:!w-auto ${loading ? "creation-energy" : ""}`} aria-busy={loading}>{loading ? "Creando la serie…" : "✦ Crear serie y episodio 1"}</button>
        </div>
        <aside className="production-brief" aria-label="Resumen de producción">
          <div className="brief-cover"><span className="studio-eyebrow cinematic-gold">CUADERNO / NUEVA PRODUCCIÓN</span><span className="brief-cover-symbol" aria-hidden="true">✦</span><h3>{styleChosen ? STYLES[style].label : "Una historia por descubrir."}</h3><p>{idea.trim() || "Tu premisa aparecerá aquí mientras le das forma."}</p></div>
          <dl><div><dt>Canal</dt><dd>{data.accounts.find(a => a.id === accountId)?.name || "Por elegir"}</dd></div><div><dt>Proyecto</dt><dd>{formato === "largo" ? "Serie de formato largo" : "Serie de clips cortos"}</dd></div><div><dt>Duración por clip</dt><dd>{duration} segundos</dd></div><div><dt>Escenas por clip</dt><dd>{nEscenas}</dd></div><div><dt>Imagen</dt><dd>{formato === "largo" ? "Horizontal 16:9" : "Vertical 9:16"}</dd></div></dl>
          <div className="brief-readiness"><p className="studio-eyebrow">ANTES DEL PRIMER PLANO</p><p data-ready={!!accountId}><span aria-hidden="true">{accountId ? "✓" : "○"}</span> Canal seleccionado</p><p data-ready={styleChosen}><span aria-hidden="true">{styleChosen ? "✓" : "○"}</span> Identidad visual definida</p><p data-ready={!!idea.trim() || kind === "replica" && !!replica.trim()}><span aria-hidden="true">{idea.trim() || kind === "replica" && replica.trim() ? "✓" : "○"}</span> Premisa escrita</p></div>
          <p className="brief-mode">{mode === "supabase" ? "La creación usará el servicio de IA configurado." : "Modo local: se creará un borrador con plantilla, sin IA."}</p>
        </aside></div></div>
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
                    <CanalSerie serie={data.series.find((x: any) => x.id === current.id)} accounts={data.accounts} onSave={(patch: any) => update("series", current.id, { ...data.series.find((x: any) => x.id === current.id), ...patch })} />
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
              <StoryArchitect key={current.id} series={data.series.find((x: any) => x.id === current.id)} style={current.style} cast={currentCast.map((c: any) => c.name)} characters={currentCast} defaultOpen={data.series.find((x: any) => x.id === current.id)?.format === "largo"} />
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
                  <span className="choice-icon !mb-0 bg-gradient-to-br from-amber-200 to-amber-500 text-black">＋</span>
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
                  <select id="generator-next-scenes" aria-label="Cantidad de escenas" value={escenas} onChange={e => setEscenas(Number(e.target.value))} className="w-auto"><option value={0}>Automático · {sceneCountFor(duration)} escenas</option>{Array.from({ length: MAX_SCENES - MIN_SCENES + 1 }, (_, k) => MIN_SCENES + k).map(n => <option key={n} value={n}>{n} escenas · ~{Math.round(n * 4.5)} s</option>)}</select>
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

      {view === "resultado" && result && <Result aspecto={aspectoEp(result.episode, result.seriesId)} onImportarPersonajes={importarPersonajes} onAdaptarGuion={adaptarEpisodio} adaptando={loading}
        episode={result.episode} episodeId={result.episodeId} seriesId={result.seriesId} part={result.part} seriesTitle={data.series.find((s: any) => s.id === result.seriesId)?.title} initialTab={openTab || focusTab}
        status={data.episodes.find((e: any) => e.id === result.episodeId)?.status}
        onFinish={async () => { if (result.episodeId && !isFinished(data.episodes.find((e: any) => e.id === result.episodeId))) await update("episodes", result.episodeId, { status: FINISHED }); }}
        onAcceptDraft={async () => {
          // Borrador de Gemini revisado por el usuario: pasa a guion normal (y deja de bloquear la parte siguiente).
          if (!result.episodeId || !window.confirm("¿Dar por bueno este guion y pasarlo a producción?")) return;
          const output = { ...result.episode, mode: "llm", qualityIssues: undefined };
          await update("episodes", result.episodeId, { status: "Guion", output });
          setResult({ ...result, episode: output });
          setNotice("Guion aceptado: ya puedes producirlo y crear la parte siguiente.");
        }}
        onUnlock={async () => { if (result.episodeId && window.confirm("¿Desbloquear este episodio para volver a editarlo?")) await update("episodes", result.episodeId, { status: "Guion" }); }}
        backLabel={data.series.find((s: any) => s.id === result.seriesId)?.title}
        onBack={() => { if (result.seriesId && data.series.some((s: any) => s.id === result.seriesId)) openSeries(result.seriesId); else setView("inicio"); }} onNext={() => { setSeriesId(result.seriesId); setView("continuar"); }}
        onCambiar={async (siguiente: any, c: { mapa?: Record<number, number>; anterior?: any }) => {
          // Cambio del director de escenas (editar, mover, duplicar, deshacer): prompts rehechos sin IA, la
          // versión anterior al historial del episodio y, si cambian números de escena, revisiones y archivos.
          if (!result.episodeId) throw new Error("El episodio aún no está guardado");
          const firstBible = data.episodes.find((e: any) => e.seriesId === result.seriesId && e.output?.seriesBible?.style)?.output?.seriesBible;
          const st = (result.episode?.seriesBible?.style || firstBible?.style || (result.episode?.cast?.some((x: any) => x.fruit) ? "frutinovela" : "cine90")) as StyleKey;
          const output = conAspecto(refreshPrompts(siguiente, st), aspectoEp(siguiente, result.seriesId));
          const ep = data.episodes.find((e: any) => e.id === result.episodeId) as any;
          await update("episodes", result.episodeId, { output, versions: [...(Array.isArray(ep?.versions) ? ep.versions : []), c.anterior || result.episode].slice(-10) });
          if (c.mapa) {
            for (const r of remapRevisiones(data.clipChecks.filter((x: any) => x.episodeId === result.episodeId), c.mapa)) await update("clipChecks", r.id, { clipIndex: r.a });
            await renumerarArchivos(userId || "local", result.episodeId, c.mapa).catch(() => {});
          }
          setResult(r => (r ? { ...r, episode: output } : r));
          return output;
        }}
        onMoveScene={async (desde: number, hasta: number) => {
          const r = moverEscenaCorta(result.episode, desde, hasta); if (!r || !result.episodeId) return;
          const firstBible = data.episodes.find((e: any) => e.seriesId === result.seriesId && e.output?.seriesBible?.style)?.output?.seriesBible;
          const st = (result.episode?.seriesBible?.style || firstBible?.style || (result.episode?.cast?.some((c: any) => c.fruit) ? "frutinovela" : "cine90")) as StyleKey;
          const output = conAspecto(refreshPrompts(r.out, st), aspectoEp(r.out, result.seriesId));
          const ep = data.episodes.find((e: any) => e.id === result.episodeId) as any;
          try {
            await update("episodes", result.episodeId, { output, versions: [...(Array.isArray(ep?.versions) ? ep.versions : []), result.episode].slice(-10) });
            for (const c of remapRevisiones(data.clipChecks.filter((x: any) => x.episodeId === result.episodeId), r.mapa)) await update("clipChecks", c.id, { clipIndex: c.a });
            await renumerarArchivos(userId || "local", result.episodeId, r.mapa).catch(() => {});
            setResult({ ...result, episode: output });
            setNotice(`Escena ${desde} movida a la posición ${hasta}: se renumeraron las escenas, su diálogo en el montaje, sus revisiones y sus archivos.`);
          } catch (e: any) { setNotice(`No se pudo mover la escena: ${e?.message || e}. No se cambió nada más.`); }
        }}
        onRefreshPrompts={async () => {
          // Rehace los prompts con las reglas actuales, sin IA: el guion, las escenas y los personajes no cambian.
          const firstBible = data.episodes.find((e: any) => e.seriesId === result.seriesId && e.output?.seriesBible?.style)?.output?.seriesBible;
          const st = (result.episode?.seriesBible?.style || firstBible?.style || (result.episode?.cast?.some((c: any) => c.fruit) ? "frutinovela" : "cine90")) as StyleKey;
          // El acento (y la forma de hablar) que se edita en Personajes manda sobre la copia del episodio.
          const masters = data.characters.filter((c: any) => c.seriesId === result.seriesId);
          const cast = (result.episode?.cast || []).map((c: any) => { const m = masters.find((x: any) => x.name.toLowerCase() === String(c.name).toLowerCase()); return m?.speechStyle ? { ...c, speechStyle: m.speechStyle } : c; });
          const output = conAspecto(refreshPrompts({ ...result.episode, cast }, st), aspectoEp(result.episode, result.seriesId));
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

      {loading && <GenerationStatus label={mode === "supabase" ? "Creando y guardando tu historia" : "Preparando tu borrador local"} detail={mode !== "supabase" ? "Se prepara una plantilla sin IA y se guarda en este navegador." : undefined}>{mode === "supabase" && <button type="button" onClick={() => abortRef.current?.abort()} className="studio-text-action">Cancelar</button>}</GenerationStatus>}
      {authError && <div className="mt-4"><AiAuthNotice /></div>}
      {notice && <p role="status" className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-100">{notice}</p>}
      {pendiente && !loading && <div role="alert" className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-sky-400/30 bg-sky-400/[.06] p-3 text-sm text-sky-100">
        <span className="min-w-0 flex-1">Historia generada sin terminar de guardar: <b>«{pendiente.titulo}»</b>{pendiente.hecho.seriesId ? ` (serie guardada${pendiente.hecho.personajes.length ? `, ${pendiente.hecho.personajes.length} personaje(s)` : ""}; falta ${pendiente.hecho.episodeId ? "nada" : "el episodio"})` : " (aún no se guardó nada)"}.</span>
        <button type="button" onClick={async () => { setLoading(true); setNotice(""); try { await terminarCreacion(pendiente); } finally { setLoading(false); } }} className="rounded-lg bg-sky-400 px-3 py-1.5 text-xs font-bold text-slate-950">Reintentar guardado</button>
        <button type="button" onClick={() => { if (confirm("¿Descartar la historia generada? Se pierde lo que no se guardó.")) { borrarPendiente(userId); setPendiente(null); } }} className="text-xs text-slate-400 underline">Descartar</button>
      </div>}
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
    ...scenes.flatMap((s: any) => [`### Escena ${s.n} — ${s.title || ""} (${(s.n - 1) * 8}-${s.n * 8} s)`, `- Objetivo: ${s.goal || "—"}`, `- Personajes: ${(s.characters || []).join(", ") || "—"}`, `- Emoción: ${s.emotion}`, `- Plano: ${s.shot || "—"}`, `- Acción visual: ${s.setting}`, `- ${s.speaker}: «${s.line}»`, ...(s.phone ? [`- Teléfono: ${s.phone.type}${s.phone.contact ? ` (${s.phone.contact})` : ""}${s.phone.messages?.length ? `: ${s.phone.messages.join(" / ")}` : ""}`] : []), `- Efectos: ${s.sfx || "—"}`, `- Música: ${s.music || "—"}`, `- Transición: ${s.transition || "—"}`, `- Conexión: ${s.nextLink || "—"}`, ""]),
    "## Fase 1 · Elenco", "",
    ...cast.flatMap((c: any) => [`### ${c.fruitEmoji ? c.fruitEmoji + " " : ""}${c.name}${c.fruit ? ` — ${c.fruit}` : ""}`, `- Rol: ${c.role || "—"}`, c.headES ? `- Aspecto: ${c.headES}` : `- Apariencia: ${c.visualES || "—"}`, `- Ropa fija: ${c.clothing || "—"}`, `- Voz: ${c.voice || c.speechStyle || "—"}`, `- Pronunciaciones: ${(c.pronunciations || []).join("; ") || "—"}`, `- Color de subtítulo: ${String(c.subtitleColor || "").replace("#", "")}`, "", "Prompt de ficha para Flow:", "```", c.flowPrompt || "", "```", ""]),
    "## Fase 2 · Imágenes (adjunta las fichas maestras aprobadas)", "", "```", lote.full, "```", "",
    "## Fase 3 · Animación", "",
    ...scenes.flatMap((s: any) => [`### Escena ${s.n} — primer fotograma: imagen [${String(s.n).padStart(3, "0")}]`, `Referencias a seleccionar: ${(s.references || []).join(", ") || "ninguna"}`, "```", s.animationPrompt, "```", ""]),
    "## Redes", "", `- Título: ${so.title || ""}`, ...(so.hooks || []).map((h: string, i: number) => `- Gancho ${i + 1}: ${h}`), `- Texto del fotograma cero: ${so.frameZeroText || ""}`, `- Descripción TikTok: ${so.tiktokDescription || ""}`, `- Pregunta final: ${so.question || ""}`, `- Portada: ${so.coverIdea || ""}`, `- Música: ${so.music || ""}`, so.biblicalPassage ? `- Pasaje bíblico: ${so.biblicalPassage}` : "",
  ].filter(l => l !== "").join("\n");
}

// Momento de «la vida de hoy» de la escena: lo que el montaje dibuja (chat) o cómo suena (voz por teléfono).
function PhoneBadge({ phone, speaker }: { phone: any; speaker: string }) {
  const label: Record<string, string> = { whatsapp: "Chat de WhatsApp en pantalla", llamada: `Llamada: la voz de ${speaker} suena por teléfono`, videollamada: "Videollamada en pantalla partida", nota_de_voz: `Nota de voz de ${speaker}` };
  return <div className="mt-2 rounded-lg border border-emerald-400/25 bg-emerald-400/[.06] px-2.5 py-1.5 text-xs text-emerald-200">
    <span aria-hidden="true">📱 </span>{label[phone.type] || "Teléfono"}{phone.contact ? ` · ${phone.contact}` : ""}
    {Array.isArray(phone.messages) && phone.messages.length > 0 && <ul className="mt-1 space-y-0.5 text-slate-200">{phone.messages.map((m: string, i: number) => <li key={i} className="w-fit rounded-md bg-white/10 px-2 py-0.5">{m}</li>)}</ul>}
  </div>;
}

function DownloadText({ text, filename, label }: { text: string; filename: string; label: string }) {
  return <button type="button" className="rounded bg-slate-700 px-3 py-1.5 text-xs font-semibold" onClick={() => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
  }}>{label}</button>;
}

const Field = ({ label, value }: { label: string; value?: string }) => value ? <div><dt className="inline font-semibold text-slate-200">{label}: </dt><dd className="inline text-slate-300">{value}</dd></div> : null;
const RefChips = ({ refs }: { refs?: string[] }) => <p className="mt-2 text-[11px] text-sky-200">Referencias a seleccionar (fuera del prompt): {(refs || []).length ? (refs || []).map(r => <span key={r} className="ml-1 rounded-full bg-sky-400/15 px-2 py-0.5">{r}</span>) : <span className="text-slate-400">ninguna</span>}</p>;

function Result({ episode: out, episodeId, seriesId, part, seriesTitle, initialTab, status, aspecto, onAdaptarGuion, onImportarPersonajes, adaptando, onFinish, onUnlock, onAcceptDraft, backLabel, onBack, onNext, onRecreate, onDelete, onRefreshPrompts, onMoveScene, onCambiar }: any) {
  type Tab = "guion" | "elenco" | "imagenes" | "animacion" | "mesa" | "redes" | "plataformas" | "archivos";
  const { data, update, userId } = useData();
  const cast: any[] = Array.isArray(out.cast) ? out.cast : [];
  const scenes: any[] = Array.isArray(out.scenes) ? out.scenes : [];
  const ficha = out.ficha || null; const social = out.social || null;
  const [tab, setTab] = useState<Tab>("guion");
  const [activeSceneN, setActiveSceneN] = useState<number | null>(null);
  const activeScene = scenes.find(s => s.n === activeSceneN) || scenes[0];
  const finished = status === FINISHED;
  // Terminado: se puede ver, publicar y descargar textos, pero no editar fichas, prompts ni la mesa.
  const lockedTab = finished && (tab === "elenco" || tab === "imagenes" || tab === "animacion" || tab === "mesa");
  // Frase para el «Anteriormente...»: la primera frase del resumen de la parte anterior de esta serie.
  const recap = useMemo(() => {
    if (!seriesId || part <= 1) return "";
    const sib = data.episodes.filter((e: any) => e.seriesId === seriesId).sort((a: any, b: any) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
    const prev = sib.find((e: any) => e.output?.partNumber === part - 1) || sib[part - 2];
    const sum = String(prev?.output?.summary || "").replace(/\s+/g, " ").trim();
    const first = (sum.match(/^.+?[.!?](\s|$)/)?.[0] || sum).trim();
    return first.length > 140 ? first.slice(0, 137).replace(/\s+\S*$/, "") + "…" : first;
  }, [data.episodes, seriesId, part]);
  const pack = useMemo(() => publishPack(out, out.seriesBible?.style || (cast.some((c: any) => c.fruit) ? "frutinovela" : "cine90"), part, seriesTitle || "", data.accounts.find((a: any) => a.id === data.series.find((x: any) => x.id === seriesId)?.accountId)?.platform || ""), [out, part, seriesTitle, data.accounts, data.series, seriesId]);
  const [reviewed, setReviewed] = useState(false);
  useEffect(() => { setReviewed(false); setTab(initialTab || "guion"); }, [out, initialTab]);
  // Último punto editado: «Retomar» vuelve a este episodio y a esta pestaña.
  useEffect(() => { if (episodeId) anotarPunto(userId, { episodeId, seriesId, tab }); }, [episodeId, seriesId, tab, userId]);
  const fromAI = !!out.mode && out.mode !== "plantilla-local" && out.mode !== "gemini-borrador" && cast.length >= 2;
  const isTemplate = out.mode === "plantilla-local";
  const isAIDraft = out.mode === "gemini-borrador";
  const master = cast.map(c => data.characters.find(x => x.seriesId === seriesId && x.name.toLowerCase() === String(c.name).toLowerCase()));
  const referencesReady = !!cast.length && master.every(c => !!c?.imageUrl && !!c?.referenceApprovedAt);
  const snapshotValid = !!out.referenceVersions && master.every((c, i) => Number(c?.referenceVersion || 1) === Number(out.referenceVersions[String(cast[i].name).toLowerCase()]));
  const productionReady = referencesReady && snapshotValid;
  const episodeStyle: string = out.seriesBible?.style || (/escribe am[eé]n/i.test(scenes.at(-1)?.line || "") ? "cristiana" : cast.some(c => c.fruit) ? "frutinovela" : "cine90");
  // Serie larga con prompts aún en vertical (creados antes del 16:9): también se ofrece actualizarlos.
  const formatoViejo = aspecto === "16:9" && scenes.some((s: any) => /9:16/.test(`${s.imagePromptFlow || ""} ${s.animationPrompt || ""}`));
  const promptsOutdated = scenes.length > 0 && (Number(out.promptsVersion || 1) < PROMPT_RULES_VERSION || formatoViejo);
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
    if (c.referenceApprovedAt && !window.confirm(`Se creará una nueva versión pendiente de aprobación para ${c.name}. ¿Continuar?`)) return;
    // Fotos grandes (2K, PNG…): se recomprimen solas conservando la resolución, sin rechazarlas.
    void prepararFicha(file).then(({ url }) => { const history = [...(c.referenceHistory || [])]; if (c.referenceApprovedAt && c.imageUrl) history.push({ version: c.referenceVersion || 1, imageUrl: c.imageUrl, approvedAt: c.referenceApprovedAt }); void update("characters", c.id, { imageUrl: url, referenceApprovedAt: undefined, referenceVersion: Number(c.referenceVersion || 0) + 1, referenceHistory: history }); }).catch((e: any) => window.alert(`No se pudo usar esa imagen: ${e?.message || e}`));
  }
  const sceneId = (n: number) => `[${String(n).padStart(3, "0")}]`;
  return <section className="episode-workspace" aria-label="Mesa de producción del episodio">
    <button onClick={onBack} className="mb-4 text-sm text-slate-400 hover:text-white">← {backLabel ? `Serie: ${backLabel}` : "Inicio"}</button>
    <div className="episode-heading flex flex-wrap items-start gap-3">
      <div className="flex-1 min-w-[220px]">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-300/80">{seriesTitle} · Episodio {part}</p>
        <h2 className="text-xl font-bold">{out.title || `Episodio ${part}`}</h2>
        {out.summary && <p className="mt-1 text-sm text-slate-400">{out.summary}</p>}
      </div>
      <span className="episode-actions">{finished && <span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-200">🔒 Terminado</span>}{!finished && scenes.length > 0 && onCambiar && <label className="episode-aspect" data-aspect={aspecto || "9:16"}><span aria-hidden="true" className="episode-aspect-icon" /><span>Formato de imagen<small>Solo este episodio</small></span><select aria-label="Formato de imagen del episodio" className="w-auto py-1 text-xs" value={aspecto || "9:16"} onChange={e => { const v = e.target.value; if (v !== aspecto && window.confirm(`Se rehacen todos los prompts en ${v === "16:9" ? "horizontal 16:9" : "vertical 9:16"} (sin IA; la versión actual queda en el historial). ¿Continuar?`)) void onCambiar(v === "16:9" ? { ...out, aspecto: "16:9" } : conAspecto(out, "9:16"), { anterior: out }); }}><option value="16:9">Horizontal 16:9</option><option value="9:16">Vertical 9:16</option></select></label>}{!finished && scenes.length > 0 && <button type="button" onClick={refresh} disabled={refreshing} title="Rehace los prompts de imagen, animación y Dola con las reglas actuales, sin IA y sin tocar el guion" className="text-xs text-slate-400 hover:text-amber-300 disabled:opacity-50">{refreshing ? "Actualizando…" : "Actualizar prompts"}</button>}{episodeId && !finished && <button type="button" onClick={onDelete} className="text-xs text-slate-400 hover:text-red-300">Eliminar episodio</button>}
      <button onClick={onNext} className="rounded bg-amber-500 px-4 py-2 text-sm font-bold">Crear episodio {part + 1} →</button></span>
    </div>
    <div className={`mt-4 rounded-xl border p-4 text-sm ${fromAI ? "border-emerald-400/25 bg-emerald-400/[.07] text-emerald-100" : "border-amber-400/30 bg-amber-400/[.08] text-amber-100"}`}>
      <p className="font-bold">{out.mode === "importado" ? (finished ? "Capítulo importado · terminado" : "Capítulo importado · disponible para revisión") : out.mode === "guion-manual" ? `Guion escrito · ${cast.length} personajes · ${(out.scriptBlocks || []).length} bloques · pendiente de producción` : fromAI ? `Guion escrito por la IA · ${cast.length} personajes · ${scenes.length || (out.scriptBlocks || []).length} escenas · ${fullDuration} s` : isTemplate ? "Borrador de la plantilla local (sin IA)" : isAIDraft ? "Borrador de Gemini · pendiente de corregir" : "Borrador anterior sin elenco de producción"}</p>
      <p className="mt-1 text-xs leading-5">{fromAI ? "Orden de trabajo: aprueba las fichas maestras → genera imágenes con esas referencias → anima y revisa cada escena → monta el vídeo." : isTemplate ? "Elenco de frutas, escenas, prompts y montaje completos, pero el diálogo es de estructura genérica: revísalo antes de producir o recréalo con la IA cuando esté disponible." : isAIDraft ? `Se conservaron las escenas y personajes de Gemini, pero ${out.qualityIssues?.join("; ") || "el guion necesita revisión"}. Revísalo antes de producir o recréalo con la IA.` : "Este episodio se creó con una versión anterior. Recréalo para tener el elenco y las escenas de producción."}</p>
      {isAIDraft && !finished && cast.length >= 2 && scenes.length > 0 && <button type="button" onClick={onAcceptDraft} className="mr-2 mt-3 rounded-lg bg-emerald-400 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-300">Usar este guion así</button>}
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
    {(out.validacion || out.adaptacion) && <RevisionImportacion out={out} />}
    {scenes.length > 0 && !finished && onCambiar && <RevisionDireccion out={out} titulo={`${seriesTitle} · Episodio ${part}`} maestros={data.characters.filter((c: any) => c.seriesId === seriesId)} aspecto={aspecto || "9:16"} onAplicar={(propuesta: any) => onCambiar(propuesta, { anterior: out })} />}
    {scenes.length > 0 && !finished && onCambiar && <TiemposMontaje out={out} usuario={userId || "local"} episodeId={episodeId} onAplicar={(propuesta: any) => onCambiar(propuesta, { anterior: out })} />}
    {scenes.length > 0 && !finished && onCambiar && <DirectorAccion out={out} maestros={data.characters.filter((c: any) => c.seriesId === seriesId)} aspecto={aspecto || "9:16"} versiones={(data.episodes.find((e: any) => e.id === episodeId) as any)?.versions || []} onAplicar={(propuesta: any) => onCambiar(propuesta, { anterior: out })} />}
    {promptsOutdated && !finished && <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-sky-400/30 bg-sky-400/10 p-3 text-xs text-sky-100"><span className="flex-1 min-w-[220px]">{formatoViejo ? "Esta serie es de formato largo, pero los prompts de este episodio están en vertical 9:16. Actualízalos para pasar fichas, escenas y animación a horizontal 16:9 (el guion no cambia)." : <>Hay reglas nuevas para los prompts (ritmo viral: hablan desde el primer segundo, sin pausas y sin música dentro del clip). Este episodio tiene los prompts de una versión anterior.</>}</span><button type="button" onClick={refresh} disabled={refreshing} className="rounded-lg bg-sky-400 px-3 py-1.5 font-bold text-slate-950 hover:bg-sky-300 disabled:opacity-50">{refreshing ? "Actualizando…" : "Actualizar prompts"}</button></div>}
    {scenes.length > 0 && cast.length >= 2 && !referencesReady && <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-100">Faltan fichas maestras aprobadas: {missingMasters.join(", ")}. Súbelas y apruébalas en «1 · Personajes canónicos» antes de producir.</div>}
    {scenes.length > 0 && cast.length >= 2 && referencesReady && !snapshotValid && <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-100">La ficha maestra cambió desde que se creó este guion, o el episodio es anterior al control de versiones. Regenera el episodio para alinear prompts y personajes.</div>}
    {scenes.length > 0 && cast.length >= 2 && <nav className="production-journey" aria-label="Estado guardado de la producción">
      <button type="button" data-complete={!!episodeId} aria-current={tab === "guion" ? "step" : undefined} onClick={() => setTab("guion")}><b>01 · Guion</b><small>{isTemplate || isAIDraft ? "Borrador guardado" : "Guion disponible"}</small></button>
      <button type="button" data-complete={referencesReady} aria-current={tab === "elenco" ? "step" : undefined} onClick={() => setTab("elenco")}><b>02 · Personajes</b><small>{master.filter(c => c?.imageUrl && c?.referenceApprovedAt).length}/{cast.length} fichas aprobadas</small></button>
      <button type="button" disabled={!productionReady} aria-current={tab === "imagenes" || tab === "animacion" ? "step" : undefined} onClick={() => setTab("imagenes")}><b>03 · Dirección visual</b><small>{productionReady ? "Prompts disponibles" : "Requiere fichas vigentes"}</small></button>
      <button type="button" disabled={!productionReady} data-complete={finished} aria-current={tab === "mesa" ? "step" : undefined} onClick={() => setTab("mesa")}><b>04 · Mesa y montaje</b><small>{finished ? "Vídeo descargado" : "Revisión y montaje"}</small></button>
    </nav>}
    <nav className="tabs episode-tabs mt-5" aria-label="Áreas del episodio">{tabs.map(([k, l]) => <button key={k} onClick={() => setTab(k)} disabled={(k === "imagenes" || k === "animacion" || k === "mesa") && !productionReady} aria-current={tab === k ? "page" : undefined} className={`${tab === k ? "tab-active" : ""} disabled:cursor-not-allowed disabled:opacity-40`}>{l}</button>)}</nav>
    {lockedTab && <p className="mt-4 rounded-xl border border-emerald-400/25 bg-emerald-400/[.06] p-3 text-xs text-emerald-100">🔒 Episodio terminado: esta sección queda de solo lectura. Pulsa «Desbloquear para editar» arriba si necesitas cambiar algo.</p>}
    <div className={`episode-stage-layout ${tab === "imagenes" || tab === "animacion" ? "with-inspector" : ""}`}>
    <fieldset disabled={lockedTab} className={`episode-content min-w-0 ${lockedTab ? "opacity-70" : ""}`}>
      {(tab === "imagenes" || tab === "animacion") && activeScene && <SceneRail scenes={scenes} active={activeScene.n} onSelect={setActiveSceneN} />}
      {tab === "guion" && <div className="space-y-3">
        {ficha && <details className="episode-sheet-drawer"><summary>Ficha narrativa, estructura y evaluación <span aria-hidden="true">＋</span></summary><EpisodeSheet ficha={ficha} bible={out.bible} score={out.selfScore} cast={cast} scenes={scenes.length} seconds={fullDuration} /></details>}
        {!ficha && !!(out.hook || []).length && <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-4"><p className="text-[11px] font-semibold uppercase tracking-wider text-amber-300">Gancho de los primeros 3 s</p><p className="mt-1 text-lg font-bold">{(out.hook || []).join(" / ")}</p></div>}
        {scenes.length ? <SceneDirector out={out} episodeId={episodeId} usuario={userId || "local"} cast={cast} master={master} checks={data.clipChecks.filter((c: any) => c.episodeId === episodeId)} referenceSignature={referenceSignature}
          finished={finished} productionReady={productionReady} promptsOutdated={promptsOutdated} refreshing={refreshing} active={activeScene.n} onSelect={setActiveSceneN}
          onCambiar={onCambiar} onRefreshPrompts={refresh} onIrA={(t: any) => setTab(t)} /> : (out.scriptBlocks || []).map((b: any, i: number) => (
          <div key={i} className="rounded-xl bg-[#121826] p-4">
            <p className="text-xs font-semibold text-amber-300">Bloque {b.block ?? i + 1} · {b.time}</p>
            {b.scene && <p className="mt-1 text-sm text-slate-400">{b.scene}</p>}
            <div className="mt-2 space-y-1">{(b.dialogue || []).map((d: any, j: number) => <p key={j} className="text-sm"><b>{d.speaker}:</b> “{d.text}”</p>)}</div>
          </div>
        ))}
        {out.dialogueRules && <p className="text-xs text-slate-500">{out.dialogueRules}</p>}
      </div>}
      {tab === "elenco" && <div>
        {onImportarPersonajes && !finished && <CompletarFichas cast={cast} master={master} scenes={scenes} ocupado={!!adaptando} onCompletar={onImportarPersonajes} />}
        {onImportarPersonajes && !finished && <div className="mb-4"><ImportarPersonajes onImportar={onImportarPersonajes} ocupado={!!adaptando} /></div>}
        <p className="mb-3 text-sm text-slate-300">Genera la ficha una vez en Flow, guárdala aquí y apruébala. En todos los episodios siguientes se usa esta referencia maestra, no una ficha inventada de nuevo.</p>
        <div className="episode-character-gallery grid gap-3 md:grid-cols-2">{cast.map((generated: any, i: number) => { const c = master[i] || generated; return <article key={c.name} className="rounded-2xl border border-white/10 bg-[#151C2B] p-4">
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
            {c.imageUrl && <ReferencePreview src={c.imageUrl} title={c.name} previous={c.referenceHistory?.at(-1)?.imageUrl} previousLabel={`Ficha aprobada v${c.referenceHistory?.at(-1)?.version || 1}`} />}
            <p className={`text-xs font-semibold ${c.referenceApprovedAt ? "text-emerald-300" : "text-amber-200"}`}>{c.referenceApprovedAt ? `✓ Ficha aprobada · versión ${c.referenceVersion || 1}` : c.imageUrl ? "Ficha pendiente de aprobación" : "Falta subir la ficha de Flow"}</p>
            {c.id && <div className="mt-2 flex flex-wrap gap-2 text-xs"><label className="cursor-pointer rounded-lg border border-white/15 px-3 py-1.5">{c.imageUrl ? "Nueva versión" : "Subir ficha"}<input type="file" accept="image/*" className="sr-only" onChange={e => uploadMaster(c, e.target.files?.[0])} /></label>{c.imageUrl && <><button type="button" onClick={() => { void update("characters", c.id, { referenceApprovedAt: new Date().toISOString() }); }} className="rounded-lg bg-emerald-400 px-3 py-1.5 font-bold text-slate-950">Aprobar</button><a href={c.imageUrl} download={`${c.name}-ficha-v${c.referenceVersion || 1}.png`} className="rounded-lg border border-white/15 px-3 py-1.5">Descargar copia</a></>}</div>}
          </div>
          {c.flowPrompt && <details className="prompt-box mt-3"><summary><span>Prompt de ficha para Flow</span></summary><PromptWorkbench title={`Ficha de ${c.name}`} prompt={c.flowPrompt} context="Identidad visual canónica" /></details>}
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
        <ol className="space-y-3">{scenes.filter((s: any) => s.n === activeScene?.n).map((s: any) => <li key={s.n} className="rounded-2xl border border-white/10 bg-[#151C2B] p-4">
          <div className="flex flex-wrap items-center gap-2"><span className="rounded-lg bg-amber-400 px-2 py-0.5 text-xs font-black text-black">{sceneId(s.n)}</span><span className="text-sm font-semibold">{s.title}</span><span className="text-xs text-slate-400">· {s.shot}</span></div>
          <RefChips refs={s.references} />
          <details className="prompt-box mt-2"><summary><span>Prompt para imagen (Flow)</span></summary><PromptWorkbench title={`Imagen · Escena ${s.n}`} prompt={s.imagePromptFlow || ""} context={(s.references || []).join(" · ")} /></details>
        </li>)}</ol>
      </div>}
      {tab === "animacion" && productionReady && <div>
        <div className="mb-3 rounded-xl border border-white/10 bg-[#151C2B] p-3 text-xs text-slate-300">{scenes.length ? "Fase 3: usa cada imagen aprobada como primer fotograma y pega su prompt en Pavo IA / Seedance. " : ""}{out.dolaIsAdaptation ? `La versión Dola dura ${dolaDuration} s y conserva el inicio y el cierre. Escenas: ${(out.dolaSceneNumbers || []).join(", ")}.` : `La versión Dola cubre el episodio completo de ${fullDuration} s.`}</div>
        {fromAI && <label className="mb-3 flex items-start gap-2 rounded-xl border border-white/10 bg-white/[.03] p-3 text-xs text-slate-200"><input type="checkbox" className="mt-0.5" checked={reviewed} onChange={event => setReviewed(event.target.checked)} />He revisado el guion, los personajes y la duración antes de abrir Dola.</label>}
        <details className="prompt-box"><summary><span>Prompt Dola {dolaDuration} s{out.dolaIsAdaptation ? " · adaptación" : ""}</span></summary><PromptWorkbench title={`Dola · ${dolaDuration} segundos`} prompt={out.dolaPrompt || ""} />{fromAI && reviewed && <div className="p-3"><DolaButton text={out.dolaPrompt || ""} label="Copiar original y abrir Dola" /></div>}</details>
        {scenes.length ? <>
          <div className="my-3 flex flex-wrap gap-2"><CopyButton text={lote.animaciones} label="Copiar todas las animaciones" /><CopyButton text={lote.dialogos} label="Diálogos en limpio" /></div>
          <ol className="space-y-3">{scenes.filter((s: any) => s.n === activeScene?.n).map((s: any) => <li key={s.n} className="rounded-2xl border border-white/10 bg-[#151C2B] p-4">
            <div className="flex flex-wrap items-center gap-2"><span className="rounded-lg bg-amber-400 px-2 py-0.5 text-xs font-black text-black">{String(s.n).padStart(2, "0")}</span><span className="text-sm font-semibold">{s.title}</span><span className="text-xs text-slate-400">· primer fotograma: imagen {sceneId(s.n)}</span></div>
            <RefChips refs={s.references} />
            <details className="prompt-box mt-2"><summary><span>Prompt para animación (Pavo IA / Seedance)</span></summary><PromptWorkbench title={`Animación · Escena ${s.n}`} prompt={s.animationPrompt || ""} context="Revisa diálogo, cámara y continuidad antes de generar." /></details>
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
        {onAdaptarGuion && !finished && <AdaptarGuionEpisodio onAdaptar={onAdaptarGuion} ocupado={!!adaptando} escenas={scenes.length} />}
        <p className="text-sm text-slate-300">Portada: <b>{out.coverText}</b></p>
        <p className="text-sm text-slate-400">{out.description} {(out.hashtags || []).join(" ")}</p>
        <div className="flex flex-wrap gap-2">
          <DownloadJson data={{ ...(out.guionJson || {}), ...(aspecto === "16:9" ? { formato: "16:9" } : {}) }} filename="guion.json" />
          {cast.length > 0 && <DownloadText text={episodeMarkdown(out, seriesTitle, part)} filename={`produccion-ep${part}.md`} label="Descargar producción completa (.md)" />}
          {scenes.length > 0 && <DownloadText text={lote.full} filename={`lote-flow-ep${part}.txt`} label="Descargar escenas para Flow (.txt)" />}
          <DownloadJson data={out.platformAdaptations || []} filename="adaptaciones-plataformas.json" />
          <DownloadJson data={capituloParaExportar(out, seriesTitle, cast, master)} filename={`capitulo-ep${part}.json`} />
          {cast.length > 0 && <DownloadJson data={{ formato: "estudio-viral/personajes", personajes: personajesParaExportar(cast, master) }} filename="personajes.json" />}
        </div>
        <p className="text-xs text-slate-500">capitulo.json y personajes.json tienen la estructura del estudio: sirven de plantilla para pedir capítulos a otra IA y se suben en «Nueva historia → Subir capítulo de otra IA» sin gastar IA.</p>
        <p className="text-xs text-slate-500">guion.json es el archivo para el montaje con subtitular.py. El .md trae la ficha del episodio, el guion por escenas, las 3 fases y el paquete de redes.</p>
      </div>}
      {tab === "mesa" && productionReady && <SceneDesk key={episodeId} onDownloaded={onFinish} publish={pack} cover={{ serie: seriesTitle, frase: (out.cover?.lines || out.guionJson?.gancho || []).slice(0, 2), parte: part }} music={{ series: seriesTitle, logline: out.seriesBible?.logline, episodeTitle: out.title, summary: out.summary, closing: cliffhangerOf(out) }} recap={recap} episodeId={episodeId} scenes={scenes} guion={{ ...(out.guionJson || {}), ...(aspecto === "16:9" ? { formato: "16:9" } : {}) }} title={`${seriesTitle || "serie"} ${part}`} referencesReady={referencesReady} referenceSignature={referenceSignature} style={episodeStyle} part={part} />}
      {(tab === "imagenes" || tab === "animacion" || tab === "mesa") && !productionReady && <p className="rounded-xl border border-amber-400/25 bg-amber-400/10 p-4 text-sm text-amber-100">Revisa los personajes canónicos y la versión de sus fichas maestras antes de continuar.</p>}
    </fieldset>
    {(tab === "imagenes" || tab === "animacion") && <aside className="episode-context-inspector"><header className="stage-panel-header"><span className="studio-eyebrow">INSPECTOR DE PRODUCCIÓN</span><span aria-hidden="true">⌘</span></header><div className="stage-inspector-body"><p className="studio-eyebrow cinematic-gold">ESCENA {activeScene?.n || "—"}</p><h3>{activeScene?.title || "Dirección visual"}</h3><p className="stage-inspector-intro">{activeScene?.setting || activeScene?.goal || out.summary}</p><dl><div><dt>Proyecto</dt><dd>{seriesTitle || out.title}</dd></div><div><dt>Duración del episodio</dt><dd>{fullDuration} s</dd></div><div><dt>Estado de continuidad</dt><dd>{productionReady ? "Fichas aprobadas y vigentes" : "Revisión de fichas pendiente"}</dd></div>{activeScene?.shot && <div><dt>Plano</dt><dd>{activeScene.shot}</dd></div>}</dl><p className="studio-eyebrow">REFERENCIAS DEL ELENCO</p><div className="inspector-reference-row">{master.filter(Boolean).map((c: any) => <button key={c.id || c.name} type="button" onClick={() => setTab("elenco")}>{c.imageUrl ? <img src={c.imageUrl} alt={`Referencia de ${c.name}`} /> : <span aria-hidden="true">◎</span>}<small>{c.name}</small></button>)}</div><button type="button" className="studio-secondary-action w-full" onClick={() => setTab("guion")}>Volver al guion ↗</button><p className="stage-inspector-help">Los prompts se preparan aquí. Las imágenes y los clips se generan en el proveedor que elijas.</p></div></aside>}
    </div>
  </section>;
}

// Tarjeta de serie del inicio: toda la tarjeta abre la serie.
// Orden de las redes en el Generador: primero los canales de vídeo largo.
const REDES: string[] = ["Facebook", "YouTube", "TikTok", "Instagram", "YouTube Shorts"];
const REDES_LARGO = new Set(["Facebook", "YouTube"]);
const cuentasPorRed = (accounts: any[]) => REDES.map(red => ({ red, cuentas: accounts.filter((a: any) => a.platform === red) })).filter(g => g.cuentas.length);

// Paso obligatorio al crear una serie: el canal (red + cuenta), su formato y a qué otras cuentas van los clips.
function CanalPicker({ accounts, accountId, onAccount, formato, onFormato, largoPosible, clipIds, onClipIds, estilo }: { accounts: any[]; accountId: string; onAccount: (id: string) => void; formato: "corto" | "largo"; onFormato: (f: "corto" | "largo") => void; largoPosible: boolean; clipIds: string[]; onClipIds: (ids: string[]) => void; estilo?: string }) {
  // Sin cuentas, o al elegir «＋ Conectar una cuenta nueva», se registra aquí mismo y queda elegida.
  const [nueva, setNueva] = useState(false);
  if (!accounts.length || nueva) return <fieldset className="rounded-xl border border-amber-400/40 bg-amber-400/[.05] p-4">
    <legend className="field-label">Canal de la serie <span className="normal-case tracking-normal text-amber-300">· {accounts.length ? "cuenta nueva" : "aún no tienes cuentas: registra la primera"}</span></legend>
    <NuevaCuenta estilo={estilo} onCreada={id => { setNueva(false); onAccount(id); }} onCancelar={accounts.length ? () => setNueva(false) : undefined} />
  </fieldset>;
  const otras = accounts.filter((a: any) => a.id !== accountId);
  return <fieldset className={`rounded-xl border p-4 ${accountId ? "border-white/10" : "border-amber-400/40 bg-amber-400/[.05]"}`}>
    <legend className="field-label">Canal de la serie <span className="normal-case tracking-normal text-amber-300">· obligatorio{accountId ? "" : ": elige dónde se publica"}</span></legend>
    <select value={accountId} onChange={e => { if (e.target.value === NUEVA_CUENTA) setNueva(true); else onAccount(e.target.value); }} aria-label="Canal de la serie">
      <option value="">Elige la red y la cuenta…</option>
      {cuentasPorRed(accounts).map(g => <optgroup key={g.red} label={g.red === "YouTube" ? "YouTube (vídeos largos)" : g.red}>{g.cuentas.map((a: any) => <option key={a.id} value={a.id}>{a.name} · {a.platform}</option>)}</optgroup>)}
      <option value={NUEVA_CUENTA}>＋ Conectar una cuenta nueva…</option>
    </select>
    {accountId && <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <div><p className="text-xs text-slate-300">Formato</p>
        <div className="mt-1 flex flex-wrap gap-2">{([["corto", "Corto · 9:16 (Reels, TikTok, Shorts)"], ["largo", "Largo · 16:9 (Facebook, YouTube)"]] as const).map(([k, l]) =>
          <button key={k} type="button" disabled={k === "largo" && !largoPosible} aria-pressed={formato === k} onClick={() => onFormato(k)} className={`rounded-full border px-3 py-1.5 text-xs disabled:opacity-40 ${formato === k ? "border-amber-400/60 bg-amber-400/10 text-amber-100" : "border-white/10 text-slate-300"}`}>{l}</button>)}</div>
        {!largoPosible && <p className="mt-1 text-[11px] text-slate-500">El formato largo es para canales de Facebook o YouTube.</p>}
        {formato === "largo" && <p className="mt-1 text-[11px] text-slate-400">Serie larga: las fichas de personajes, las imágenes de escena y los prompts de animación salen en horizontal 16:9. Si ya tenías episodios, abre cada uno y pulsa «Actualizar prompts» para pasarlos a 16:9.</p>}
      </div>
      {otras.length > 0 && <div><p className="text-xs text-slate-300">Clips para otras cuentas <span className="text-slate-500">(opcional)</span></p>
        <div className="mt-1 space-y-1">{otras.map((a: any) => <label key={a.id} className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" className="w-auto" checked={clipIds.includes(a.id)} onChange={e => onClipIds(e.target.checked ? [...clipIds, a.id] : clipIds.filter(x => x !== a.id))} />{a.name} · {a.platform}</label>)}</div></div>}
    </div>}
  </fieldset>;
}

// Canal de una serie abierta: se ve siempre y se puede cambiar.
function CanalSerie({ serie, accounts, onSave }: { serie: any; accounts: any[]; onSave: (patch: any) => void }) {
  const [editando, setEditando] = useState(false);
  const [nueva, setNueva] = useState(false);
  const elegir = (id: string) => { onSave({ accountId: id, ...(REDES_LARGO.has(accounts.find((a: any) => a.id === id)?.platform) ? {} : { format: "corto" }) }); setEditando(false); };
  if (!serie) return null;
  const acc = accounts.find((a: any) => a.id === serie.accountId);
  const clips = (serie.clipAccountIds || []).map((id: string) => accounts.find((a: any) => a.id === id)).filter(Boolean);
  return <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
    {acc ? <span className="rounded-full border border-sky-400/30 bg-sky-400/10 px-2.5 py-1 font-semibold text-sky-100">📡 {acc.platform} · {acc.name}{serie.format === "largo" ? " · Largo 16:9" : " · Corto 9:16"}</span>
      : <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 font-semibold text-amber-100">Sin canal</span>}
    {clips.map((a: any) => <span key={a.id} className="rounded-full border border-white/10 px-2 py-0.5 text-slate-300">✂ {a.platform} · {a.name}</span>)}
    {!editando ? <button type="button" onClick={() => setEditando(true)} className="text-slate-400 underline hover:text-white">{acc ? "Cambiar canal" : "Anclar a un canal"}</button>
      : <select autoFocus defaultValue={serie.accountId || ""} onChange={e => { const v = e.target.value; if (v === NUEVA_CUENTA) setNueva(true); else if (v) elegir(v); }} className="w-auto py-1 text-xs" aria-label="Canal de la serie">
        <option value="">Elige el canal…</option>
        {cuentasPorRed(accounts).map(g => <optgroup key={g.red} label={g.red}>{g.cuentas.map((a: any) => <option key={a.id} value={a.id}>{a.name} · {a.platform}</option>)}</optgroup>)}
        <option value={NUEVA_CUENTA}>＋ Conectar una cuenta nueva…</option>
      </select>}
    {nueva && <div className="mt-2 w-full rounded-xl border border-white/10 p-3"><NuevaCuenta onCreada={id => { setNueva(false); elegir(id); }} onCancelar={() => setNueva(false)} /></div>}
  </div>;
}

// «Tus series» renglonadas por red: red → cuenta → series (con sus partes). Las que no tienen canal, al final.
function SeriesPorRed({ seriesList, accounts, characters, onOpen, onDelete, onAnchor }: { seriesList: any[]; accounts: any[]; characters: any[]; onOpen: (id: string) => void; onDelete: (s: any) => void; onAnchor: (s: any, accountId: string) => void }) {
  const ids = new Set(accounts.map((a: any) => a.id));
  const sinCanal = seriesList.filter((x: any) => !x.accountId || !ids.has(x.accountId));
  const card = (x: any) => <SeriesCard key={x.id} s={x} chars={characters.filter((c: any) => c.seriesId === x.id)} onOpen={() => onOpen(x.id)} onDelete={() => onDelete(x)} />;
  return <div className="mt-8 space-y-6">
    <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Tus series por red</h3>
    {cuentasPorRed(accounts).map(g => {
      const conSeries = g.cuentas.filter((a: any) => seriesList.some((x: any) => x.accountId === a.id));
      if (!conSeries.length) return null;
      return <section key={g.red} aria-label={`Series de ${g.red}`} className="rounded-2xl border border-white/10 bg-white/[.02] p-4">
        <h4 className="flex items-center gap-2 text-base font-bold">{g.red === "YouTube" ? "YouTube · vídeos largos" : g.red}<span className="text-xs font-normal text-slate-400">{seriesList.filter((x: any) => conSeries.some((a: any) => a.id === x.accountId)).length} series</span></h4>
        {conSeries.map((a: any) => <div key={a.id} className="mt-3">
          <p className="text-xs font-semibold text-sky-200">{a.name}</p>
          <div className="mt-2 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{seriesList.filter((x: any) => x.accountId === a.id).map(card)}</div>
        </div>)}
      </section>;
    })}
    {sinCanal.length > 0 && <section aria-label="Series sin canal" className="rounded-2xl border border-amber-400/30 bg-amber-400/[.04] p-4">
      <h4 className="text-base font-bold text-amber-100">Sin canal <span className="text-xs font-normal text-amber-200/80">· ánclalas a una red para verlas en su fila</span></h4>
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{sinCanal.map((x: any) => <div key={x.id} className="space-y-2">{card(x)}
        <select defaultValue="" onChange={e => e.target.value && onAnchor(x, e.target.value)} aria-label={`Anclar ${x.title} a un canal`} className="text-xs">
          <option value="">Anclar a un canal…</option>
          {cuentasPorRed(accounts).map(g => <optgroup key={g.red} label={g.red}>{g.cuentas.map((a: any) => <option key={a.id} value={a.id}>{a.name} · {a.platform}</option>)}</optgroup>)}
        </select></div>)}</div>
    </section>}
  </div>;
}

function SeriesCard({ s, chars, onOpen, onDelete }: { s: any; chars: any[]; onOpen: () => void; onDelete: () => void }) {
  return <div className="group relative flex flex-col rounded-2xl border border-white/10 bg-[#121826] p-4 transition hover:-translate-y-0.5 hover:border-amber-400/50">
    <button type="button" onClick={onOpen} className="absolute inset-0 rounded-2xl" aria-label={`Abrir la serie ${s.title}`} />
    <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-300/80">{STYLES[s.style as StyleKey]?.label || "Serie"}</p>
    <p className="mt-1 text-lg font-bold">{s.title}</p>
    <p className="mt-0.5 text-[11px] text-sky-200/80">{s.format === "largo" ? "Largo · 16:9" : "Corto · 9:16"}{s.clipAccountIds?.length ? ` · clips en ${s.clipAccountIds.length} cuenta${s.clipAccountIds.length === 1 ? "" : "s"}` : ""}</p>
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
function EpisodeSheet({ ficha, bible, score, cast, scenes, seconds }: { ficha: any; bible?: any; score: any; cast: any[]; scenes: number; seconds: number }) {
  const metrics = score ? ([["Gancho 0-1 s", score.hook], ["Claridad sin contexto", score.clarity], ["Escalada", score.escalation], ["Giro final", score.twist], ["Ganas de comentar", score.comments]] as [string, number | null][]).filter(([, v]) => v) : [];
  const avg = metrics.length ? Math.round((metrics.reduce((t, [, v]) => t + Number(v), 0) / metrics.length) * 10) / 10 : 0;
  const steps = ARC.filter(([k]) => ficha[k]);
  return <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#121826]">
    <div className="relative border-b border-white/10 bg-gradient-to-br from-amber-400/15 via-amber-400/[.04] to-transparent p-5">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-[240px] flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[.18em] text-amber-300">Ficha del episodio</p>
          {ficha.synopsis && <p className="mt-2 text-lg font-semibold leading-snug text-white">{ficha.synopsis}</p>}
          {bible?.verse && <div className="mt-3 rounded-xl border border-amber-300/25 bg-amber-300/[.07] p-3 text-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-amber-300">{bible.story || "Historia bíblica"} · {bible.verse}</p>
            {bible.verseText && <p className="mt-1 italic text-slate-200">«{bible.verseText}»</p>}
            {bible.message && <p className="mt-1 font-semibold text-white">Mensaje: {bible.message}</p>}
            {(bible.invisible || bible.impact) && <p className="mt-1 text-xs text-slate-300">{bible.invisible ? `Lo invisible que se revela: ${bible.invisible}` : ""}{bible.invisible && bible.impact ? " · " : ""}{bible.impact ? `Plano de impacto (segundo 0): ${bible.impact}` : ""}</p>}
            {bible.apocryphal && <p className="mt-1 text-xs text-amber-200">Relato apócrifo: preséntalo como «inspirado en», nunca como Palabra de Dios. El aviso va en la descripción.</p>}
            <p className="mt-1 text-[11px] text-slate-400">El versículo sale en la tarjeta final del montaje (últimos 3 s).</p>
          </div>}
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
      <ol className="mt-3 grid gap-3 md:grid-cols-5">{steps.map(([k, label, color], i) => <li key={k} className={`relative rounded-xl border bg-white/[.03] p-3 ${k === "closing" ? "border-teal-400/50 bg-teal-400/[.07]" : "border-white/10"}`} style={{ borderTopColor: color, borderTopWidth: 3 }}>
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

// Menú del tipo de pedido del compositor: solo opciones que existen (historia nueva o réplica de un viral).
type TipoPedido = "nueva" | "replica" | "adaptar";
function TipoMenu({ kind, onKind }: { kind: TipoPedido; onKind: (k: TipoPedido) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const fuera = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", fuera); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fuera); document.removeEventListener("keydown", esc); };
  }, [open]);
  const opciones = [["nueva", "Historia nueva (Parte 1)", "Una serie original desde tu idea"], ["replica", "Réplica de un viral", "Copia estructura y emoción, nunca personajes ni texto"], ["adaptar", "Adaptar guion de otra IA", "Sube o pega el guion: se pasa a escenas, fichas y prompts"]] as const;
  return <div ref={ref} className="relative">
    <button type="button" className="aurora-chip" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>{kind === "replica" ? "Réplica de un viral" : kind === "adaptar" ? "Adaptar guion de otra IA" : "Historia nueva"} <span aria-hidden="true">{open ? "▴" : "▾"}</span></button>
    {open && <div className="aurora-menu left-0 top-full mt-2" role="menu" aria-label="Tipo de pedido">{opciones.map(([k, l, d]) =>
      <button key={k} type="button" role="menuitemradio" aria-checked={kind === k} onClick={() => { onKind(k); setOpen(false); }}><span><b className="block font-semibold">{l}</b><span className="text-xs opacity-75">{d}</span></span></button>)}</div>}
  </div>;
}

// Registrar una cuenta nueva (red + nombre) sin salir de la creación de la serie. Es la cuenta de trabajo
// donde se publica; la conexión con Meta para importar métricas se hace aparte en Publish & Grow.
const NUEVA_CUENTA = "__nueva_cuenta__";
const NICHO_DE_ESTILO: Record<string, string> = { frutinovela: "frutinovelas", cristiana: "cristiano", biblica: "cristiano", epica: "cristiano", cine90: "cine90" };
function NuevaCuenta({ estilo, onCreada, onCancelar }: { estilo?: string; onCreada: (id: string) => void; onCancelar?: () => void }) {
  const { insert } = useData();
  const [f, setF] = useState({ name: "", platform: "Facebook", niche: NICHO_DE_ESTILO[estilo || ""] || "frutinovelas", audience: "", idealDuration: "" });
  const [estado, setEstado] = useState<{ busy: boolean; error: string }>({ busy: false, error: "" });
  async function crear() {
    const name = f.name.trim();
    if (!name) { setEstado({ busy: false, error: "Escribe el nombre o @usuario de la cuenta." }); return; }
    setEstado({ busy: true, error: "" });
    try { const a = await insert("accounts", { ...f, name, idealDuration: f.idealDuration || (f.platform === "YouTube" ? "15-25 min" : f.platform === "Facebook" ? "60-90 s" : "60 s") }); onCreada(a.id); }
    catch (e: any) { setEstado({ busy: false, error: `No se pudo guardar la cuenta: ${e?.message || e}. Los datos siguen aquí para reintentar.` }); }
  }
  return <div className="grid gap-3 sm:grid-cols-2" onKeyDown={e => { if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") { e.preventDefault(); void crear(); } }}>
    <div><label htmlFor="nueva-cuenta-red" className="field-label block">Red</label>
      <select id="nueva-cuenta-red" value={f.platform} onChange={e => setF({ ...f, platform: e.target.value })}>
        {[["Facebook", "Facebook (página)"], ["YouTube", "YouTube (vídeos largos)"], ["TikTok", "TikTok"], ["Instagram", "Instagram (Reels)"], ["YouTube Shorts", "YouTube Shorts"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select></div>
    <div><label htmlFor="nueva-cuenta-nombre" className="field-label block">Nombre o @usuario</label>
      <input id="nueva-cuenta-nombre" autoFocus value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Ej.: Un Minuto en Oración" /></div>
    <div><label htmlFor="nueva-cuenta-tipo" className="field-label block">Tipo de contenido</label>
      <select id="nueva-cuenta-tipo" value={f.niche} onChange={e => setF({ ...f, niche: e.target.value })}>
        <option value="frutinovelas">Frutinovelas</option><option value="cristiano">Cristiano y bíblico</option><option value="cine90">Cine de los 90</option><option value="dropshipping">Dropshipping</option>
      </select></div>
    <div><label htmlFor="nueva-cuenta-publico" className="field-label block">Público <span className="normal-case tracking-normal text-slate-500">(opcional)</span></label>
      <input id="nueva-cuenta-publico" value={f.audience} onChange={e => setF({ ...f, audience: e.target.value })} placeholder="Ej.: evangélicos dominicanos, 25-60 años" /></div>
    <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
      <button type="button" disabled={estado.busy} onClick={() => { void crear(); }} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{estado.busy ? "Guardando…" : "Conectar y usar esta cuenta"}</button>
      {onCancelar && <button type="button" onClick={onCancelar} className="text-sm text-slate-400 underline">Cancelar</button>}
      <span className="text-[11px] text-slate-500">Registra la cuenta donde publicarás. Para importar sus métricas, conéctala con Meta en Publish & Grow → Métricas.</span>
    </div>
    {estado.error && <p role="alert" className="text-xs text-rose-200 sm:col-span-2">{estado.error}</p>}
  </div>;
}

// Aviso cuando el texto de la idea pide otra cantidad de escenas o tomas que la configuración.
function AvisoEscenas({ texto, escenas, onUsar }: { texto: string; escenas: number; onUsar: (n: number) => void }) {
  const pedidas = escenasEnTexto(texto);
  if (!pedidas || pedidas === escenas) return null;
  const valida = pedidas >= MIN_SCENES && pedidas <= MAX_SCENES;
  return <p role="status" className="rounded-lg border border-amber-400/25 bg-amber-400/10 p-3 text-xs text-amber-100 sm:col-span-2">
    Tu texto pide {pedidas} escenas o tomas, pero la configuración tiene {escenas}. Se generarán {escenas}: manda la configuración.
    {valida && <> <button type="button" className="underline" onClick={() => onUsar(pedidas)}>Usar {pedidas}</button></>}
  </p>;
}

// Guion de otra IA: pegar el texto o subir el archivo (.txt, .md, .json, .srt, .fountain, .csv).
function SubirGuion({ id, valor, onValor, etiqueta = "Guion de otra IA", ayuda = "Pega aquí el guion completo (escenas, diálogos «NOMBRE: frase», narración, cámara…) o súbelo como archivo." }: { id: string; valor: string; onValor: (v: string) => void; etiqueta?: string; ayuda?: string }) {
  const [aviso, setAviso] = useState("");
  async function leer(file: File | undefined) {
    if (!file) return;
    if (/\.(docx?|pdf|pages)$/i.test(file.name)) { setAviso("Ese formato no se puede leer aquí: guárdalo como .txt o .md (o copia y pega el texto)."); return; }
    if (file.size > 2 * 1024 * 1024) { setAviso("El archivo es muy grande (más de 2 MB de texto)."); return; }
    let t = await file.text();
    if (/\.json$/i.test(file.name)) { try { t = JSON.stringify(JSON.parse(t), null, 1); } catch { /* se usa tal cual */ } }
    onValor(t); setAviso(`Cargado «${file.name}» (${t.trim().split(/\s+/).length} palabras).`);
  }
  return <div>
    <div className="flex flex-wrap items-center gap-2"><label htmlFor={id} className="field-label block">{etiqueta}</label>
      <label className="import-file-button ml-auto cursor-pointer rounded-lg border border-white/15 px-3 py-1.5 text-xs text-slate-200 hover:border-cyan-300/50">Subir archivo<input type="file" className="sr-only" accept=".txt,.md,.markdown,.json,.srt,.fountain,.csv,text/plain" aria-label={`Subir archivo: ${etiqueta}`} onChange={e => { void leer(e.target.files?.[0]); e.target.value = ""; }} /></label></div>
    <textarea id={id} className="aurora-field mt-1" rows={8} value={valor} onChange={e => { onValor(e.target.value); setAviso(""); }} placeholder={ayuda} />
    {aviso && <p role="status" className="mt-1 text-xs text-cyan-100">{aviso}</p>}
  </div>;
}

// Archivos → adaptar un guion de otra IA a este episodio (reemplaza las escenas; la versión anterior queda en el historial).
function AdaptarGuionEpisodio({ onAdaptar, ocupado, escenas }: { onAdaptar: (t: string, cuantas?: number) => Promise<void>; ocupado: boolean; escenas: number }) {
  const [texto, setTexto] = useState(""); const [error, setError] = useState("");
  // Escenas: por defecto las que trae el guion; se pueden cambiar a mano (8–30).
  const delGuion = useMemo(() => escenasDelGuion(texto), [texto]);
  const [cuantas, setCuantas] = useState(0);
  const final = sceneCountFor(88, cuantas || delGuion || 0);
  async function enviar() {
    if (!texto.trim()) { setError("Pega o sube primero el guion."); return; }
    if (escenas && !window.confirm("Las escenas actuales de este episodio se reemplazarán por la adaptación (la versión anterior queda en el historial). Las imágenes y clips ya hechos pueden dejar de coincidir. ¿Continuar?")) return;
    setError("");
    try { await onAdaptar(texto, final); setTexto(""); setCuantas(0); } catch (e: any) { setError(e?.message || String(e)); }
  }
  return <details className="import-panel import-characters">
    <summary className="cursor-pointer text-sm font-semibold text-slate-100">Adaptar un guion de otra IA a este episodio</summary>
    <div className="mt-3 space-y-2">
      <SubirGuion id="episodio-guion-externo" valor={texto} onValor={setTexto} />
      <div className="flex flex-wrap items-center gap-2"><label htmlFor="episodio-guion-escenas" className="field-label">Escenas</label>
        <select id="episodio-guion-escenas" className="w-auto" value={cuantas} onChange={e => setCuantas(Number(e.target.value))}>
          <option value={0}>{delGuion ? `Las del guion · ${sceneCountFor(88, delGuion)}` : `Automático · ${final}`}</option>
          {Array.from({ length: MAX_SCENES - MIN_SCENES + 1 }, (_, k) => MIN_SCENES + k).map(n => <option key={n} value={n}>{n} escenas</option>)}</select>
        {delGuion && delGuion > MAX_SCENES && !cuantas && <span className="text-xs text-amber-200">El guion trae {delGuion}; el máximo es {MAX_SCENES}: se unirán las menores.</span>}</div>
      <p className="text-xs text-slate-400">Pulsa «Adaptar con IA» y listo: la IA conserva la historia y el sentido de los diálogos, usa el elenco fijo de la serie y rehace escenas, fichas y prompts. Después revisa el Guion y aprueba las fichas de personajes nuevos.</p>
      {error && <p role="alert" className="text-xs text-rose-200">{error}</p>}
      <button type="button" disabled={ocupado} onClick={() => { void enviar(); }} className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-60">{ocupado ? "Adaptando…" : "✦ Adaptar con IA"}</button>
    </div>
  </details>;
}

// «1 · Personajes canónicos» → fichas de personajes escritas por otra IA (texto o JSON).
function ImportarPersonajes({ onImportar, ocupado }: { onImportar: (t: string) => Promise<void>; ocupado: boolean }) {
  const [texto, setTexto] = useState(""); const [error, setError] = useState("");
  async function enviar() {
    if (!texto.trim()) { setError("Pega o sube primero los personajes."); return; }
    setError("");
    try { await onImportar(texto); setTexto(""); } catch (e: any) { setError(e?.message || String(e)); }
  }
  return <details className="rounded-xl border border-white/10 bg-black/20 p-3">
    <summary className="cursor-pointer text-sm font-semibold text-slate-100">Importar personajes de otra IA</summary>
    <div className="mt-3 space-y-2">
      <SubirGuion id="episodio-personajes-externos" etiqueta="Personajes de otra IA" valor={texto} onValor={setTexto} ayuda="Pega las fichas (nombre, apariencia, ropa, voz, acento…) en texto o JSON, o súbelas como archivo." />
      <p className="text-xs text-slate-400">Pulsa «Adaptar personajes» y listo: los que ya existen (mismo nombre) se actualizan sin perder su imagen; los nuevos se añaden a la serie. Se rehacen los prompts de ficha y de las escenas.</p>
      {error && <p role="alert" className="text-xs text-rose-200">{error}</p>}
      <button type="button" disabled={ocupado} onClick={() => { void enviar(); }} className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-60">{ocupado ? "Adaptando…" : "✦ Adaptar personajes"}</button>
    </div>
  </details>;
}

// «Nueva historia» → capítulo (y personajes canónicos) hechos en otra IA, en JSON o texto.
function CapituloDeOtraIA({ activo, onActivar, onQuitar, capitulo, onCapitulo, personajes, onPersonajes, resumen, modo, onModo, reconocido }: { activo: boolean; onActivar: () => void; onQuitar: () => void; capitulo: string; onCapitulo: (v: string) => void; personajes: string; onPersonajes: (v: string) => void; resumen: string; modo: "fidelidad" | "creativa"; onModo: (m: "fidelidad" | "creativa") => void; reconocido: boolean }) {
  if (!activo) return <div className="import-invitation">
    <span className="flex-1 min-w-[220px] text-sm text-slate-200"><b className="text-cyan-100">¿Ya tienes el capítulo hecho en otra IA?</b> Súbelo en JSON (o texto) con sus personajes canónicos y se crea la historia desde ahí.</span>
    <button type="button" onClick={onActivar} className="rounded-lg border border-cyan-300/50 px-3 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-300/10">📄 Subir capítulo de otra IA</button>
  </div>;
  return <section className="import-panel import-composer" aria-label="Capítulo de otra IA">
    <header className="import-heading"><div><p className="studio-eyebrow">DEL GUION AL ESTUDIO</p><h3>Capítulo de otra IA</h3><p>Trae tu historia y decide cómo convertirla en producción.</p></div><button type="button" onClick={onQuitar} className="text-xs text-slate-400 hover:text-white">Quitar y volver a Historia nueva</button></header>
    <div className="import-sources">
    <div className="import-source"><span className="import-step">01 · CAPÍTULO</span>
    <SubirGuion id="generator-guion-externo" etiqueta="Capítulo (JSON o texto)" valor={capitulo} onValor={onCapitulo} ayuda="Sube el capitulo.json (estructura del estudio) o el guion de otra IA en JSON o texto." />
    </div><div className="import-source"><span className="import-step">02 · ELENCO OPCIONAL</span>
    <SubirGuion id="generator-personajes-externos" etiqueta="Personajes canónicos (JSON o texto, opcional)" valor={personajes} onValor={onPersonajes} ayuda="Sube personajes.json o pega las fichas (nombre, apariencia, ropa, voz…). Si no, se toman del capítulo." />
    </div></div>
    {reconocido && <fieldset className="import-modes"><legend className="field-label mb-1">Cómo usar el capítulo</legend>
      {([["fidelidad", "Fidelidad (recomendado)", "Conserva diálogos, hablantes, orden y personajes. La app añade dirección de cámara, acción visual y prompts."], ["creativa", "Adaptación creativa", "La IA puede reescribir, reorganizar o ampliar escenas. Verás qué cambió."]] as const).map(([k, t, d]) =>
        <label key={k} data-selected={modo === k}><input type="radio" name="modo-importacion" checked={modo === k} onChange={() => onModo(k)} /><b>{t}</b><span>{d}</span></label>)}
    </fieldset>}
    {resumen && <p role="status" className="import-recognition">{resumen}</p>}
    <p className="text-xs text-slate-400">Luego pulsa «Crear serie y episodio 1». La idea de abajo es opcional (ajustes para la adaptación).</p>
  </section>;
}

// Exportar con la estructura del estudio (se vuelve a importar tal cual en «Subir capítulo de otra IA»).
const CAMPOS_PERSONAJE = ["name", "role", "fruit", "fruitEmoji", "headES", "visualES", "visualEN", "clothing", "voice", "speechStyle", "subtitleColor", "pronunciations", "flowPrompt"];
function personajesParaExportar(cast: any[], master: any[]) {
  return cast.map((c: any, i: number) => { const m = { ...c, ...(master[i] || {}) }; return Object.fromEntries(CAMPOS_PERSONAJE.filter(k => m[k] !== undefined && m[k] !== "").map(k => [k, m[k]])); });
}
function capituloParaExportar(out: any, seriesTitle: string, cast: any[], master: any[]) {
  const { referenceVersions: _r, versions: _v, ...episodio } = out || {};
  return { formato: "estudio-viral/capitulo", series: { title: seriesTitle, style: out?.seriesBible?.style }, episode: { ...episodio, cast: personajesParaExportar(cast || [], master || []) }, characters: personajesParaExportar(cast || [], master || []) };
}

// Personajes con ficha de relleno (sin descripción real): la IA las escribe a partir del guion del episodio.
function CompletarFichas({ cast, master, scenes, ocupado, onCompletar }: { cast: any[]; master: any[]; scenes: any[]; ocupado: boolean; onCompletar: (t: string, o: { soloNombres: string[] }) => Promise<void> }) {
  const [error, setError] = useState("");
  const nombres = cast.map((c: any, i: number) => master[i] || c).filter((c: any) => fichaGenerica(c)).map((c: any) => c.name);
  if (!nombres.length || !scenes.length) return null;
  async function completar() {
    setError("");
    const texto = `Escribe las fichas de: ${nombres.join(", ")}. Descríbelos según este guion: época, edad, rol, apariencia física fija, vestuario y voz. No cambies sus nombres.
PERSONAJES DE LA SERIE:
${cast.map((c: any) => `- ${c.name}: ${c.role || ""}`).join("\n")}
GUION DEL EPISODIO:
${scenes.map((x: any) => `[${x.setting || ""}] ${x.speaker}: ${x.line}`).join("\n")}`;
    try { await onCompletar(texto, { soloNombres: nombres }); } catch (e: any) { setError(e?.message || String(e)); }
  }
  return <div role="status" className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">
    <span className="flex-1 min-w-[220px]"><b>{nombres.join(", ")}</b> {nombres.length > 1 ? "tienen" : "tiene"} una ficha genérica (sin descripción real). La IA puede escribirla a partir del guion de este episodio.</span>
    <button type="button" disabled={ocupado} onClick={() => { void completar(); }} className="rounded-lg bg-amber-400 px-3 py-2 text-xs font-bold text-slate-950 disabled:opacity-60">{ocupado ? "Escribiendo…" : "✦ Completar fichas desde el guion"}</button>
    {error && <p role="alert" className="w-full text-xs text-rose-200">{error}</p>}
  </div>;
}

// Capítulo importado: modo, diferencias con el original y revisión de continuidad (personajes, narrador, formato…).
function RevisionImportacion({ out }: { out: any }) {
  const problemas: { nivel: string; mensaje: string }[] = out.validacion || [];
  const errores = problemas.filter(p => p.nivel === "error");
  const a = out.adaptacion || {};
  const lista = [...(a.avisos || []), ...(a.cambios || [])];
  return <details className="import-panel import-continuity" data-errors={errores.length > 0} open={errores.length > 0}>
    <summary className="cursor-pointer text-sm font-semibold">Revisión de continuidad · {a.modo === "creativa" ? "adaptación creativa" : "modo fidelidad"} · {a.original ? `${a.original} clips originales → ${a.escenas} escenas · ` : ""}{errores.length ? `${errores.length} error(es)` : "sin errores"}, {problemas.length - errores.length} aviso(s){a.cambios?.length ? ` · ${a.cambios.length} cambio(s)` : ""}</summary>
    {!!problemas.length && <ul className="mt-2 space-y-1">{problemas.map((p, i) => <li key={i}><b>{p.nivel === "error" ? "Error" : "Aviso"}:</b> {p.mensaje}</li>)}</ul>}
    {!!lista.length && <><p className="mt-3 font-semibold">{a.modo === "creativa" ? "Cambios respecto al original" : "Notas de la importación"}</p><ul className="mt-1 space-y-1">{lista.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></>}
  </details>;
}

// Revisión de dirección cinematográfica de un episodio guardado: se calcula sin IA ni créditos, se revisa como
// vista previa textual y solo se guarda si se aprueba (como versión nueva; la anterior queda en el historial).
function RevisionDireccion({ out, titulo, maestros, aspecto, onAplicar }: { out: any; titulo: string; maestros: any[]; aspecto: "9:16" | "16:9"; onAplicar: (p: any) => Promise<any> }) {
  const [rev, setRev] = useState<ReturnType<typeof redirigirEpisodio> | null>(null);
  const [estado, setEstado] = useState(""); const [guardando, setGuardando] = useState(false);
  const style = (out?.seriesBible?.style || (out?.cast?.some((c: any) => c.fruit) ? "frutinovela" : "cine90")) as StyleKey;
  // Texto de referencia para clasificar las frases: el incluido que citan las fichas, o uno subido.
  const sugerida = useMemo(() => fuenteSugerida(maestros.map((c: any) => c?.bible?.canon?.referenciaBiblica || "").filter(Boolean)), [maestros]);
  const [fuente, setFuente] = useState<Fuente | null | undefined>(undefined);
  const fuenteActiva = fuente === undefined ? sugerida : fuente;
  async function subirFuente(file?: File) { if (!file) return; const f = fuenteDeTexto(await file.text(), file.name.replace(/\.[^.]+$/, "")); if (f) { setFuente(f); setRev(null); } else setEstado("No se reconocieron pasajes («Libro 1:2 texto» por línea o JSON con «pasajes»)."); }
  function proponer() { try { setRev(redirigirEpisodio(out, maestros, style, aspecto, { fuente: fuenteActiva })); setEstado(""); } catch (e: any) { setEstado(`No se pudo calcular: ${e?.message || e}`); } }
  async function aprobar() {
    if (!rev) return; setGuardando(true);
    try { await onAplicar(rev.propuesta); setEstado("Revisión guardada como versión nueva. La anterior quedó en el historial del episodio. No se generó ninguna imagen ni vídeo."); setRev(null); }
    catch (e: any) { setEstado(`No se guardó: ${e?.message || e}`); } finally { setGuardando(false); }
  }
  const md = rev ? vistaPreviaRevision(titulo, rev.filas, rev.duraciones, rev.validacion, fuenteActiva ? `${fuenteActiva.titulo}${fuenteActiva.version ? ` · ${fuenteActiva.version}` : ""}${fuenteActiva.licencia ? ` (${fuenteActiva.licencia})` : ""}` : undefined) : "";
  const errores = rev ? rev.validacion.filter(p => p.nivel === "error").length : 0;
  const cambiosPresencia = rev ? rev.filas.filter(f => f.antes.visibles.join(",") !== f.despues.visibles.join(",")).length : 0;
  return <details className="import-panel direction-review">
    <summary className="cursor-pointer text-sm font-semibold">Dirección cinematográfica · revisión de escenas, cámara y beats</summary>
    <p className="mt-2 text-slate-300">Propone plano, cámara, imagen fija, acción de vídeo, quién está en cuadro, beat y duración para cada escena, mirando toda la secuencia. No cambia diálogos, hablantes, orden ni fichas, y no gasta créditos: primero revisas la vista previa y después decides.</p>
    <div className="mt-2 flex flex-wrap items-center gap-2 text-slate-300"><span><b>Texto de referencia:</b> {fuenteActiva ? `${fuenteActiva.titulo}${fuenteActiva.version ? ` · ${fuenteActiva.version}` : ""}${fuenteActiva.licencia ? ` (${fuenteActiva.licencia})` : ""}` : "ninguno (no se clasifican las frases)"}</span>
      {fuenteActiva && <button type="button" className="underline" onClick={() => { setFuente(null); setRev(null); }}>Quitar</button>}
      <label className="import-file-button cursor-pointer underline">Subir otro texto<input type="file" className="sr-only" accept=".txt,.md,.json" aria-label="Subir texto de referencia" onChange={e => { void subirFuente(e.target.files?.[0]); e.target.value = ""; }} /></label></div>
    {!rev && <button type="button" onClick={proponer} className="mt-2 rounded-lg bg-amber-400 px-3 py-2 text-xs font-bold text-slate-950">✦ Proponer revisión de dirección</button>}
    {rev && <div className="mt-3 space-y-2">
      <p role="status"><b>{rev.filas.length} escenas</b> · {cambiosPresencia} con cambios de quién está en cuadro · revisión: {errores ? `${errores} error(es)` : "sin errores"}, {rev.validacion.length - errores} aviso(s)</p>
      <p><b>Duración:</b> tomas {rev.filas.length} × {rev.filas[0]?.duracion.toma} s = {rev.duraciones.tomas.actual} s · montaje tal cual ~{rev.duraciones.montajeActual} s (clips {rev.duraciones.desglose.clipsActual} s + tarjetas {rev.duraciones.desglose.tarjetas} s + cierre {rev.duraciones.desglose.cierre} s){rev.duraciones.noCaben.length ? <> · <b>{rev.duraciones.noCaben.length} frase(s) no caben ({rev.duraciones.noCaben.map(f => `${f.n}`).join(", ")})</b>: con la propuesta ~{rev.duraciones.montaje} s</> : " · todas las frases caben"}. No se cambia el montaje hasta que lo decidas.</p>
      <ol className="direction-scenes" aria-label="Vista previa de dirección por escena" tabIndex={0}>{rev.filas.map(f => <li key={f.n}>
        <header><span className="import-step">ESCENA {String(f.n).padStart(2, "0")}</span><h4>{f.despues.title}</h4></header><blockquote><b>{f.speaker}</b><p>«{f.line}»</p></blockquote>
        <div className="mt-1 text-slate-300"><b>Beat:</b> {f.despues.goal}</div>
        <div className="text-slate-300"><b>En cuadro:</b> {f.despues.visibles.join(", ") || "nadie"}{f.antes.visibles.join(",") !== f.despues.visibles.join(",") && <span className="text-amber-200"> (antes: {f.antes.visibles.join(", ") || "nadie"})</span>}</div>
        <div className="text-slate-300"><b>{f.despues.shotType}.</b> {f.despues.camera}</div>
        <div className="text-slate-300"><b>Imagen:</b> {f.despues.visualAction}</div>
        <div className="text-slate-300"><b>Vídeo:</b> {f.despues.videoAction}</div>
        {(!f.duracion.cabe || f.duracion.alLimite) && <div className="text-amber-200"><b>Duración:</b> ~{f.duracion.locucion} s de voz en una toma de {f.duracion.toma} s{f.duracion.alLimite ? " (al límite)" : ""}. {f.duracion.propuesta}</div>}
        {f.texto && <div className="text-slate-300"><b>Texto:</b> {ETIQUETA_CLASE[f.texto.clase]}{f.texto.refs.length ? ` — ${f.texto.refs.join(", ")}` : ""}</div>}
        {f.despues.fidelityNote && <div className="text-slate-400"><b>Fidelidad:</b> {f.despues.fidelityNote}</div>}
      </li>)}</ol>
      <div className="flex flex-wrap gap-2">
        <DownloadText text={md} filename="revision-direccion.md" label="Descargar vista previa (.md)" />
        <button type="button" disabled={guardando} onClick={() => { void aprobar(); }} className="rounded-lg bg-amber-400 px-3 py-2 text-xs font-bold text-slate-950 disabled:opacity-60">{guardando ? "Guardando…" : "Aprobar y guardar revisión"}</button>
        <button type="button" onClick={() => setRev(null)} className="rounded-lg border border-white/15 px-3 py-2 text-xs">Descartar</button>
      </div>
    </div>}
    {estado && <p role="status" className="mt-2 text-cyan-100">{estado}</p>}
  </details>;
}

// Tiempos del montaje: vídeo generado, voz y montaje por escena. La voz no decide sola dónde termina la escena:
// en modo cinematográfico se conserva un margen de acción según el peso del momento. Nada se guarda sin aprobar.
function TiemposMontaje({ out, usuario, episodeId, onAplicar }: { out: any; usuario: string; episodeId?: string; onAplicar: (p: any) => Promise<any> }) {
  const style = (out?.seriesBible?.style || (out?.cast?.some((c: any) => c.fruit) ? "frutinovela" : "cine90")) as StyleKey;
  const escenas: any[] = out?.scenes || [];
  const [modo, setModo] = useState<ModoMontaje>(out?.tiemposMontaje?.modo || "cinematografico");
  const [dec, setDec] = useState<Record<number, { toma: number; margen: number }>>({});
  const [med, setMed] = useState<Record<number, Medicion>>({});
  const [estado, setEstado] = useState(""); const [ocupado, setOcupado] = useState(false);
  const virtuales = escenas.map(sc => dec[sc.n] ? { ...sc, tomaSeg: dec[sc.n].toma, margenAccion: dec[sc.n].margen } : sc);
  const base = { tomaBase: segundosClip(style), modo, mediciones: med, tarjetas: out?.guionJson?.tarjetas || [], cierre: !!out?.guionJson?.cierre };
  const plan = planTiempos(virtuales, base);
  const actual = planTiempos(escenas, { ...base, mediciones: {} });
  const cambios = Object.keys(dec).length;
  const problemas = plan.filas.reduce((a, f) => a + f.problemas.length, 0);
  function recomendar() { setDec(Object.fromEntries(plan.filas.map(f => [f.n, { toma: f.tomaRecomendada, margen: f.margenDeseado }]))); setEstado("Recomendación aplicada en la vista. Revísala y apruébala para guardarla."); }
  async function medir() {
    if (!episodeId) return; setOcupado(true); setEstado("");
    try {
      const a = await cargarArchivos(usuario, episodeId);
      const res: Record<number, Medicion> = {};
      for (const [n, f] of Object.entries(a.clip)) { try { res[Number(n)] = await medirClip(f); } catch { /* clip ilegible */ } }
      setMed(res); setEstado(Object.keys(res).length ? `Medidos ${Object.keys(res).length} clip(s): se usan su duración y la voz real.` : "No hay clips subidos en este navegador: las voces siguen estimadas por palabras.");
    } finally { setOcupado(false); }
  }
  async function aprobar() {
    setOcupado(true);
    try {
      const decisiones = plan.filas.map(f => ({ n: f.n, toma: dec[f.n]?.toma ?? f.video, margen: dec[f.n]?.margen ?? f.margenDeseado }));
      await onAplicar(aplicarTiempos(out, decisiones, modo, plan.totales.montaje));
      setDec({}); setEstado("Tiempos guardados como versión nueva (la anterior queda en el historial). No se generó nada.");
    } catch (e: any) { setEstado(`No se guardó: ${e?.message || e}`); } finally { setOcupado(false); }
  }
  return <details className="import-panel direction-review timing-workspace">
    <summary className="cursor-pointer text-sm font-semibold">Tiempos del montaje · vídeo, voz, acción y montaje por escena</summary>
    <p className="mt-2 text-slate-300">La voz no decide sola cuándo termina la escena. En modo cinematográfico se conserva un margen de acción o reacción tras la frase según el momento (llegadas y batallas más). {plan.motor} genera tomas de {plan.duraciones.join(", ")} s.</p>
    <div className="timing-toolbar">
      <label className="text-xs">Montaje <select aria-label="Modo de montaje" className="w-auto" value={modo} onChange={e => setModo(e.target.value as ModoMontaje)}><option value="cinematografico">Cinematográfico (conserva la acción)</option><option value="viral">Viral (corta tras la voz)</option></select></label>
      <button type="button" onClick={recomendar} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs">Aplicar recomendación</button>
      <button type="button" disabled={ocupado || !episodeId} onClick={() => { void medir(); }} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs">Medir clips subidos (voz real)</button>
    </div>
    <p role="status" className="mt-2 text-xs"><b>Vídeo:</b> {plan.totales.video} s{plan.totales.video !== actual.totales.video ? ` (ahora ${actual.totales.video} s: ${plan.totales.video > actual.totales.video ? "+" : ""}${Math.round((plan.totales.video - actual.totales.video) * 10) / 10} s a generar)` : ""} · <b>Voz:</b> {plan.totales.voz} s ({plan.medidas ? `${plan.medidas} medida(s)` : "estimada"}) · <b>Montaje:</b> ~{plan.totales.montaje} s (incluye tarjetas {plan.totales.tarjetas} s y cierre {plan.totales.cierre} s) · {problemas ? <b>{problemas} aviso(s)</b> : "sin avisos"}</p>
    <dl className="timing-totals" aria-label="Duraciones de la vista previa">
      <div><dt>VÍDEO A GENERAR</dt><dd>{plan.totales.video}<small> s</small></dd><dd className="timing-description">Duración total de las tomas</dd></div>
      <div><dt>VOZ {plan.medidas ? "CON MEDICIONES" : "ESTIMADA"}</dt><dd>{plan.totales.voz}<small> s</small></dd><dd className="timing-description">{plan.medidas ? `${plan.medidas} clip(s) medido(s)` : "Calculada por palabras"}</dd></div>
      <div><dt>MONTAJE ESTIMADO</dt><dd>~{plan.totales.montaje}<small> s</small></dd><dd className="timing-description">Incluye tarjetas y cierre</dd></div>
    </dl>
    <div className="timing-table-scroll" role="region" aria-label="Tiempos editables por escena" tabIndex={0}><table><caption className="sr-only">Vista previa de tiempos. Revisa cada escena y aprueba al terminar para guardar.</caption><thead><tr><th scope="col">Escena</th><th scope="col">Vídeo</th><th scope="col">Voz</th><th scope="col">Margen de acción</th><th scope="col">Montaje</th><th scope="col">Estado</th></tr></thead><tbody>
      {plan.filas.map(f => <tr key={f.n} className="border-t border-white/10 align-top">
        <td className="py-1 pr-2"><b>{f.n}</b><div className="text-slate-400">{f.speaker}</div></td>
        <td className="pr-2"><select aria-label={`Toma de la escena ${f.n}`} className="w-auto" value={dec[f.n]?.toma ?? f.video} onChange={e => setDec(d => ({ ...d, [f.n]: { toma: Number(e.target.value), margen: d[f.n]?.margen ?? f.margenDeseado } }))}>{Array.from(new Set([...plan.duraciones, f.video])).sort((a, b) => a - b).map(x => <option key={x} value={x}>{x} s</option>)}</select>{f.tomaRecomendada !== f.video && <div className="text-amber-200">recomendada {f.tomaRecomendada} s</div>}</td>
        <td className="pr-2">{f.voz} s<div className="text-slate-400">{f.vozFuente}</div></td>
        <td className="pr-2"><input aria-label={`Margen de acción de la escena ${f.n}`} type="number" min={0.4} max={6} step={0.5} className="w-16" value={dec[f.n]?.margen ?? f.margenDeseado} onChange={e => setDec(d => ({ ...d, [f.n]: { toma: d[f.n]?.toma ?? f.video, margen: Number(e.target.value) } }))} /> s<div className="text-slate-400">caben {f.margen} s</div></td>
        <td className="pr-2">{f.montaje} s</td>
        <td>{f.problemas.length ? f.problemas.map((p, k) => <div key={k} className={p.codigo === "voz-truncada" ? "text-rose-200" : "text-amber-200"}>{p.mensaje}</div>) : <span className="text-emerald-200">✓</span>}</td>
      </tr>)}
    </tbody></table></div>
    <div className="mt-2 flex flex-wrap gap-2">
      <button type="button" disabled={ocupado || (!cambios && modo === (out?.tiemposMontaje?.modo || "cinematografico") && !!out?.tiemposMontaje)} onClick={() => { void aprobar(); }} className="rounded-lg bg-amber-400 px-3 py-2 text-xs font-bold text-slate-950 disabled:opacity-60">{ocupado ? "Guardando…" : "Aprobar y guardar tiempos"}</button>
      {cambios > 0 && <button type="button" onClick={() => setDec({})} className="rounded-lg border border-white/15 px-3 py-2 text-xs">Descartar cambios</button>}
    </div>
    {estado && <p role="status" className="mt-2 text-cyan-100">{estado}</p>}
  </details>;
}

// Cinematic Action Director: secuencias, bloqueo, coreografía, cámara y VFX planificados antes de generar.
// Vista previa sin créditos; se aprueba por toma o por secuencia; se puede restaurar la versión anterior.
const FASE_COLOR: Record<string, string> = { preparacion: "#36b8c4", accion: "#f5bc69", consecuencia: "#bfeef4", reaccion: "#22d3ee", transicion: "#8aa4ad" };
const FASE_NOMBRE: Record<string, string> = { preparacion: "Preparación", accion: "Acción", consecuencia: "Consecuencia", reaccion: "Reacción", transicion: "Transición" };
function Bloqueo({ t, grande = false }: { t: TomaAccion; grande?: boolean }) {
  const W = 160, H = 90;
  const p = (e: { x: number; y: number }) => [e.x * W, (1 - e.y) * H * 0.85 + 6];
  const ej = t.eje && t.final.find(e => e.nombre === t.eje![0]) && t.final.find(e => e.nombre === t.eje![1]) ? [t.final.find(e => e.nombre === t.eje![0])!, t.final.find(e => e.nombre === t.eje![1])!] : null;
  return <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Bloqueo de la escena ${t.escena}: ${t.bloqueo || "sin personajes"}`} className={grande ? "w-full" : "w-full max-w-[220px]"} style={{ background: "rgba(8,15,20,.6)", borderRadius: 8 }}>
    {ej && <line x1={p(ej[0])[0]} y1={p(ej[0])[1]} x2={p(ej[1])[0]} y2={p(ej[1])[1]} stroke="#f5bc69" strokeDasharray="3 3" strokeWidth={0.8} />}
    {t.inicial.map(e => { const [x, y] = p(e); const f = t.final.find(z => z.nombre === e.nombre) || e; const [x2, y2] = p(f); return <g key={e.nombre}>
      {(Math.abs(x2 - x) > 1 || Math.abs(y2 - y) > 1) && <line x1={x} y1={y} x2={x2} y2={y2} stroke="#22d3ee" strokeWidth={1} markerEnd="url(#flecha)" />}
      <circle cx={x} cy={y} r={5} fill="#36b8c4" /><line x1={x} y1={y} x2={x + (e.mira === "izquierda" ? -8 : e.mira === "derecha" ? 8 : 0)} y2={y} stroke="#bfeef4" strokeWidth={1.4} />
      <text x={x} y={y - 7} fontSize={grande ? 6 : 7} fill="#e6f6f8" textAnchor="middle">{e.nombre.split(" ").map(w => w[0]).join("").slice(0, 3)}</text></g>; })}
    <defs><marker id="flecha" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#22d3ee" /></marker></defs>
    <path d={`M${W / 2 - 6},${H - 2} l6,-7 l6,7 z`} fill="#f5bc69" aria-hidden="true" /><text x={W / 2 + 10} y={H - 3} fontSize={5} fill="#f5bc69">cámara</text>
  </svg>;
}
function DirectorAccion({ out, maestros, aspecto, versiones, onAplicar }: { out: any; maestros: any[]; aspecto: "9:16" | "16:9"; versiones: any[]; onAplicar: (p: any) => Promise<any> }) {
  const style = (out?.seriesBible?.style || (out?.cast?.some((c: any) => c.fruit) ? "frutinovela" : "cine90")) as StyleKey;
  const [abierto, setAbierto] = useState(false);
  const plan = useMemo(() => abierto ? planificarAccion(out?.scenes || [], maestros.length ? maestros : out?.cast || []) : null, [abierto, out, maestros]);
  const [sel, setSel] = useState<number | null>(null);
  const [aprobadas, setAprobadas] = useState<number[]>([]);
  const [ed, setEd] = useState<Record<number, { shotType?: string; camera?: string; videoAction?: string }>>({});
  const [tarifa, setTarifa] = useState({ creditosSegundo: null as number | null, usdCredito: null as number | null, reintentos: 1.5 });
  const [estado, setEstado] = useState(""); const [ocupado, setOcupado] = useState(false);
  const toma = plan?.tomas.find(t => t.escena === sel) || plan?.tomas[0] || null;
  const vista = useMemo(() => plan && toma ? conAspectoAccion(refrescarAccion(aplicarAccion(out, plan, [toma.escena], ed), style), aspecto) : null, [plan, toma, out, ed, style, aspecto]);
  const escenaVista = vista?.scenes?.find((s: any) => s.n === toma?.escena);
  const escenaAntes = out?.scenes?.find((s: any) => s.n === toma?.escena);
  const motor = motorDe("seedance");
  // Tiempos: la producción actual frente a la configuración cinematográfica de referencia (sin aplicar).
  const tb = segundosClip(style);
  const actual = planTiempos(out?.scenes || [], { tomaBase: tb, tarjetas: out?.guionJson?.tarjetas || [], cierre: !!out?.guionJson?.cierre });
  const referencia = planTiempos((out?.scenes || []).map((s: any, i: number) => ({ ...s, tomaSeg: actual.filas[i].tomaRecomendada })), { tomaBase: tb, tarjetas: out?.guionJson?.tarjetas || [], cierre: !!out?.guionJson?.cierre });
  const costeA = costeEstimado(actual.totales.video, tarifa), costeR = costeEstimado(referencia.totales.video, tarifa);
  const filaT = toma ? actual.filas.find(f => f.n === toma.escena) : null;
  async function aprobar(ns: number[]) {
    if (!plan || !ns.length) return; setOcupado(true);
    try { await onAplicar(aplicarAccion(out, plan, ns, ed)); setEstado(`Dirección de acción aprobada para ${ns.length} toma(s) y guardada como versión nueva. No se generó nada.`); setAprobadas([]); }
    catch (e: any) { setEstado(`No se guardó: ${e?.message || e}`); } finally { setOcupado(false); }
  }
  async function restaurar() {
    const v = versiones[versiones.length - 1]; if (!v) return;
    if (!window.confirm("¿Restaurar la versión anterior del episodio? La actual queda guardada en el historial.")) return;
    setOcupado(true); try { await onAplicar(v); setEstado("Versión anterior restaurada (la que había queda en el historial)."); } finally { setOcupado(false); }
  }
  const alternar = (n: number) => setAprobadas(a => a.includes(n) ? a.filter(x => x !== n) : [...a, n]);
  return <details className="import-panel direction-review action-workspace" onToggle={e => setAbierto((e.target as HTMLDetailsElement).open)}>
    <summary className="cursor-pointer text-sm font-semibold">Director de acción · secuencias, bloqueo, coreografía y continuidad</summary>
    {plan && <div className="mt-3 space-y-3 text-xs">
      <p className="text-slate-300">Planifica la geografía de cada secuencia (quién está dónde, hacia dónde mira y avanza, el eje de acción y el lado de cámara), la coreografía por fases, el plano según su función y los efectos con su propósito. Vista previa sin créditos: nada cambia hasta que apruebes. Motor: {plan.motor} ({motor.duraciones.join(", ")} s{motor.primerUltimo ? ", admite fotograma inicial y final" : ""}).</p>
      {plan.avisos.map((a, k) => <p key={k} role="status" className="text-amber-200">{a}</p>)}
      <div className="action-layout">
        <nav aria-label="Secuencias de acción" className="action-sequences"><h3 className="action-section-title">01 / Secuencias</h3>{plan.secuencias.map(sq => <div key={sq.id} className="rounded-lg border border-white/10 p-2">
          <b className="block text-cyan-100">{sq.id} · {sq.titulo}</b>
          <span className="text-slate-400">Escenas {sq.escenas.join(", ")}{sq.intercaladas.length ? ` · intercaladas ${sq.intercaladas.join(", ")}` : ""} · confianza {sq.confianza}</span>
          <p className="mt-1"><b>Objetivo:</b> {sq.objetivo}</p><p><b>Conflicto:</b> {sq.conflicto}</p>
          <p><b>Ventaja:</b> {sq.progresion.map(x => `${x.escena}:${x.ventaja === "oposicion" ? "oposición" : x.ventaja}`).join(" · ")}</p>
          <p><b>Máxima tensión:</b> escena {sq.maximaTension} · <b>Final:</b> {sq.estadoFinal}</p>
          {sq.interpretacion && <p className="text-amber-200">{sq.interpretacion}</p>}
          <button type="button" className="mt-1 underline" onClick={() => setAprobadas(a => Array.from(new Set([...a, ...sq.escenas])))}>Marcar la secuencia para aprobar</button>
        </div>)}</nav>
        <section className="action-storyboard"><header><h3 className="action-section-title">02 / Storyboard de bloqueo</h3><p>Esquemas de posición y movimiento · no son fotogramas generados.</p>{toma && <a href="#action-inspector">Editar escena {toma.escena} en el inspector ↓</a>}</header><div aria-label="Storyboard" className="action-shots">{plan.tomas.map(t => <button key={t.escena} type="button" aria-pressed={toma?.escena === t.escena} onClick={() => setSel(t.escena)} className={`rounded-lg border p-2 text-left ${toma?.escena === t.escena ? "border-cyan-300/70 bg-cyan-300/10" : "border-white/10 bg-black/20"}`}>
          <span className="flex items-center gap-2"><b>Escena {t.escena}</b><span style={{ color: FASE_COLOR[t.fase] }}>{FASE_NOMBRE[t.fase]}</span>{aprobadas.includes(t.escena) && <span className="text-emerald-200">✓ marcada</span>}</span>
          <Bloqueo t={t} /><span className="mt-1 block text-slate-300">{t.camara.plano}</span>{t.continuidad.some(c => !/correcta|Primera/.test(c)) && <span className="text-rose-200">⚠ continuidad</span>}
        </button>)}</div></section>
        {toma && <aside id="action-inspector" tabIndex={-1} aria-label="Inspector de dirección" className="action-inspector space-y-2"><h3 className="action-section-title">03 / Inspector de dirección</h3>
          <b className="block text-sm">Escena {toma.escena} · {FASE_NOMBRE[toma.fase]} · {toma.tipo}</b>
          <Bloqueo t={toma} grande />
          <p><b>En cuadro:</b> {toma.visibles.join(", ") || "nadie"}</p>
          <p><b>Estado inicial:</b> {toma.estadoInicial || "—"}</p><p><b>Estado final:</b> {toma.estadoFinal || "—"}</p>
          <label className="block"><b>Plano</b><input className="aurora-field mt-1" value={ed[toma.escena]?.shotType ?? toma.camara.plano} onChange={e => setEd(d => ({ ...d, [toma.escena]: { ...d[toma.escena], shotType: e.target.value } }))} /></label>
          <label className="block"><b>Cámara</b><input className="aurora-field mt-1" value={ed[toma.escena]?.camera ?? toma.camara.movimiento} onChange={e => setEd(d => ({ ...d, [toma.escena]: { ...d[toma.escena], camera: e.target.value } }))} /></label>
          <p className="text-slate-400"><b>Por qué:</b> {toma.camara.razon}</p>
          <label className="block"><b>Acción principal (vídeo)</b><textarea className="aurora-field mt-1" rows={3} value={ed[toma.escena]?.videoAction ?? toma.accionPrincipal} onChange={e => setEd(d => ({ ...d, [toma.escena]: { ...d[toma.escena], videoAction: e.target.value } }))} /></label>
          <p><b>Consecuencia:</b> {toma.consecuencia}</p>
          {toma.vfx.length > 0 && <div><b>Efectos (con propósito):</b><ul>{toma.vfx.map((v, k) => <li key={k}>{v.efecto} — <span className="text-slate-400">{v.proposito}</span></li>)}</ul></div>}
          <div><b>Continuidad:</b>{toma.continuidad.map((c, k) => <p key={k} className={/correcta|Primera/.test(c) ? "text-emerald-200" : "text-rose-200"}>{c}</p>)}</div>
          {toma.dividir && <p className="text-amber-200">{toma.dividir}</p>}
          {filaT && <p><b>Tiempos:</b> vídeo {filaT.video} s · voz {filaT.voz} s · acción tras la voz {filaT.margen}/{filaT.margenDeseado} s · montaje {filaT.montaje} s · {motor.nombre}</p>}
          {escenaAntes && <details><summary>Antes / después</summary><p><b>Antes:</b> {escenaAntes.shotType}. {escenaAntes.camera} {escenaAntes.videoAction}</p><p><b>Después:</b> {escenaVista?.shotType}. {escenaVista?.camera} {escenaVista?.videoAction}</p></details>}
          {escenaVista && <details><summary>Prompts exactos (imagen / vídeo)</summary><p className="whitespace-pre-wrap text-slate-300"><b>Imagen:</b> {escenaVista.imagePromptFlow}</p><p className="mt-2 whitespace-pre-wrap text-slate-300"><b>Vídeo:</b> {escenaVista.animationPrompt}</p></details>}
          <label className="flex items-center gap-2"><input type="checkbox" checked={aprobadas.includes(toma.escena)} onChange={() => alternar(toma.escena)} /> Marcar esta toma para aprobar</label>
        </aside>}
      </div>
      <div className="action-phase-key" aria-label="Fases de la acción">{Object.entries(FASE_NOMBRE).map(([k, nombre]) => <span key={k}><i style={{ background: FASE_COLOR[k] }} />{nombre}</span>)}</div>
      <div aria-label="Línea de tiempo de acciones y clips" className="action-timeline" role="region" tabIndex={0}>{(out?.scenes || []).map((s: any, i: number) => { const t = plan.tomas.find(x => x.escena === s.n); const f = actual.filas[i]; return <button key={s.n} type="button" aria-pressed={toma?.escena === s.n} onClick={() => t && setSel(s.n)} title={`Escena ${s.n}: vídeo ${f.video} s · montaje ${f.montaje} s${t ? ` · ${FASE_NOMBRE[t.fase]}` : " · sin acción"}`} style={{ flexGrow: f.video, minWidth: 36, background: t ? FASE_COLOR[t.fase] : "rgba(255,255,255,.08)", opacity: t ? 0.85 : 1, color: "#080f14" }} className="h-8 rounded text-[10px] font-bold">{s.n}</button>; })}</div>
      <div className="action-costs">
        <b>Duración y coste</b> · actual: vídeo {actual.totales.video} s, montaje ~{actual.totales.montaje} s · referencia cinematográfica (escenas {actual.filas.filter(f => f.tomaRecomendada !== f.video).map(f => f.n).join(", ")} a {Math.max(...motor.duraciones.filter(d => d <= 8))} s): vídeo {referencia.totales.video} s, montaje ~{referencia.totales.montaje} s. Los tiempos se aprueban en «Tiempos del montaje».
        <div className="mt-1 flex flex-wrap items-center gap-2">Tarifa de tu plan: <input aria-label="Créditos por segundo" type="number" min={0} step={0.1} className="w-20" placeholder="créd./s" value={tarifa.creditosSegundo ?? ""} onChange={e => setTarifa(t => ({ ...t, creditosSegundo: e.target.value === "" ? null : Number(e.target.value) }))} /> créditos/s · <input aria-label="Dólares por crédito" type="number" min={0} step={0.001} className="w-20" placeholder="USD/créd." value={tarifa.usdCredito ?? ""} onChange={e => setTarifa(t => ({ ...t, usdCredito: e.target.value === "" ? null : Number(e.target.value) }))} /> USD/crédito · intentos por toma <input aria-label="Intentos por toma" type="number" min={1} step={0.5} className="w-14" value={tarifa.reintentos} onChange={e => setTarifa(t => ({ ...t, reintentos: Number(e.target.value) || 1 }))} /></div>
        <p className="mt-1">{costeA.creditos == null ? costeA.nota : `Actual: ~${costeA.creditos} créditos${costeA.usd != null ? ` (~${costeA.usd} USD)` : ""} · referencia: ~${costeR.creditos} créditos${costeR.usd != null ? ` (~${costeR.usd} USD)` : ""} (${costeR.nota}).`}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={ocupado || !aprobadas.length} onClick={() => { void aprobar(aprobadas); }} className="rounded-lg bg-amber-400 px-3 py-2 font-bold text-slate-950 disabled:opacity-60">{ocupado ? "Guardando…" : `Aprobar ${aprobadas.length} toma(s) marcada(s)`}</button>
        <button type="button" onClick={() => { setAprobadas([]); setEd({}); setEstado("Cambios descartados: el episodio no se modificó."); }} className="rounded-lg border border-white/15 px-3 py-2">Descartar</button>
        <button type="button" disabled={ocupado || !versiones.length} onClick={() => { void restaurar(); }} className="rounded-lg border border-white/15 px-3 py-2">Restaurar versión anterior</button>
      </div>
      {estado && <p role="status" className="text-cyan-100">{estado}</p>}
    </div>}
  </details>;
}
