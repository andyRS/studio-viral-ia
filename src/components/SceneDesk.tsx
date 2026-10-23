"use client";
import { useEffect, useMemo, useState } from "react";
import { useData } from "@/lib/DataContext";
import CopyButton from "./CopyButton";
import MontajePanel from "./MontajePanel";
import type { Scene } from "@/lib/types";

type AssetMap = Record<number, File>;
const sceneNumber = (name: string) => /(?:^|[^a-z0-9])s(?:cene|cena)?[ _-]*0*(\d{1,2})(?=[^0-9]|$)/i.exec(name)?.[1];

export default function SceneDesk({ episodeId, scenes, guion, title, referencesReady, referenceSignature, style, part }: { episodeId: string; scenes: Scene[]; guion: any; title: string; referencesReady: boolean; referenceSignature: string; style?: string; part?: number }) {
  const { data, insert, update, remove } = useData();
  const [images, setImages] = useState<AssetMap>({});
  const [clips, setClips] = useState<AssetMap>({});
  const [reasons, setReasons] = useState<Record<number, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [dirtyClips, setDirtyClips] = useState<number[]>([]);
  const checks = data.clipChecks.filter(c => c.episodeId === episodeId);
  const clipUrls = useMemo(() => Object.fromEntries(Object.entries(clips).map(([n, file]) => [n, URL.createObjectURL(file)])), [clips]);
  const imageUrls = useMemo(() => Object.fromEntries(Object.entries(images).map(([n, file]) => [n, URL.createObjectURL(file)])), [images]);
  useEffect(() => () => { Object.values(clipUrls).forEach(URL.revokeObjectURL); }, [clipUrls]);
  useEffect(() => () => { Object.values(imageUrls).forEach(URL.revokeObjectURL); }, [imageUrls]);

  function assign(list: FileList | null, kind: "image" | "clip") {
    const incoming = Array.from(list || []);
    const mapped: AssetMap = {};
    const issues: string[] = [];
    for (const file of incoming) {
      const n = Number(sceneNumber(file.name));
      if (!n || n > scenes.length || mapped[n]) { issues.push(file.name); continue; }
      mapped[n] = file;
    }
    if (kind === "image") { setImages(prev => ({ ...prev, ...mapped })); setDirtyClips(prev => Array.from(new Set([...prev, ...Object.keys(mapped).map(Number)]))); }
    else { setClips(prev => ({ ...prev, ...mapped })); setDirtyClips(prev => Array.from(new Set([...prev, ...Object.keys(mapped).map(Number)]))); }
    setMessage(issues.length ? `No se asignaron: ${issues.join(", ")}. Usa s01, s02… en el nombre y evita números duplicados.` : `${Object.keys(mapped).length} ${kind === "clip" ? "clips" : "imágenes"} asignados por número de escena.`);
  }

  // Quitar lo que no sirve: el archivo subido por error (imagen o clip) o la revisión guardada.
  function dropFile(n: number, kind: "image" | "clip") {
    const strip = (prev: AssetMap) => { const next = { ...prev }; delete next[n]; return next; };
    if (kind === "image") setImages(strip); else setClips(strip);
  }
  async function deleteReview(n: number) {
    const old = checks.find(c => c.clipIndex === n - 1);
    if (!old || !window.confirm(`¿Borrar la revisión de la escena s${String(n).padStart(2, "0")}? Tendrás que revisarla de nuevo.`)) return;
    try { await remove("clipChecks", old.id); } catch (error: any) { setMessage(`No se pudo borrar la revisión: ${error?.message || String(error)}`); }
  }

  async function mark(n: number, approved: boolean) {
    const note = (reasons[n] ?? checks.find(c => c.clipIndex === n - 1)?.notes ?? "").trim();
    if (!approved && !note) { setMessage(`Escribe en una línea por qué hay que rehacer s${String(n).padStart(2, "0")}.`); return; }
    if (approved && !clips[n]) { setMessage(`Sube el clip s${String(n).padStart(2, "0")} para revisarlo antes de aprobar.`); return; }
    setBusy(n); setMessage("");
    try {
      const old = checks.find(c => c.clipIndex === n - 1);
      const payload = { episodeId, clipIndex: n - 1, approved, referenceSignature, notes: approved ? "" : note, facesConsistent: old?.facesConsistent || false, fullPhrases: old?.fullPhrases || false, pronunciationOk: old?.pronunciationOk || false, noWatermark: old?.noWatermark || false, fruitHeads: old?.fruitHeads || false };
      if (old) await update("clipChecks", old.id, payload);
      else await insert("clipChecks", payload);
      if (approved) setDirtyClips(prev => prev.filter(value => value !== n));
    } catch (error: any) { setMessage(`No se pudo guardar la revisión: ${error?.message || String(error)}`); }
    finally { setBusy(null); }
  }

  const approved = scenes.filter(s => !dirtyClips.includes(s.n) && checks.some(c => c.clipIndex === s.n - 1 && c.approved && c.referenceSignature === referenceSignature)).length;
  const ordered = scenes.map(s => clips[s.n]).filter((f): f is File => !!f);
  const ready = referencesReady && approved === scenes.length && ordered.length === scenes.length;

  return <div className="space-y-4">
    <div className="rounded-2xl border border-white/10 bg-[#151C2B] p-4">
      <div className="flex flex-wrap items-center gap-3"><div><h3 className="font-bold text-white">Mesa de escenas</h3><p className="mt-1 text-xs text-slate-300">{approved}/{scenes.length} aprobadas · {ordered.length}/{scenes.length} clips en esta sesión</p></div><span className="ml-auto rounded-full bg-white/10 px-3 py-1 text-xs text-slate-200">s01 → s{String(scenes.length).padStart(2, "0")}</span></div>
      <div className="mt-3 flex flex-wrap gap-3 text-xs">
        <label className="cursor-pointer rounded-lg border border-white/15 px-3 py-2 text-slate-100">Subir imágenes por lote<input className="sr-only" type="file" accept="image/*" multiple onChange={e => assign(e.target.files, "image")} /></label>
        <label className="cursor-pointer rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 font-semibold text-amber-100">Subir clips por lote<input className="sr-only" type="file" accept="video/*" multiple onChange={e => assign(e.target.files, "clip")} /></label>
      </div>
      <p className="mt-2 text-xs text-slate-400">Nombra cada archivo s01, s02… La revisión se guarda en tu cuenta; los archivos de vídeo se mantienen en esta sesión y tendrás que subirlos de nuevo si cierras la página.</p>
      {!referencesReady && <p className="mt-2 text-xs font-semibold text-amber-200">Aprueba primero todas las fichas maestras del elenco.</p>}
      {message && <p role="status" className="mt-2 text-xs text-amber-200">{message}</p>}
    </div>
    <ol className="space-y-2">{scenes.map(scene => {
      const check = checks.find(c => c.clipIndex === scene.n - 1);
      const sceneApproved = !!check?.approved && check.referenceSignature === referenceSignature && !dirtyClips.includes(scene.n);
      return <li key={scene.n} className="rounded-2xl border border-white/10 bg-[#151C2B] p-3 sm:p-4">
        <div className="flex flex-wrap gap-3 sm:flex-nowrap">
          <div className="flex h-24 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black/30 text-xs text-slate-400">{imageUrls[scene.n] ? <img src={imageUrls[scene.n]} alt={`Imagen de escena ${scene.n}`} className="h-full w-full object-cover" /> : `s${String(scene.n).padStart(2, "0")}`}</div>
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><b className="text-sm text-white">{String(scene.n).padStart(2, "0")} · {scene.title || scene.setting}</b><span className={`rounded-full px-2 py-0.5 text-[11px] ${sceneApproved ? "bg-emerald-400/15 text-emerald-300" : check?.notes && !dirtyClips.includes(scene.n) ? "bg-rose-400/15 text-rose-200" : "bg-white/10 text-slate-300"}`}>{sceneApproved ? "Aprobado" : check?.referenceSignature && check.referenceSignature !== referenceSignature ? "Revisar con ficha nueva" : check?.notes && !dirtyClips.includes(scene.n) ? "Rehacer" : "Pendiente"}</span></div>
            <p className="mt-1 text-xs text-slate-300">{scene.speaker}: «{scene.line}»</p>
            <div className="mt-2 flex flex-wrap gap-2"><CopyButton text={scene.animationPrompt} label="Copiar prompt" /><CopyButton text={scene.imagePromptFlow} label="Copiar imagen" /></div>
            <p className="mt-2 text-[11px] text-slate-400">Referencias: {(scene.references || []).join(", ") || "—"}</p>
            <div className="mt-1 flex flex-wrap gap-3 text-[11px]">
              {images[scene.n] && <button type="button" onClick={() => dropFile(scene.n, "image")} className="text-slate-400 hover:text-red-300">Quitar imagen</button>}
              {clips[scene.n] && <button type="button" onClick={() => dropFile(scene.n, "clip")} className="text-slate-400 hover:text-red-300">Quitar clip</button>}
              {check && <button type="button" onClick={() => { void deleteReview(scene.n); }} className="text-slate-400 hover:text-red-300">Borrar revisión</button>}
            </div>
          </div>
          <div className="min-w-0 w-full sm:w-52">{clipUrls[scene.n] ? <video src={clipUrls[scene.n]} controls preload="metadata" className="w-full rounded-lg bg-black" /> : <p className="rounded-lg border border-dashed border-white/15 p-3 text-xs text-slate-400">Falta clip s{String(scene.n).padStart(2, "0")}</p>}
            <div className="mt-2 flex gap-2"><button type="button" disabled={busy === scene.n || !referencesReady || !clips[scene.n]} onClick={() => mark(scene.n, true)} className="rounded-lg bg-emerald-400 px-2 py-1.5 text-xs font-bold text-slate-950 disabled:opacity-40">✓ Aprobado</button><button type="button" disabled={busy === scene.n} onClick={() => mark(scene.n, false)} className="rounded-lg border border-white/15 px-2 py-1.5 text-xs text-slate-100">↻ Rehacer</button></div>
            <input aria-label={`Motivo para rehacer escena ${scene.n}`} value={reasons[scene.n] ?? (check?.approved ? "" : check?.notes || "")} onChange={e => setReasons(prev => ({ ...prev, [scene.n]: e.target.value }))} placeholder="Motivo: cambió la cara…" className="mt-2 w-full text-xs" />
          </div>
        </div>
      </li>;
    })}</ol>
    <section className="rounded-2xl border border-amber-400/20 bg-amber-400/[.06] p-4"><h3 className="font-bold">Montar vídeo final</h3><p className="mt-1 text-xs text-slate-300">Se habilita con fichas maestras y todas las escenas aprobadas, y con todos los clips s01… cargados en orden.</p>
      {ready ? <div className="mt-3"><MontajePanel guion={guion} title={title} filesOverride={ordered} style={style} part={part} /></div> : <p className="mt-3 text-sm text-amber-200">Pendiente: {referencesReady ? "" : "fichas maestras; "}{scenes.length - approved} escenas por aprobar; {scenes.length - ordered.length} clips por subir.</p>}
    </section>
  </div>;
}
