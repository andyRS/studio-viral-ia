"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { postApi, isAuthError } from "@/lib/api-client";
import CopyButton from "./CopyButton";

// Marcas de agua conocidas: el servidor reescala a 720x1280 (Dola) o 704x1280 (Pavo) y las borra (ver montaje/README.md).
type Watermark = "none" | "dola" | "pavo" | "custom";
type Live = { estado: string; pct: number; paso: string; log: string[] };
type Target = "pc" | "nube";

// Servidor de montaje en el PC del usuario (montaje/local/«Montar en mi PC.bat»): GPU NVIDIA, sin subir los clips a internet.
const PC_URL = "http://127.0.0.1:8765";
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
  if (nClips !== blocks.length) delete out.tarjetas;
  if (opts.marca) out.marca = opts.marca; else if (opts.delogo) out.delogo = opts.delogo;
  if (opts.cierre) out.cierre = opts.cierre;
  if (opts.cierreCta?.trim()) out.cierre_cta = opts.cierreCta.trim(); else delete out.cierre_cta;
  return out;
}

// Llamada final (línea amarilla de la tarjeta de cierre) según el estilo y si la serie termina.
export function defaultCta(style: string, part: number, last: boolean) {
  if (style === "cristiana") return "Escribe AMÉN";
  return last ? "Dale me gusta y comenta qué te pareció" : `Comenta PARTE ${part + 1}`;
}

// Prompt para que Muse (muse.ai) cree la música de fondo original del episodio. Muse no tiene API
// pública: se copia el prompt, se descarga el MP3 que crea y se sube aquí.
export function musePrompt(style: string, seconds: number, cues: string[]) {
  const mood = style === "cristiana" ? "emotiva y esperanzadora, de inspiración cristiana (piano, cuerdas y pads cálidos)"
    : style === "cine90" ? "dramática de telenovela de los 90 (cuerdas, piano y sintetizadores de la época)"
    : "dramática de telenovela latina moderna (cuerdas, piano y percusión suave)";
  const arc = Array.from(new Set(cues.map(c => c.trim()).filter(Boolean))).slice(0, 6);
  return [
    `Crea una pista instrumental original, sin voces ni letra, de ${Math.max(30, Math.round(seconds))} segundos, para el fondo de un microdrama vertical de redes sociales.`,
    `Estilo: música ${mood}.`,
    arc.length ? `Que siga este arco emocional, en orden: ${arc.join(" → ")}.` : "Que empiece con tensión, suba hacia un clímax y cierre con un final emotivo en suspenso.",
    "Debe quedar por debajo de los diálogos: melodía sencilla, sin solos fuertes ni golpes que tapen las voces.",
    "Formato: MP3 de buena calidad, que empiece y termine limpio.",
  ].join("\n");
}

export default function MontajePanel({ guion, title, filesOverride, style = "frutinovela", part = 1, musicCues = [], seconds = 0, onDownloaded, publish = [] }: { guion: any; title: string; filesOverride?: File[]; style?: string; part?: number; musicCues?: string[]; seconds?: number; onDownloaded?: () => void; publish?: { platform: string; text: string; hashtags: string; extra?: string }[] }) {
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
  const [recortar, setRecortar] = useState(true);
  const [anterior, setAnterior] = useState<File | null>(null);
  const musicUrl = useMemo(() => (music ? URL.createObjectURL(music) : ""), [music]);
  useEffect(() => () => { if (musicUrl) URL.revokeObjectURL(musicUrl); }, [musicUrl]);
  const [busy, setBusy] = useState(false);
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
      const needs = [music && ["musica", "la música de fondo"], anterior && ["anterior", "«Anteriormente...»"], recortar && ["recorte", "quitar las pausas"]].filter(Boolean) as [string, string][];
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
      fd.append("guion", new Blob([JSON.stringify({ ...adaptGuion(guion, files.length, { marca, delogo, cierre: lastEpisode ? "FIN" : guion?.cierre || "Continuará...", cierreCta: cta }), ...(music ? { musica_volumen: Number(musicVol) } : {}), recortar })], { type: "application/json" }), "guion.json");
      for (const f of files) fd.append("clips", f, f.name);
      if (music) fd.append("musica", music, music.name);
      if (anterior) fd.append("anterior", anterior, anterior.name);
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
    <div className="space-y-2"><label htmlFor="watermark-mode" className="block text-xs text-slate-300">Quitar marca de agua</label><select id="watermark-mode" value={watermark} onChange={e => setWatermark(e.target.value as Watermark)} disabled={busy} className="max-w-sm"><option value="none">No · los clips no tienen marca (Higgsfield)</option><option value="dola">Sí · marca de Dola</option><option value="pavo">Sí · marca de Pavo IA</option><option value="custom">Sí · otra marca (indicar área)</option></select>{(watermark === "dola" || watermark === "pavo") && <p className="text-xs text-slate-400">Cada clip se lleva a la resolución de {watermark === "dola" ? "Dola (720 × 1280)" : "Pavo (704 × 1280)"} y se borra la marca, aunque alguno venga en otra resolución. Encima va la marca FrutiEnganchados, del tamaño justo para taparla (no se nota el difuminado).</p>}{watermark === "custom" && <div className="flex flex-wrap gap-2">{(["x", "y", "w", "h"] as const).map(key => <label key={key} className="text-xs text-slate-300">{key === "w" ? "Ancho" : key === "h" ? "Alto" : key}<input type="number" min="0" max="9999" value={rect[key]} onChange={e => setRect(prev => ({ ...prev, [key]: e.target.value }))} className="mt-1 w-20" /></label>)}<p className="w-full text-xs text-slate-400">Coordenadas en píxeles del clip original. Funciona con marcas fijas; revisa el resultado antes de publicar.</p></div>}</div>
    <div className="space-y-2">
      <label htmlFor="cierre-cta" className="block text-xs text-slate-300">Llamada final <span className="text-slate-500">(línea amarilla bajo «{lastEpisode ? "FIN" : guion?.cierre || "Continuará..."}» en la tarjeta de cierre)</span></label>
      <input id="cierre-cta" value={cta} maxLength={40} onChange={e => { setCta(e.target.value); setCtaEdited(true); }} disabled={busy} className="max-w-sm" />
      <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={lastEpisode} onChange={e => setLastEpisode(e.target.checked)} disabled={busy} /> Último episodio de la serie (el cierre dice «FIN»)</label>
    </div>
    <div className="space-y-2 rounded-lg border border-white/10 p-3">
      <p className="text-xs text-slate-300">Ritmo viral</p>
      <label className="flex items-start gap-2 text-xs text-slate-300"><input type="checkbox" checked={recortar} onChange={e => setRecortar(e.target.checked)} disabled={busy} className="mt-0.5" /><span><b>Quitar pausas muertas</b> (recomendado): cada clip empieza justo antes de la primera palabra y corta al terminar la frase. Así el vídeo fluye sin silencios, como los virales.</span></label>
      {Array.isArray(guion?.tarjetas) && guion.tarjetas.length > 0 && <p className="text-[11px] text-slate-400">Saltos de tiempo: {guion.tarjetas.map((t: any) => `«${t.texto}» antes de la escena ${t.antes + 1}`).join(" · ")} (tarjeta negra de 1,6 s).</p>}
      {part > 1 && <div className="space-y-1">
        <p className="text-xs text-slate-300"><b>«Anteriormente...»</b> <span className="text-slate-500">(opcional)</span>: sube el vídeo final de la Parte {part - 1} y el episodio abre con sus últimos 7 s en blanco y negro.</p>
        <div className="flex flex-wrap items-center gap-2"><input type="file" accept="video/mp4,video/*" onChange={e => setAnterior(e.target.files?.[0] || null)} disabled={busy} />{anterior && <button type="button" disabled={busy} onClick={() => setAnterior(null)} className="text-xs text-slate-400 hover:text-red-300">Quitar</button>}</div>
      </div>}
    </div>
    <div className="space-y-2 rounded-lg border border-white/10 p-3">
      <p className="text-xs text-slate-300">Música de fondo original <span className="text-slate-500">(opcional · creada con Muse)</span></p>
      <ol className="list-decimal space-y-1 pl-4 text-[11px] text-slate-400">
        <li>Copia el prompt y pégalo en <a href="https://muse.ai" target="_blank" rel="noreferrer" className="text-sky-300 underline">Muse</a>.</li>
        <li>Descarga el MP3 que crea y súbelo aquí. Si es más corto que el episodio, se repite.</li>
        <li>Al montar, la música va por debajo y baja sola cuando alguien habla.</li>
      </ol>
      <CopyButton text={musePrompt(style, seconds || files.length * 8, musicCues)} label="Copiar prompt para Muse" />
      <div className="flex flex-wrap items-center gap-2">
        <input type="file" accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,audio/aac,audio/ogg,audio/flac,.mp3,.wav,.m4a,.aac,.ogg,.flac" onChange={e => setMusic(e.target.files?.[0] || null)} disabled={busy} />
        {music && <><select aria-label="Volumen de la música" value={musicVol} onChange={e => setMusicVol(e.target.value)} disabled={busy} className="text-xs"><option value="0.1">Muy suave</option><option value="0.18">Suave (recomendado)</option><option value="0.28">Media</option></select>
        <button type="button" disabled={busy} onClick={() => setMusic(null)} className="text-xs text-slate-400 hover:text-red-300">Quitar música</button></>}
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
      <a href={video} download={fname} onClick={() => onDownloaded?.()} className="inline-block rounded bg-emerald-500 px-4 py-2 text-sm font-bold text-black">Descargar {fname}</a>
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
