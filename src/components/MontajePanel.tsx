"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import LogoPicker, { FRUTI, defaultLogo, logoFile, logoName, rememberLogo } from "./LogoPicker";
import { postApi, isAuthError } from "@/lib/api-client";
import CopyButton from "./CopyButton";
import { episodeTrackPrompt, seriesThemePrompt, type MusicContext } from "@/lib/music";

// Marcas de agua conocidas: el servidor reescala a 720x1280 (Dola) o 704x1280 (Pavo) y las borra (ver montaje/README.md).
type Watermark = "none" | "dola" | "pavo" | "custom";
type Live = { estado: string; pct: number; paso: string; log: string[] };
type Target = "pc" | "nube";

// Servidor de montaje en el PC del usuario (montaje/local/«Montar en mi PC.bat»): GPU NVIDIA, sin subir los clips a internet.
export const PC_URL = "http://127.0.0.1:8765";
const TARGET_KEY = "estudio-viral:montaje-destino";
async function detectPc(): Promise<{ gpu: string } | null> {
  try {
    const r = await fetch(`${PC_URL}/salud`, { signal: AbortSignal.timeout(4000) });
    const j = await r.json();
    return j?.ok && j.local ? { gpu: String(j.gpu || "") } : null;
  } catch { return null; }
}

// Sube con XMLHttpRequest para mostrar el avance de la subida (fetch no lo da).
function upload(url: string, headers: Record<string, string>, fd: FormData, onPct: (p: number) => void) {
  return new Promise<{ id: string }>((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("POST", url); for (const [k, v] of Object.entries(headers)) x.setRequestHeader(k, v);
    x.upload.onprogress = e => { if (e.lengthComputable) onPct(Math.round((e.loaded / e.total) * 100)); };
    x.onload = () => { let j: any = {}; try { j = JSON.parse(x.responseText); } catch {} x.status < 300 && j.id ? resolve(j) : reject(new Error(j.detail || `HTTP ${x.status}`)); };
    x.onerror = () => reject(new Error("se cortó la conexión con el servidor de montaje"));
    x.send(fd);
  });
}

// Clip que se está procesando según el paso que informa el servidor (para el monitor en vivo).
function clipFromStep(paso: string, n: number) {
  const m = /clip (\d+)/i.exec(paso); if (m) return Math.min(n, Number(m[1])) - 1;
  const e = /(\d+):(\d\d) de (\d+):(\d\d)/.exec(paso);
  if (e) { const done = +e[1] * 60 + +e[2], total = +e[3] * 60 + +e[4]; return Math.min(n - 1, Math.floor((done / Math.max(1, total)) * n)); }
  return -1;
}

// El servidor espera un bloque de diálogo por clip. Si hay menos clips que bloques
// (p. ej. un solo clip de Dola de 60 s), se juntan bloques consecutivos; si hay más,
// los clips sobrantes van sin diálogo (tarjetas).
// Lo que la app puede arreglar sola a partir de la revisión: pregunta antes y, si se acepta, vuelve a montar.
type Arreglo = { id: string; texto: string; nota?: string; vel?: string; rec?: boolean; quitarCta?: boolean; choca?: string };
export function Mejoras({ revision, style, velocidad, recortar, cta, onApply }: { revision: any; style: string; velocidad: string; recortar: boolean; cta: string; onApply: (a: { vel?: string; rec?: boolean; quitarCta?: boolean }) => void }) {
  const tipos = new Set<string>((revision?.avisos || []).map((a: any) => a.tipo));
  const v = Number(velocidad) || 1;
  const dur = Number(revision?.duracion) || 0;
  const estima = (nv: number) => Math.round((dur - 3) * v / nv + 3);
  const arreglos: Arreglo[] = [];
  if (tipos.has("pausas") && !recortar) arreglos.push({ id: "pausas", texto: "Activar «Quitar pausas muertas»", rec: true });
  if (tipos.has("lento") && v < 1.2) arreglos.push({ id: "lento", texto: `Subir el Ritmo a «Rápido» (20 %): las frases se oyen más ágiles; el vídeo quedará en ~${estima(1.2)} s`, vel: "1.2", choca: "facebook60" });
  if (tipos.has("facebook60") && v > 1) {
    const nuevo = estima(1);
    arreglos.push({ id: "facebook60", texto: `Volver al Ritmo «Normal» para alargar el vídeo: quedará en ~${nuevo} s`, vel: "1", choca: "lento",
      nota: nuevo < 60 ? `Aun así faltarían ~${60 - nuevo} s para los 60 s de Facebook: añade escenas en el Generador (14 escenas dan ~65 s).` : undefined });
  }
  if (tipos.has("llamadas") && /comenta|am[eé]n|like|s[ií]gueme|comparte/i.test(cta)) arreglos.push({ id: "llamadas", texto: `Quitar la llamada final «${cta}» de la tarjeta de cierre`, quitarCta: true });
  // Lo que no se puede arreglar solo (hay que subir algo o regenerar un clip).
  const manuales: string[] = [];
  if (tipos.has("facebook60") && v <= 1) manuales.push(`Para llegar a 60 s en Facebook hay que añadir escenas en el Generador (ahora dura ${Math.round(dur)} s).`);
  if (tipos.has("lento") && v >= 1.2) manuales.push("El Ritmo ya está en «Rápido»: para frases más ágiles, regenera esos clips (los prompts nuevos ya piden 2-3 s por frase).");
  if (tipos.has("anteriormente")) manuales.push("«Anteriormente...»: sube el vídeo final de la parte anterior y escribe la frase de resumen.");
  if (tipos.has("sin_voz") || tipos.has("negro")) manuales.push("Clips sin voz o con pantalla negra: cámbialos con «Cambiar clip» en la mesa de escenas.");
  // Si chocan «más rápido» y «más largo», se marca por defecto lo que importa en esta cuenta: en las cristianas
  // (Facebook, monetización) la duración; en las demás, el ritmo.
  const prefer = style === "cristiana" || style === "biblica" || style === "epica" ? "facebook60" : "lento";
  const [sel, setSel] = useState<Record<string, boolean>>(() => Object.fromEntries(arreglos.map(a => [a.id, !a.choca || a.id === prefer || !arreglos.some(b => b.id === a.choca)])));
  const [cerrado, setCerrado] = useState(false);
  if (cerrado || (!arreglos.length && !manuales.length)) return null;
  const toggle = (a: Arreglo) => setSel(prev => ({ ...prev, [a.id]: !prev[a.id], ...(a.choca && !prev[a.id] ? { [a.choca]: false } : {}) }));
  const elegidos = arreglos.filter(a => sel[a.id]);
  return <div className="rounded-lg border border-sky-400/30 bg-sky-400/[.06] p-3 text-xs text-slate-200">
    {arreglos.length > 0 && <>
      <p className="text-sm font-bold text-sky-200">¿Aplico estas mejoras y vuelvo a montar?</p>
      <ul className="mt-2 space-y-1.5">{arreglos.map(a => <li key={a.id}><label className="flex items-start gap-2">
        <input type="checkbox" className="mt-0.5 w-auto" checked={!!sel[a.id]} onChange={() => toggle(a)} />
        <span>{a.texto}{a.nota && <span className="block text-amber-200">{a.nota}</span>}</span></label></li>)}</ul>
      {arreglos.some(a => a.choca && arreglos.some(b => b.id === a.choca)) && <p className="mt-2 text-[11px] text-slate-400">«Más rápido» y «más largo» no se pueden a la vez: elige uno. Para Facebook pesa más la duración; para TikTok, el ritmo.</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={!elegidos.length} onClick={() => onApply({ vel: elegidos.find(a => a.vel)?.vel, rec: elegidos.some(a => a.rec), quitarCta: elegidos.some(a => a.quitarCta) })} className="rounded bg-sky-500 px-3 py-2 font-bold text-black disabled:opacity-50">Sí, aplicar y volver a montar</button>
        <button type="button" onClick={() => setCerrado(true)} className="rounded px-3 py-2 text-slate-300 hover:bg-white/5">No, dejarlo así</button>
      </div>
    </>}
    {manuales.length > 0 && <div className={arreglos.length ? "mt-3 border-t border-white/10 pt-2" : ""}><p className="font-semibold text-slate-300">Esto lo tienes que hacer tú:</p><ul className="mt-1 list-disc space-y-0.5 pl-4 text-slate-400">{manuales.map((m, i) => <li key={i}>{m}</li>)}</ul>
      {!arreglos.length && <button type="button" onClick={() => setCerrado(true)} className="mt-2 text-slate-400 underline">Entendido</button>}</div>}
  </div>;
}

// Revisión automática del montaje: nota, lo que está bien y lo que conviene arreglar antes de publicar.
function Revision({ r }: { r: any }) {
  const nota = Number(r?.nota ?? 0);
  const color = nota >= 85 ? "text-emerald-300 border-emerald-400/30 bg-emerald-400/[.06]" : nota >= 65 ? "text-amber-200 border-amber-400/30 bg-amber-400/[.06]" : "text-rose-200 border-rose-400/30 bg-rose-400/[.06]";
  return <div className={`rounded-lg border p-3 text-xs ${color}`}>
    <p className="text-sm font-bold">Revisión automática: {nota}/100 {nota >= 85 ? "· listo para publicar" : nota >= 65 ? "· se puede mejorar" : "· conviene arreglarlo antes de publicar"}</p>
    {Array.isArray(r.avisos) && r.avisos.length > 0 && <ul className="mt-2 space-y-1.5 text-slate-200">{r.avisos.map((a: any, i: number) => <li key={i}><b>• {a.texto}</b><br /><span className="text-slate-400">{a.arreglo}</span></li>)}</ul>}
    {Array.isArray(r.bien) && r.bien.length > 0 && <ul className="mt-2 space-y-0.5 text-emerald-200/90">{r.bien.map((b: string, i: number) => <li key={i}>✓ {b}</li>)}</ul>}
  </div>;
}

const slug = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "logo";

export function adaptGuion(guion: any, nClips: number, opts: { marca?: "dola" | "pavo"; delogo?: string; cierre?: string; cierreCta?: string } = {}) {
  const blocks: any[][] = Array.isArray(guion?.clips) ? guion.clips : [];
  let clips: any[][];
  if (nClips >= blocks.length) clips = [...blocks, ...Array.from({ length: nClips - blocks.length }, () => [])];
  else clips = Array.from({ length: nClips }, (_, i) => blocks.slice(Math.floor((i * blocks.length) / nClips), Math.floor(((i + 1) * blocks.length) / nClips)).flat());
  const colores: Record<string, string> = {};
  for (const [k, v] of Object.entries(guion?.colores || {})) colores[k] = String(v).replace("#", "").toUpperCase();
  const out: any = { ...guion, colores, clips };
  delete out.delogo; delete out.marca;
  // Las tarjetas de tiempo van por número de clip: solo valen si hay un clip por escena.
  if (nClips !== blocks.length) { delete out.tarjetas; delete out.pantallas; delete out.telefono; }
  if (opts.marca) out.marca = opts.marca; else if (opts.delogo) out.delogo = opts.delogo;
  if (opts.cierre) out.cierre = opts.cierre;
  if (opts.cierreCta?.trim()) out.cierre_cta = opts.cierreCta.trim(); else delete out.cierre_cta;
  return out;
}

// Llamada final (línea amarilla de la tarjeta de cierre) según el estilo y si la serie termina.
export function defaultCta(style: string, part: number, last: boolean) {
  // Cristianas: nada de «Escribe AMÉN» (Meta lo penaliza como interacción no auténtica); la tarjeta lleva el versículo.
  if (style === "cristiana" || style === "biblica" || style === "epica") return "";
  return last ? "Dale me gusta y comenta qué te pareció" : `Comenta PARTE ${part + 1}`;
}

// Canción de firma de cada serie, guardada en este navegador (IndexedDB): se pone sola en cada capítulo.
function songDb(): Promise<IDBDatabase | null> {
  return new Promise(res => { try { const r = indexedDB.open("estudio-viral-canciones", 1); r.onupgradeneeded = () => r.result.createObjectStore("canciones"); r.onsuccess = () => res(r.result); r.onerror = () => res(null); } catch { res(null); } });
}
async function getSong(serie: string): Promise<File | null> {
  const db = await songDb(); if (!db || !serie) return null;
  return new Promise(res => { try { const q = db.transaction("canciones").objectStore("canciones").get(serie); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); } catch { res(null); } });
}
async function setSong(serie: string, file: File | null) {
  const db = await songDb(); if (!db || !serie) return;
  try { const st = db.transaction("canciones", "readwrite").objectStore("canciones"); if (file) st.put(file, serie); else st.delete(serie); } catch {}
}

export default function MontajePanel({ guion, title, filesOverride, style = "frutinovela", part = 1, musicCues = [], seconds = 0, onDownloaded, publish = [], music: musicCtx = {}, cover: coverData, recap = "" }: { recap?: string; music?: Partial<MusicContext>; cover?: { serie?: string; frase?: string[]; parte?: number }; guion: any; title: string; filesOverride?: File[]; style?: string; part?: number; musicCues?: string[]; seconds?: number; onDownloaded?: () => void; publish?: { platform: string; text: string; hashtags: string; extra?: string }[] }) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const files = filesOverride ?? selectedFiles;
  const [watermark, setWatermark] = useState<Watermark>("none");
  const [lastEpisode, setLastEpisode] = useState(false);
  const [cta, setCta] = useState(() => defaultCta(style, part, false));
  const [ctaEdited, setCtaEdited] = useState(false);
  useEffect(() => { if (!ctaEdited) setCta(defaultCta(style, part, lastEpisode)); }, [style, part, lastEpisode, ctaEdited]);
  const [rect, setRect] = useState({ x: "", y: "", w: "", h: "" });
  const [music, setMusic] = useState<File | null>(null);
  const [musicVol, setMusicVol] = useState("0.18");
  // Dónde suena la música: como firma de la serie al inicio y al final (recomendado, como los virales:
  // en medio solo voces y ambiente) o por debajo de todo el vídeo.
  const [musicMode, setMusicMode] = useState<"extremos" | "todo">("extremos");
  const [recortar, setRecortar] = useState(true);
  const [anterior, setAnterior] = useState<File | null>(null);
  // Frase que sale arriba en el «Anteriormente...»: resume la parte anterior para quien llega nuevo.
  const [resumen, setResumen] = useState(recap);
  useEffect(() => { setResumen(recap); }, [recap]);
  // Ritmo: los clips de IA hablan lento; 1.1 acelera voz y vídeo juntos un 10 % (mismo tono).
  const [velocidad, setVelocidad] = useState("1.1");
  // Acabado profesional (como un editor de Premiere/After Effects): cada parte se puede apagar.
  const [pro, setPro] = useState({ sonido: true, sfx: true, color: true, camara: true });
  useEffect(() => { try { const v = localStorage.getItem("estudio-viral:pro"); if (v) setPro(p => ({ ...p, ...JSON.parse(v) })); } catch {} }, []);
  const togglePro = (k: keyof typeof pro) => setPro(p => { const n = { ...p, [k]: !p[k] }; try { localStorage.setItem("estudio-viral:pro", JSON.stringify(n)); } catch {} return n; });
  // Kit de marca: acento dorado y títulos en Lora en las cuentas cristianas y en el cine de los 90; amarillo y Poppins en frutinovelas.
  const kit = style === "frutinovela" ? { acento: "FFD23F", titulos: "poppins" } : { acento: "F2C14E", titulos: "lora" };
  // Logo que tapa la marca de agua: el de la página donde se publica (se recuerda por serie).
  const [logo, setLogo] = useState(FRUTI);
  useEffect(() => { defaultLogo(String(musicCtx?.series || title), style).then(setLogo); }, [musicCtx?.series, title, style]);
  // Segunda versión con otro logo (otra página): «» = no. Se recuerda por serie.
  const logoKey2 = `2:${String(musicCtx?.series || title)}`;
  const [logo2, setLogo2] = useState("");
  useEffect(() => { try { setLogo2(localStorage.getItem(`estudio-viral:logo:${logoKey2}`) || ""); } catch {} }, [logoKey2]);
  const [names, setNames] = useState<[string, string]>(["", ""]);
  // Versiones por red que salen del mismo montaje (se recuerda la elección en este navegador).
  const horizontal = guion?.formato === "16:9";
  const REDES = [
    ...(horizontal ? [] : [{ id: "facebook", label: "Facebook", desc: "abre con los 3 s más fuertes y «Horas antes...»" }]),
    { id: "tiktok", label: "TikTok en partes", desc: "partes de ~1 min cortadas entre clips, con «Sigue en la Parte N»" },
    { id: "shorts", label: "YouTube Shorts", desc: "menos de 60 s, cierra con «Historia completa en el perfil»" },
  ];
  const [versiones, setVersiones] = useState<string[]>(["facebook", "tiktok", "shorts"]);
  useEffect(() => { try { const v = localStorage.getItem("estudio-viral:versiones"); if (v) setVersiones(JSON.parse(v)); } catch {} }, []);
  const toggleVersion = (id: string) => setVersiones(prev => { const n = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]; try { localStorage.setItem("estudio-viral:versiones", JSON.stringify(n)); } catch {} return n; });
  const [extras, setExtras] = useState<{ red: string; parte: number; logo: number; k: number; total: number }[]>([]);
  const [revision, setRevision] = useState<any>(null);
  const [job, setJob] = useState<{ base: string; id: string } | null>(null);
  const [bajando, setBajando] = useState(-1);
  // Canción de firma recordada para esta serie.
  const serieKey = String(musicCtx?.series || "");
  const [songSaved, setSongSaved] = useState(false);
  useEffect(() => { let off = false; if (serieKey) void getSong(serieKey).then(f => { if (off || !f) return; setSongSaved(true); setMusic(prev => prev || f); }); return () => { off = true; }; }, [serieKey]);
  const musicUrl = useMemo(() => (music ? URL.createObjectURL(music) : ""), [music]);
  useEffect(() => () => { if (musicUrl) URL.revokeObjectURL(musicUrl); }, [musicUrl]);
  const [busy, setBusy] = useState(false);
  // Mejoras de la revisión automática que la app puede aplicar sola: se cambian los ajustes y se vuelve a
  // montar en el render siguiente (así montar() ya ve los ajustes nuevos).
  const [remontar, setRemontar] = useState(false);
  useEffect(() => { if (remontar && !busy) { setRemontar(false); montar(); } }, [remontar]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [elapsed, setElapsed] = useState(0);
  const [uploadPct, setUploadPct] = useState(0);
  const [live, setLive] = useState<Live | null>(null);
  const [pc, setPc] = useState<{ gpu: string } | null>(null);
  const [checkingPc, setCheckingPc] = useState(true);
  const [target, setTarget] = useState<Target>("nube");
  async function findPc(quiet = false) {
    if (!quiet) setCheckingPc(true);
    const found = await detectPc();
    setCheckingPc(false);
    if (!found) { if (!quiet) setPc(null); return; }
    setPc(found);
    let saved: string | null = null; try { saved = localStorage.getItem(TARGET_KEY); } catch {}
    setTarget(saved !== "nube" ? "pc" : "nube");
  }
  useEffect(() => { void findPc(); }, []);
  // Si al abrir no estaba (ventana cerrada o Chrome aún preguntando por la red local), se vuelve a
  // buscar cada 5 s y al volver a la pestaña, hasta encontrarlo.
  useEffect(() => {
    if (pc || busy) return;
    const tick = () => { if (document.visibilityState === "visible") void findPc(true); };
    const id = setInterval(tick, 5000);
    window.addEventListener("focus", tick);
    return () => { clearInterval(id); window.removeEventListener("focus", tick); };
  }, [pc, busy]);
  function chooseTarget(t: Target) { setTarget(t); try { localStorage.setItem(TARGET_KEY, t); } catch {} }
  const [error, setError] = useState("");
  const [video, setVideo] = useState<string>("");
  const [cover, setCover] = useState<string>("");
  const [video2, setVideo2] = useState<string>("");
  const timer = useRef<any>(null);
  const blocks = Array.isArray(guion?.clips) ? guion.clips.length : 0;
  const monitorClip = live ? clipFromStep(live.paso, files.length) : -1;
  const monitorUrl = useMemo(() => (monitorClip >= 0 && files[monitorClip] ? URL.createObjectURL(files[monitorClip]) : ""), [monitorClip, files]);
  useEffect(() => () => { if (monitorUrl) URL.revokeObjectURL(monitorUrl); }, [monitorUrl]);
  const monitorLines: [string, string][] = monitorClip >= 0 && Array.isArray(guion?.clips?.[monitorClip]) ? guion.clips[monitorClip] : [];

  useEffect(() => () => { clearInterval(timer.current); if (video) URL.revokeObjectURL(video); }, [video]);

  function pick(list: FileList | null) {
    const arr = Array.from(list || []).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    setSelectedFiles(arr); setError("");
  }
  function move(i: number, d: number) {
    const j = i + d; if (j < 0 || j >= files.length) return;
    const arr = [...files]; [arr[i], arr[j]] = [arr[j], arr[i]]; setSelectedFiles(arr);
  }

  async function montar() {
    if (!files.length) { setError("Elige los clips primero."); return; }
    const custom = `x=${rect.x}:y=${rect.y}:w=${rect.w}:h=${rect.h}`;
    if (watermark === "custom" && (!/^x=\d{1,4}:y=\d{1,4}:w=\d{1,4}:h=\d{1,4}$/.test(custom) || Number(rect.w) < 1 || Number(rect.h) < 1)) { setError("Indica x, y, ancho y alto positivos en píxeles para el área de la marca."); return; }
    const marca = watermark === "dola" || watermark === "pavo" ? watermark : undefined;
    const delogo = watermark === "custom" ? custom : "";
    setBusy(true); setError(""); setElapsed(0); setUploadPct(0); setLive(null);
    if (video) { URL.revokeObjectURL(video); setVideo(""); }
    if (video2) { URL.revokeObjectURL(video2); setVideo2(""); }
    setExtras([]); setRevision(null); setJob(null);
    const t0 = Date.now(); timer.current = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000);
    try {
      // Destino: este PC (sin pase, solo 127.0.0.1) o el servidor de Fly (pase temporal firmado por la app).
      let base = PC_URL, headers: Record<string, string> = { "X-Montaje-Local": "1" };
      if (target === "pc") {
        if (!(await detectPc())) { setError("No encuentro el montaje de este PC. Abre «Montar en mi PC» (acceso directo del escritorio) y vuelve a pulsar, o elige «Servidor en la nube»."); return; }
      } else {
        const t = await postApi("/api/montaje", {});
        if (isAuthError(t)) { setError("Inicia sesión para usar el montaje automático."); return; }
        if (!t.json?.ok) { setError(t.json?.error || "No se pudo contactar con el servidor de montaje."); return; }
        base = t.json.url; headers = { Authorization: `Ticket ${t.json.ticket}` };
      }
      // Un servidor sin actualizar ignora la música sin avisar: se comprueba antes de subir nada.
      const needs = [music && ["musica", "la música de fondo"], music && musicMode === "extremos" && ["musica_modo", "la música solo al inicio y al final"], anterior && ["anterior", "«Anteriormente...»"], anterior && resumen.trim() && ["resumen", "el resumen del «Anteriormente...»"], recortar && ["recorte", "quitar las pausas"], Number(velocidad) > 1 && ["velocidad", "el ritmo ágil"], Object.values(pro).some(Boolean) && ["pro", "el acabado profesional"], (guion?.pantallas?.length || guion?.telefono?.length) && ["pantallas", "los chats de WhatsApp y la voz por teléfono"], watermark !== "none" && logo !== FRUTI && ["logo_propio", "el logo de tu página"], watermark !== "none" && !!logo2 && logo2 !== logo && ["dos_logos", "la segunda versión con otro logo"], versiones.length > 0 && ["versiones", "las versiones por red"], horizontal && ["horizontal", "el formato 16:9 del proyecto largo"], !!guion?.recortes?.length && ["recortes", "los clips verticales para TikTok y Reels"]].filter(Boolean) as [string, string][];
      if (needs.length) {
        const caps = await fetch(`${base}/salud`, { signal: AbortSignal.timeout(8000) }).then(r => r.json()).catch(() => null);
        const missing = needs.filter(([k]) => !caps?.[k]).map(([, label]) => label);
        if (missing.length) {
          setError(target === "pc"
            ? `El montaje de tu PC está desactualizado y no haría: ${missing.join(", ")}. ${caps?.carpeta ? `Se está ejecutando desde «${caps.carpeta}»: ejecuta «git pull» en esa carpeta` : "La ventana abierta es de una versión anterior (arrancada antes del «git pull» o desde otra copia del proyecto)"}. Cierra todas las ventanas «Montar en mi PC», ábrela de nuevo y pulsa otra vez «Montar vídeo final». Para comprobarlo, abre http://127.0.0.1:8765/salud: debe decir "recorte": true.`
            : `El servidor de la nube (Fly) aún no tiene: ${missing.join(", ")}. Ejecuta «fly deploy» en la carpeta montaje, o monta en tu PC actualizado.`);
          return;
        }
      }
      const fd = new FormData();
      fd.append("guion", new Blob([JSON.stringify({ ...adaptGuion(guion, files.length, { marca, delogo, cierre: horizontal ? undefined : guion?.versiculo || (lastEpisode ? "FIN" : guion?.cierre || "Continuará..."), cierreCta: horizontal ? "" : cta }), ...(music ? { musica_volumen: Number(musicVol), musica_modo: musicMode } : {}), recortar, velocidad: Number(velocidad), versiones: horizontal ? [] : versiones, parte: part, pro, estilo: style, kit, ...(style === "cristiana" || style === "biblica" || style === "epica" ? { cristiana: true } : {}), ...(anterior && resumen.trim() ? { anterior_resumen: resumen.trim() } : {}), ...(watermark !== "none" && logo2 && logo2 !== logo ? { logo_nombre: await logoName(logo), logo2_nombre: await logoName(logo2), ...(logo2 === FRUTI ? { logo2: "frutienganchados" } : {}) } : {}), ...(coverData?.parte || coverData?.frase?.length ? { portada: { ...coverData, clip: Math.round(files.length * 0.35) } } : {}) })], { type: "application/json" }), "guion.json");
      for (const f of files) fd.append("clips", f, f.name);
      if (music) fd.append("musica", music, music.name);
      if (anterior) fd.append("anterior", anterior, anterior.name);
      if (watermark !== "none") { const lf = await logoFile(logo); if (lf) fd.append("logo", lf, lf.name); }
      const dual = watermark !== "none" && !!logo2 && logo2 !== logo;
      if (dual && logo2 !== FRUTI) { const l2 = await logoFile(logo2); if (l2) fd.append("logo2", l2, l2.name); }
      setNames(dual ? [await logoName(logo), await logoName(logo2)] : ["", ""]);
      // 1) Subida: el servidor responde al instante con el número de trabajo.
      const { id } = await upload(`${base}/trabajos`, headers, fd, setUploadPct);
      // 2) Progreso en vivo: cada respuesta llega en cuanto hay un paso nuevo (o a los 20 s).
      let seq = -1, fails = 0, state: any = null;
      while (true) {
        try {
          const r = await fetch(`${base}/trabajos/${id}?desde=${seq}`);
          if (r.status === 404) throw Object.assign(new Error("el servidor perdió el montaje (¿se reinició?). Vuelve a pulsar «Montar vídeo final»."), { fatal: true });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          state = await r.json(); fails = 0; seq = state.seq;
          setLive({ estado: state.estado, pct: state.pct, paso: state.paso, log: state.log || [] });
          if (state.estado === "listo" || state.estado === "error") break;
        } catch (e: any) {
          if (e?.fatal || ++fails > 6) throw e;
          await new Promise(res => setTimeout(res, 5000));     // corte breve de red: se reintenta
        }
      }
      if (state.estado === "error") { setError(state.error || "El montaje falló."); return; }
      // 3) Descarga del vídeo terminado.
      const v = await fetch(`${base}/trabajos/${id}/video`);
      if (!v.ok) { setError(`No se pudo descargar el vídeo (HTTP ${v.status}). Está guardado 30 min en el servidor: vuelve a intentarlo.`); return; }
      setVideo(URL.createObjectURL(await v.blob()));
      setJob({ base, id });
      const ex: any[] = Array.isArray(state.extras) ? state.extras : [];
      setExtras(ex.map((e, k) => ({ ...e, k, total: ex.filter(x => x.red === e.red && x.logo === e.logo).length })));
      setRevision(state.revision || null);
      if (state.segunda) { const v2 = await fetch(`${base}/trabajos/${id}/video?v=2`); if (v2.ok) setVideo2(URL.createObjectURL(await v2.blob())); }
      // Portada con el diseño fijo de la serie (servidores antiguos no la tienen: se ignora).
      const c = await fetch(`${base}/trabajos/${id}/portada`).catch(() => null);
      if (c?.ok) setCover(URL.createObjectURL(await c.blob()));
    } catch (e: any) {
      setError("No se pudo completar el montaje: " + (e?.message || e) + (target === "pc" ? ". Revisa que la ventana «Montar en mi PC» siga abierta, o elige «Servidor en la nube»." : ". Revisa que el servidor de montaje esté encendido."));
    } finally { clearInterval(timer.current); setBusy(false); }
  }

  const pct = live ? live.pct : Math.round(uploadPct * 0.02);
  const fname = `${(title || "episodio").replace(/[^\w\-áéíóúñ ]+/gi, "").trim().replace(/\s+/g, "-") || "episodio"}.mp4`;

  return <div className="rounded-xl bg-[#121826] p-4 space-y-3">
    <p className="text-sm text-slate-300">Sube los clips del episodio <b>en orden</b> y el servidor devuelve el vídeo final con gancho, subtítulos de colores, tarjetas y cierre.</p>
    <div className="space-y-1.5">
      <p className="text-xs text-slate-300">Dónde montar</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || !pc} onClick={() => chooseTarget("pc")} className={`rounded-lg border px-3 py-2 text-left text-xs disabled:opacity-50 ${target === "pc" ? "border-emerald-400 bg-emerald-400/10 text-emerald-100" : "border-white/10 text-slate-300"}`}>
          <b className="block">Este PC {pc?.gpu ? `· ${pc.gpu.replace(/^NVIDIA GeForce /, "")}` : ""}</b>
          {checkingPc ? "Buscando…" : pc ? "Conectado · ~1 min por episodio, sin subir a internet" : "No conectado"}
        </button>
        <button type="button" disabled={busy} onClick={() => chooseTarget("nube")} className={`rounded-lg border px-3 py-2 text-left text-xs ${target === "nube" ? "border-amber-400 bg-amber-400/10 text-amber-100" : "border-white/10 text-slate-300"}`}>
          <b className="block">Servidor en la nube (Fly)</b>Respaldo · 10-25 min por episodio
        </button>
      </div>
      {!checkingPc && !pc && <p className="text-[11px] text-slate-400">Para montar en tu PC abre «Montar en mi PC» (acceso directo del escritorio), déjalo abierto y pulsa <button type="button" onClick={() => { void findPc(); }} className="text-sky-300 underline">buscar de nuevo</button>. Si Chrome pregunta si la página puede acceder a dispositivos de tu red local, pulsa «Permitir».</p>}
    </div>
    {!filesOverride && <input type="file" accept="video/mp4,video/*" multiple onChange={e => pick(e.target.files)} disabled={busy} />}
    {!!files.length && <ol className="space-y-1 text-sm">
      {files.map((f, i) => <li key={f.name + i} className="flex items-center gap-2 rounded bg-white/[.03] px-2 py-1">
        <span className="w-6 text-slate-500">{i + 1}.</span><span className="flex-1 truncate">{f.name}</span>
        <span className="text-xs text-slate-500">{(f.size / 1048576).toFixed(1)} MB</span>
        {!filesOverride && <><button type="button" disabled={busy} onClick={() => move(i, -1)} className="px-1 text-slate-400">↑</button>
        <button type="button" disabled={busy} onClick={() => move(i, 1)} className="px-1 text-slate-400">↓</button></>}
      </li>)}
    </ol>}
    {!filesOverride && !!files.length && files.length !== blocks && <p className="text-xs text-amber-200/80">
      El guion tiene {blocks} bloque(s) y subiste {files.length} clip(s). {files.length < blocks ? "Se juntarán bloques seguidos para que cada clip lleve su diálogo." : "Los clips sobrantes irán sin diálogo (como tarjetas)."}
    </p>}
    <div className="space-y-2"><label htmlFor="watermark-mode" className="block text-xs text-slate-300">Quitar marca de agua</label><select id="watermark-mode" value={watermark} onChange={e => setWatermark(e.target.value as Watermark)} disabled={busy} className="max-w-sm"><option value="none">No · los clips no tienen marca (Higgsfield)</option><option value="dola">Sí · marca de Dola</option><option value="pavo">Sí · marca de Pavo IA</option><option value="custom">Sí · otra marca (indicar área)</option></select>{(watermark === "dola" || watermark === "pavo") && <p className="text-xs text-slate-400">Cada clip se lleva a la resolución de {watermark === "dola" ? "Dola (720 × 1280)" : "Pavo (704 × 1280)"} y se borra la marca, aunque alguno venga en otra resolución. Encima va el logo elegido, del tamaño justo para taparla (no se nota el difuminado).</p>}{watermark === "custom" && <div className="flex flex-wrap gap-2">{(["x", "y", "w", "h"] as const).map(key => <label key={key} className="text-xs text-slate-300">{key === "w" ? "Ancho" : key === "h" ? "Alto" : key}<input type="number" min="0" max="9999" value={rect[key]} onChange={e => setRect(prev => ({ ...prev, [key]: e.target.value }))} className="mt-1 w-20" /></label>)}<p className="w-full text-xs text-slate-400">Coordenadas en píxeles del clip original. Funciona con marcas fijas; revisa el resultado antes de publicar.</p></div>}
      {watermark !== "none" && <div className="space-y-3 rounded-lg border border-white/10 p-3"><p className="text-xs text-slate-300">Logo que tapa la marca <span className="text-slate-500">(el de la página donde publicas)</span></p><LogoPicker value={logo} onChange={id => { setLogo(id); rememberLogo(String(musicCtx?.series || title), id); }} disabled={busy} />
        <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" className="w-auto" checked={!!logo2} disabled={busy} onChange={e => { const v = e.target.checked ? (logo === FRUTI ? "un-minuto-en-oracion" : FRUTI) : ""; setLogo2(v); rememberLogo(logoKey2, v); }} /> <b>Sacar también otra versión con otro logo</b> <span className="text-slate-500">(para publicar en dos páginas; sale en el mismo montaje)</span></label>
        {!!logo2 && <div><p className="mb-2 text-xs text-slate-400">Logo de la segunda versión</p><LogoPicker value={logo2} onChange={id => { setLogo2(id); rememberLogo(logoKey2, id); }} disabled={busy} />{logo2 === logo && <p className="mt-1 text-[11px] text-amber-200">Elige un logo distinto al de arriba.</p>}</div>}
      </div>}</div>
    {!horizontal && <div className="space-y-2">
      <label htmlFor="cierre-cta" className="block text-xs text-slate-300">Llamada final <span className="text-slate-500">(línea amarilla bajo «{lastEpisode ? "FIN" : guion?.cierre || "Continuará..."}» en la tarjeta de cierre)</span></label>
      <input id="cierre-cta" value={cta} maxLength={40} onChange={e => { setCta(e.target.value); setCtaEdited(true); }} disabled={busy} className="max-w-sm" />
      <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={lastEpisode} onChange={e => setLastEpisode(e.target.checked)} disabled={busy} /> Último episodio de la serie (el cierre dice «FIN»)</label>
    </div>}
    <div className="space-y-2 rounded-lg border border-white/10 p-3">
      <p className="text-xs text-slate-300">Ritmo viral</p>
      <label className="flex items-start gap-2 text-xs text-slate-300"><input type="checkbox" checked={recortar} onChange={e => setRecortar(e.target.checked)} disabled={busy} className="mt-0.5" /><span><b>Quitar pausas muertas</b> (recomendado): cada clip empieza justo antes de la primera palabra y corta al terminar la frase. Así el vídeo fluye sin silencios, como los virales.</span></label>
      <label className="flex flex-wrap items-center gap-2 text-xs text-slate-300"><b>Ritmo</b>
        <select value={velocidad} onChange={e => setVelocidad(e.target.value)} disabled={busy} className="w-auto">
          <option value="1">Normal (como salen los clips)</option>
          <option value="1.1">Ágil · 10 % más rápido (recomendado)</option>
          <option value="1.2">Rápido · 20 % más rápido</option>
        </select>
        <span className="text-[11px] text-slate-500">Los clips de IA hablan lento; los virales dicen una frase cada 2-3 s. Voz y labios van juntos y la voz no cambia de tono.</span></label>
      <fieldset className="space-y-1"><legend className="text-xs text-slate-300"><b>Acabado profesional</b> <span className="text-slate-500">(como un editor de Premiere y After Effects)</span></legend>
        {([
          ["sonido", "Sonido profesional", "voz igualada clip a clip, voz limpia, cortes J/L y volumen de redes (-14 LUFS)"],
          ["sfx", "Efectos de sonido", "whoosh en los saltos de tiempo, golpe en el gancho y en la revelación, riser antes del giro y silencio de tráiler"],
          ["color", "Color de cine", "igualar el color entre clips y el look del estilo (viñeta y grano)"],
          ["camara", "Cámara y textos animados", "punch-in en la palabra fuerte, temblor en la revelación, movimiento lento en el Narrador, textos con entrada suave"],
        ] as [keyof typeof pro, string, string][]).map(([k, label, desc]) => <label key={k} className="flex items-start gap-2 text-xs text-slate-300"><input type="checkbox" className="mt-0.5 w-auto" checked={pro[k]} onChange={() => togglePro(k)} disabled={busy} /><span><b>{label}</b> · <span className="text-slate-400">{desc}</span></span></label>)}
      </fieldset>
      {!horizontal && <fieldset className="space-y-1"><legend className="text-xs text-slate-300"><b>Versiones por red</b> <span className="text-slate-500">(salen del mismo montaje, además del vídeo principal)</span></legend>
        {REDES.map(r => <label key={r.id} className="flex items-start gap-2 text-xs text-slate-300"><input type="checkbox" className="mt-0.5 w-auto" checked={versiones.includes(r.id)} onChange={() => toggleVersion(r.id)} disabled={busy} /><span><b>{r.label}</b> · <span className="text-slate-400">{r.desc}</span></span></label>)}
      </fieldset>}
      {Array.isArray(guion?.tarjetas) && guion.tarjetas.length > 0 && <p className="text-[11px] text-slate-400">Saltos de tiempo: {guion.tarjetas.map((t: any) => `«${t.texto}» antes de la escena ${t.antes + 1}`).join(" · ")} (1,3 s sobre la escena siguiente difuminada).</p>}
      {part > 1 && <div className="space-y-1">
        <p className="text-xs text-slate-300"><b>«Anteriormente...»</b> <span className="text-slate-500">(opcional)</span>: sube el vídeo final de la Parte {part - 1} y el episodio abre con ~12 s en blanco y negro: 3-4 frases clave repartidas por toda esa parte (el conflicto, el giro y la última antes del cierre, sin el Narrador) y arriba una frase que la resume. Así quien llega nuevo entiende qué pasó.</p>
        <div className="flex flex-wrap items-center gap-2"><input type="file" accept="video/mp4,video/*" onChange={e => setAnterior(e.target.files?.[0] || null)} disabled={busy} />{anterior && <button type="button" disabled={busy} onClick={() => setAnterior(null)} className="text-xs text-slate-400 hover:text-red-300">Quitar</button>}</div>
        <label htmlFor="recap-resumen" className="block text-[11px] text-slate-400">Frase de resumen en pantalla (máx. 140 caracteres; vacía = sin frase)</label>
        <textarea id="recap-resumen" rows={2} maxLength={140} value={resumen} onChange={e => setResumen(e.target.value)} disabled={busy} placeholder="Ej.: Manzanita escondió a su madre del campo para casarse con una millonaria…" className="w-full text-xs" />
      </div>}
    </div>
    <div className="space-y-2 rounded-lg border border-white/10 p-3">
      <p className="text-xs text-slate-300">Música de fondo original <span className="text-slate-500">(opcional · creada con Muse)</span></p>
      <ol className="list-decimal space-y-1 pl-4 text-[11px] text-slate-400">
        <li><b>Una vez por serie:</b> copia «Tema de la serie» y créalo en <a href="https://muse.ai" target="_blank" rel="noreferrer" className="text-sky-300 underline">Muse</a>. Es la melodía de firma: la misma en todas las partes.</li>
        <li><b>Con «Inicio y final»</b> (recomendado) basta el tema de la serie: suena con el gancho y vuelve en el «Continuará…». <b>Con «Todo el vídeo»</b>, copia «Pista de este capítulo» (una versión del tema con la duración y los momentos de este episodio).</li>
        <li>Descarga el MP3 y súbelo aquí. Al montar va por debajo y baja un poco cuando hablan.</li>
      </ol>
      {(() => { const ctx: MusicContext = { style, part, cues: musicCues, seconds, scenes: files.length, ...musicCtx }; return <div className="flex flex-wrap gap-2">
        <CopyButton text={seriesThemePrompt(ctx)} label="Copiar tema de la serie" />
        <CopyButton text={episodeTrackPrompt(ctx)} label="Copiar pista de este capítulo" />
      </div>; })()}
      <div className="flex flex-wrap items-center gap-2">
        <input type="file" accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,audio/aac,audio/ogg,audio/flac,.mp3,.wav,.m4a,.aac,.ogg,.flac" onChange={e => setMusic(e.target.files?.[0] || null)} disabled={busy} />
        {music && <><select aria-label="Dónde suena la música" value={musicMode} onChange={e => setMusicMode(e.target.value as "extremos" | "todo")} disabled={busy} className="text-xs"><option value="extremos">Inicio y final (firma de la serie, recomendado)</option><option value="todo">Todo el vídeo, por debajo de las voces</option></select>
        <select aria-label="Volumen de la música" value={musicVol} onChange={e => setMusicVol(e.target.value)} disabled={busy} className="text-xs"><option value="0.1">Muy suave</option><option value="0.18">Suave (recomendado)</option><option value="0.28">Media</option></select>
        <button type="button" disabled={busy} onClick={() => setMusic(null)} className="text-xs text-slate-400 hover:text-red-300">Quitar música</button></>}
        {music && serieKey && <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={songSaved} disabled={busy} onChange={e => { const on = e.target.checked; setSongSaved(on); void setSong(serieKey, on ? music : null); }} /> Canción de firma de «{serieKey}»: ponerla sola en cada capítulo (se guarda en este navegador)</label>}
      </div>
      {music && <audio src={musicUrl} controls className="h-8 w-full max-w-sm" />}
    </div>
    <button type="button" disabled={busy || !files.length} onClick={montar} className="rounded bg-amber-500 px-5 py-2.5 font-bold disabled:opacity-50">{busy ? "Montando…" : "Montar vídeo final"}</button>
    {busy && <div className="space-y-3">
      <div>
        <div className="flex justify-between text-xs text-slate-300"><span>{live ? live.paso : uploadPct < 100 ? `Subiendo clips al servidor… ${uploadPct}%` : "Clips subidos, arrancando el servidor…"}</span><b>{pct}%</b></div>
        <div className="mt-1 h-2 overflow-hidden rounded bg-white/10"><div className="h-full bg-amber-400 transition-all" style={{ width: `${pct}%` }} /></div>
        <p className="mt-1 text-xs text-slate-500">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")} · progreso real del servidor. No cierres esta pestaña.</p>
      </div>
      {/* Montaje en vivo: el clip que está procesando el servidor, con su subtítulo, y el registro de pasos. */}
      <div className="flex flex-wrap gap-3">
        <div className="relative h-64 w-36 shrink-0 overflow-hidden rounded-lg bg-black">
          {monitorUrl ? <video key={monitorUrl} src={monitorUrl} autoPlay muted loop playsInline className="h-full w-full object-cover" />
            : <div className="flex h-full items-center justify-center p-2 text-center text-[11px] text-slate-500">{live?.estado === "en cola" ? "En cola…" : "Preparando…"}</div>}
          {monitorClip >= 0 && <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 text-[10px] font-bold text-amber-300">CLIP {monitorClip + 1}/{files.length}</span>}
          {monitorLines.length > 0 && <p className="absolute inset-x-1 bottom-6 text-center text-[11px] font-bold leading-tight drop-shadow-[0_1px_2px_rgba(0,0,0,1)]">{monitorLines.map(([spk, txt], k) => <span key={k} style={{ color: `#${guion?.colores?.[spk] ? String(guion.colores[spk]).replace("#", "") : "FFFFFF"}` }}>{txt} </span>)}</p>}
        </div>
        <ol className="min-w-[200px] flex-1 space-y-0.5 overflow-hidden text-xs">
          {(live?.log || []).slice(-9).map((l, k, arr) => <li key={k} className={k === arr.length - 1 ? "font-semibold text-amber-200" : "text-slate-400"}>{k === arr.length - 1 ? "▶ " : "✓ "}{l}</li>)}
        </ol>
      </div>
    </div>}
    {error && <p className="rounded border border-red-500/30 bg-red-500/10 p-2 text-sm text-red-200">{error}</p>}
    {video && <div className="space-y-2">
      <video src={video} controls className="max-h-[70vh] rounded" />
      <div className="flex flex-wrap gap-2">
        <a href={video} download={video2 && names[0] ? fname.replace(/\.mp4$/, `-${slug(names[0])}.mp4`) : fname} onClick={() => onDownloaded?.()} className="inline-block rounded bg-emerald-500 px-4 py-2 text-sm font-bold text-black">Descargar {video2 && names[0] ? `versión ${names[0]}` : fname}</a>
        {video2 && <a href={video2} download={fname.replace(/\.mp4$/, `-${slug(names[1])}.mp4`)} onClick={() => onDownloaded?.()} className="inline-block rounded bg-emerald-500 px-4 py-2 text-sm font-bold text-black">Descargar versión {names[1]}</a>}
      </div>
      {video2 && <p className="text-xs text-slate-400">Mismo vídeo con dos logos: arriba se ve la versión {names[0]}.</p>}
      {revision && <Revision r={revision} />}
      {revision && !busy && <Mejoras key={job?.id || "r"} revision={revision} style={style} velocidad={velocidad} recortar={recortar} cta={cta}
        onApply={({ vel, rec, quitarCta }) => {
          if (vel) setVelocidad(vel);
          if (rec) setRecortar(true);
          if (quitarCta) { setCta(""); setCtaEdited(true); }
          setRemontar(true);
        }} />}
      {extras.length > 0 && job && <div className="rounded-lg border border-white/10 p-3">
        <p className="mb-2 text-xs font-semibold text-slate-300">Versiones por red</p>
        <div className="flex flex-wrap gap-2">{extras.map(e => {
          const red = e.red === "facebook" ? "Facebook" : e.red === "shorts" ? "Shorts" : e.red === "clip" ? `clip vertical ${e.parte}` : `TikTok ${e.parte}/${e.total}`;
          const logoTxt = video2 && names[e.logo - 1] ? ` · ${names[e.logo - 1]}` : "";
          const file = fname.replace(/\.mp4$/, `-${e.red}${e.parte ? `-${e.parte}` : ""}${video2 && names[e.logo - 1] ? `-${slug(names[e.logo - 1])}` : ""}.mp4`);
          return <button key={e.k} type="button" disabled={bajando >= 0} onClick={async () => {
            setBajando(e.k);
            try { const r = await fetch(`${job.base}/trabajos/${job.id}/extra/${e.k}`); if (!r.ok) throw new Error(`HTTP ${r.status}`); const u = URL.createObjectURL(await r.blob()); const a = document.createElement("a"); a.href = u; a.download = file; a.click(); setTimeout(() => URL.revokeObjectURL(u), 60000); }
            catch (err: any) { setError("No se pudo descargar la versión: " + (err?.message || err) + ". Está guardada 30 min en el PC."); }
            finally { setBajando(-1); }
          }} className="rounded bg-sky-500 px-3 py-2 text-xs font-bold text-black disabled:opacity-60">{bajando === e.k ? "Descargando…" : `Descargar ${red}${logoTxt}`}</button>;
        })}</div>
      </div>}
      {cover && <div className="mt-3 flex flex-wrap items-end gap-3"><img src={cover} alt="Portada del episodio" className="h-64 rounded-lg border border-white/10" /><a href={cover} download={fname.replace(/\.mp4$/, "-portada.jpg")} className="rounded bg-amber-500 px-4 py-2 text-sm font-bold text-black">Descargar portada</a></div>}
      {onDownloaded && <p className="text-xs text-slate-400">Al descargarlo, este episodio queda terminado y bloqueado, y se abre el paso para crear la parte siguiente.</p>}
      {!!publish.length && <div className="mt-3 space-y-2">
        <p className="text-sm font-bold">Listo para publicar</p>
        <div className="grid gap-3 md:grid-cols-2">{publish.map(p => <div key={p.platform} className="rounded-xl border border-white/10 bg-black/20 p-3">
          <p className="font-bold">{p.platform === "Facebook" ? "📘" : p.platform === "Instagram" ? "📸" : "🎵"} {p.platform}</p>
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Texto corto</p>
          <p className="mt-1 whitespace-pre-line text-sm">{p.text}</p>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Hashtags</p>
          <p className="mt-1 text-sm text-sky-200">{p.hashtags}</p>
          {p.extra && <p className="mt-2 text-xs text-slate-400">{p.extra}</p>}
          <div className="mt-3 flex flex-wrap gap-2"><CopyButton text={p.text} label="Copiar texto" /><CopyButton text={p.hashtags} label="Copiar hashtags" /><CopyButton text={`${p.text}\n\n${p.hashtags}`} label="Copiar todo" /></div>
        </div>)}</div>
      </div>}
    </div>}
  </div>;
}
