"use client";
import { useEffect, useRef, useState } from "react";
import { postApi, isAuthError } from "@/lib/api-client";

// Marca de agua de Dola en clips 720x1280 (ver montaje/README.md).
const DOLA_DELOGO = "x=603:y=1232:w=104:h=36";
const EST_SECONDS_PER_CLIP = 60; // ~3 min por 3 clips de 15 s en una CPU modesta

// El servidor espera un bloque de diálogo por clip. Si hay menos clips que bloques
// (p. ej. un solo clip de Dola de 60 s), se juntan bloques consecutivos; si hay más,
// los clips sobrantes van sin diálogo (tarjetas).
export function adaptGuion(guion: any, nClips: number, delogo: string = "") {
  const blocks: any[][] = Array.isArray(guion?.clips) ? guion.clips : [];
  let clips: any[][];
  if (nClips >= blocks.length) clips = [...blocks, ...Array.from({ length: nClips - blocks.length }, () => [])];
  else clips = Array.from({ length: nClips }, (_, i) => blocks.slice(Math.floor((i * blocks.length) / nClips), Math.floor(((i + 1) * blocks.length) / nClips)).flat());
  const colores: Record<string, string> = {};
  for (const [k, v] of Object.entries(guion?.colores || {})) colores[k] = String(v).replace("#", "").toUpperCase();
  const out: any = { ...guion, colores, clips };
  if (delogo) out.delogo = delogo; else delete out.delogo;
  return out;
}

export default function MontajePanel({ guion, title, filesOverride }: { guion: any; title: string; filesOverride?: File[] }) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const files = filesOverride ?? selectedFiles;
  const [watermark, setWatermark] = useState<"none" | "dola" | "custom">("none");
  const [rect, setRect] = useState({ x: "", y: "", w: "", h: "" });
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [video, setVideo] = useState<string>("");
  const timer = useRef<any>(null);
  const blocks = Array.isArray(guion?.clips) ? guion.clips.length : 0;
  const est = Math.max(1, files.length) * EST_SECONDS_PER_CLIP;

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
    const delogo = watermark === "dola" ? DOLA_DELOGO : watermark === "custom" ? custom : "";
    setBusy(true); setError(""); setElapsed(0);
    if (video) { URL.revokeObjectURL(video); setVideo(""); }
    const t0 = Date.now(); timer.current = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000);
    try {
      const t = await postApi("/api/montaje", {});
      if (isAuthError(t)) { setError("Inicia sesión para usar el montaje automático."); return; }
      if (!t.json?.ok) { setError(t.json?.error || "No se pudo contactar con el servidor de montaje."); return; }
      const fd = new FormData();
      fd.append("guion", new Blob([JSON.stringify(adaptGuion(guion, files.length, delogo))], { type: "application/json" }), "guion.json");
      for (const f of files) fd.append("clips", f, f.name);
      const r = await fetch(`${t.json.url}/montar`, { method: "POST", headers: { Authorization: `Ticket ${t.json.ticket}` }, body: fd });
      if (!r.ok) { let msg = `HTTP ${r.status}`; try { msg = (await r.json()).detail || msg; } catch {} setError("El montaje falló: " + msg); return; }
      setVideo(URL.createObjectURL(await r.blob()));
    } catch (e: any) {
      setError("No se pudo completar el montaje: " + (e?.message || e) + ". Revisa que el servidor de montaje esté encendido.");
    } finally { clearInterval(timer.current); setBusy(false); }
  }

  const pct = Math.min(95, Math.round((elapsed / est) * 100));
  const fname = `${(title || "episodio").replace(/[^\w\-áéíóúñ ]+/gi, "").trim().replace(/\s+/g, "-") || "episodio"}.mp4`;

  return <div className="rounded-xl bg-[#121826] p-4 space-y-3">
    <p className="text-sm text-slate-300">Sube los clips del episodio <b>en orden</b> y el servidor devuelve el vídeo final con gancho, subtítulos de colores, tarjetas y cierre.</p>
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
    <div className="space-y-2"><label htmlFor="watermark-mode" className="block text-xs text-slate-300">Marca fija en los clips</label><select id="watermark-mode" value={watermark} onChange={e => setWatermark(e.target.value as "none" | "dola" | "custom")} disabled={busy} className="max-w-sm"><option value="none">Sin corrección</option><option value="dola">Dola · 720 × 1280</option><option value="custom">Pavo u otra · indicar área</option></select>{watermark === "custom" && <div className="flex flex-wrap gap-2">{(["x", "y", "w", "h"] as const).map(key => <label key={key} className="text-xs text-slate-300">{key === "w" ? "Ancho" : key === "h" ? "Alto" : key}<input type="number" min="0" max="9999" value={rect[key]} onChange={e => setRect(prev => ({ ...prev, [key]: e.target.value }))} className="mt-1 w-20" /></label>)}<p className="w-full text-xs text-slate-400">Coordenadas en píxeles del clip original. Funciona con marcas fijas; revisa el resultado antes de publicar.</p></div>}</div>
    <button type="button" disabled={busy || !files.length} onClick={montar} className="rounded bg-amber-500 px-5 py-2.5 font-bold disabled:opacity-50">{busy ? "Montando…" : "Montar vídeo final"}</button>
    {busy && <div>
      <div className="h-2 overflow-hidden rounded bg-white/10"><div className="h-full bg-amber-400 transition-all" style={{ width: `${pct}%` }} /></div>
      <p className="mt-1 text-xs text-slate-400">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")} · suele tardar unos {Math.round(est / 60)} min. No cierres esta pestaña.</p>
    </div>}
    {error && <p className="rounded border border-red-500/30 bg-red-500/10 p-2 text-sm text-red-200">{error}</p>}
    {video && <div className="space-y-2">
      <video src={video} controls className="max-h-[70vh] rounded" />
      <a href={video} download={fname} className="inline-block rounded bg-emerald-500 px-4 py-2 text-sm font-bold text-black">Descargar {fname}</a>
    </div>}
  </div>;
}
