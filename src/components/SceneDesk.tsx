"use client";
import { useEffect, useMemo, useState } from "react";
import { useData } from "@/lib/DataContext";
import PromptWorkbench from "./PromptWorkbench";
import ReferencePreview from "./ReferencePreview";
import CopyButton from "./CopyButton";
import MontajePanel from "./MontajePanel";
import type { Scene } from "@/lib/types";

type AssetMap = Record<number, File>;
type Kind = "image" | "clip";

// Número de escena a partir del nombre del archivo. Acepta s01, S02_…, escena 3, scene 4, clip 5,
// 001 / [001] (como los nombra la extensión de Flow), 001-2 (variante 2), 05_manzanita, manzanita_07.
// Las fechas largas (20261023130515) no cuentan como número de escena.
export function sceneNumberOf(fileName: string): { n: number; variant: number } | null {
  const name = fileName.replace(/\.[a-z0-9]{2,4}$/i, "");
  const variant = Number(/^\[?\d{1,3}\]?-(\d)\b/.exec(name)?.[1] || 1);
  const rules = [
    /(?:^|[^a-z0-9])(?:s|sc|scene|escena|clip|toma)[ _.-]*0*(\d{1,3})(?![0-9])/i,
    /^\[?0*(\d{1,3})\]?(?![0-9])/,
  ];
  for (const re of rules) { const m = re.exec(name); if (m && Number(m[1]) > 0) return { n: Number(m[1]), variant }; }
  const loose = name.match(/(?<![0-9])\d{1,3}(?![0-9])/g) || [];
  return loose.length === 1 && Number(loose[0]) > 0 ? { n: Number(loose[0]), variant: 1 } : null;
}
const kindOf = (f: File): Kind | null => f.type.startsWith("video/") || /\.(mp4|mov|webm|m4v)$/i.test(f.name) ? "clip" : f.type.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(f.name) ? "image" : null;

export default function SceneDesk({ episodeId, scenes, guion, title, referencesReady, referenceSignature, style, part, onDownloaded, publish, music, cover, recap }: { recap?: string; music?: Record<string, any>; cover?: { serie?: string; frase?: string[]; parte?: number }; episodeId: string; scenes: Scene[]; guion: any; title: string; referencesReady: boolean; referenceSignature: string; style?: string; part?: number; onDownloaded?: () => void; publish?: { platform: string; text: string; hashtags: string; extra?: string }[] }) {
  const { data, insert, update, remove } = useData();
  const [selectedScene, setSelectedScene] = useState<number>(scenes[0]?.n || 1);
  const activeScene = scenes.find(s => s.n === selectedScene) || scenes[0];
  const [images, setImages] = useState<AssetMap>({});
  const [clips, setClips] = useState<AssetMap>({});
  const [reasons, setReasons] = useState<Record<number, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [dirtyClips, setDirtyClips] = useState<number[]>([]);
  const [unplaced, setUnplaced] = useState<{ file: File; kind: Kind }[]>([]);
  const [dragging, setDragging] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const checks = data.clipChecks.filter(c => c.episodeId === episodeId);
  // Cadena de continuidad: el último fotograma del clip N, en PNG, para animar la escena N+1 desde él.
  async function lastFrame(url: string, n: number) {
    try {
      const v = document.createElement("video"); v.src = url; v.muted = true; v.preload = "auto";
      await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = rej; });
      v.currentTime = Math.max(0, v.duration - 0.05);
      await new Promise(res => { v.onseeked = res; });
      const c = document.createElement("canvas"); c.width = v.videoWidth; c.height = v.videoHeight;
      c.getContext("2d")!.drawImage(v, 0, 0);
      const blob: Blob = await new Promise(res => c.toBlob(b => res(b!), "image/png"));
      const name = `s${String(n + 1).padStart(2, "0")}-inicio-desde-s${String(n).padStart(2, "0")}.png`;
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click();
      // Además queda como imagen de la escena siguiente en la mesa.
      place("image", { [n + 1]: new File([blob], name, { type: "image/png" }) });
      setMessage(`Último fotograma de s${String(n).padStart(2, "0")} descargado y puesto como imagen de s${String(n + 1).padStart(2, "0")}: anímala desde esa imagen.`);
    } catch { setMessage("No se pudo sacar el último fotograma de ese clip."); }
  }
  const clipUrls = useMemo(() => Object.fromEntries(Object.entries(clips).map(([n, file]) => [n, URL.createObjectURL(file)])), [clips]);
  const imageUrls = useMemo(() => Object.fromEntries(Object.entries(images).map(([n, file]) => [n, URL.createObjectURL(file)])), [images]);
  useEffect(() => () => { Object.values(clipUrls).forEach(URL.revokeObjectURL); }, [clipUrls]);
  useEffect(() => () => { Object.values(imageUrls).forEach(URL.revokeObjectURL); }, [imageUrls]);

  function place(kind: Kind, mapped: AssetMap) {
    if (!Object.keys(mapped).length) return;
    (kind === "image" ? setImages : setClips)(prev => ({ ...prev, ...mapped }));
    setDirtyClips(prev => Array.from(new Set([...prev, ...Object.keys(mapped).map(Number)])));
  }
  // Sube todo de una vez (imágenes y clips mezclados): cada archivo va a su escena por el número del nombre.
  // Si hay variantes (001, 001-2…) se queda la primera; lo que no tiene número se coloca a mano.
  function assignAll(list: FileList | File[] | null) {
    const incoming = Array.from(list || []).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const best: Record<Kind, Record<number, { file: File; variant: number }>> = { image: {}, clip: {} };
    const leftovers: { file: File; kind: Kind }[] = [];
    const ignored: string[] = [];
    for (const file of incoming) {
      const kind = kindOf(file);
      if (!kind) { ignored.push(file.name); continue; }
      const hit = sceneNumberOf(file.name);
      if (!hit || hit.n > scenes.length) { leftovers.push({ file, kind }); continue; }
      const prev = best[kind][hit.n];
      if (!prev || hit.variant < prev.variant) { if (prev) leftovers.push({ file: prev.file, kind }); best[kind][hit.n] = { file, variant: hit.variant }; }
      else leftovers.push({ file, kind });
    }
    const asMap = (k: Kind) => Object.fromEntries(Object.entries(best[k]).map(([n, v]) => [n, v.file])) as AssetMap;
    place("image", asMap("image")); place("clip", asMap("clip"));
    setUnplaced(prev => [...prev, ...leftovers]);
    const nClips = Object.keys(best.clip).length, nImages = Object.keys(best.image).length;
    setMessage([
      `${nClips} clip(s) y ${nImages} imagen(es) colocados en su escena.`,
      leftovers.length ? `${leftovers.length} sin número reconocible o repetidos: colócalos abajo.` : "",
      ignored.length ? `Ignorados (no son vídeo ni imagen): ${ignored.join(", ")}.` : "",
    ].filter(Boolean).join(" "));
  }
  function placeManually(i: number, n: number) {
    const item = unplaced[i]; if (!item || !n) return;
    place(item.kind, { [n]: item.file });
    setUnplaced(prev => prev.filter((_, k) => k !== i));
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

  // Aprobar por lote: todas las escenas que tienen clip y aún no están aprobadas.
  async function approveAll() {
    const todo = scenes.filter(sc => clips[sc.n] && !(checks.some(c => c.clipIndex === sc.n - 1 && c.approved && c.referenceSignature === referenceSignature) && !dirtyClips.includes(sc.n)));
    const missing = scenes.filter(sc => !clips[sc.n]).length;
    if (!todo.length) { setMessage(missing ? `Faltan ${missing} clip(s) por subir; no hay nada más que aprobar.` : "Todas las escenas ya están aprobadas."); return; }
    if (!window.confirm(`¿Aprobar ${todo.length} escena(s) de una vez?${missing ? ` (${missing} sin clip se quedan pendientes.)` : ""} Hazlo después de haberlas visto.`)) return;
    setBulkBusy(true);
    for (const sc of todo) await mark(sc.n, true);
    setBulkBusy(false);
    setMessage(`${todo.length} escena(s) aprobadas.${missing ? ` Faltan ${missing} clip(s).` : ""}`);
  }

  const approved = scenes.filter(s => !dirtyClips.includes(s.n) && checks.some(c => c.clipIndex === s.n - 1 && c.approved && c.referenceSignature === referenceSignature)).length;
  const ordered = scenes.map(s => clips[s.n]).filter((f): f is File => !!f);
  const ready = referencesReady && approved === scenes.length && ordered.length === scenes.length;

  return <div className="review-studio space-y-4">
    <header className="review-studio-heading"><div><p className="studio-eyebrow cinematic-gold">SALA DE REVISIÓN / MONTAJE</p><h3>Cada plano cuenta.</h3><p>Revisa la continuidad, aprueba las tomas y prepara tu entrega.</p></div><div className="review-stats"><span><strong>{approved}/{scenes.length}</strong> aprobadas</span><span><strong>{ordered.length}/{scenes.length}</strong> clips en sesión</span></div></header>
    <details className="review-import"><summary><span>Archivos del episodio</span><span>{Object.keys(images).length} imágenes · {ordered.length} clips</span><strong>Subir y organizar ＋</strong></summary>
    <div className="rounded-2xl border border-white/10 bg-[#151C2B] p-4">
      <div className="flex flex-wrap items-center gap-3"><div><h3 className="font-bold text-white">Mesa de escenas</h3><p className="mt-1 text-xs text-slate-300">{approved}/{scenes.length} aprobadas · {ordered.length}/{scenes.length} clips en esta sesión</p></div><span className="ml-auto rounded-full bg-white/10 px-3 py-1 text-xs text-slate-200">s01 → s{String(scenes.length).padStart(2, "0")}</span></div>
      <label onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); assignAll(e.dataTransfer.files); }}
        className={`mt-3 flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed px-4 py-5 text-center ${dragging ? "border-amber-300 bg-amber-400/15" : "border-amber-400/40 bg-amber-400/[.06]"}`}>
        <b className="text-sm text-amber-100">Subir todo de una vez</b>
        <span className="text-xs text-slate-300">Arrastra aquí los clips y las imágenes del episodio (o haz clic). Cada uno va a su escena por el número del nombre: s01, 001, [003], escena 4, 05_manzanita…</span>
        <input className="sr-only" type="file" accept="video/*,image/*" multiple onChange={e => { assignAll(e.target.files); e.target.value = ""; }} />
      </label>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" disabled={bulkBusy || !referencesReady || !Object.keys(clips).length} onClick={() => { void approveAll(); }} className="rounded-lg bg-emerald-400 px-3 py-2 text-xs font-bold text-slate-950 disabled:opacity-40">{bulkBusy ? "Aprobando…" : "✓ Aprobar todas"}</button>
        <span className="text-[11px] text-slate-400">Aprueba de una vez las escenas con clip. Las que quieras rehacer, márcalas antes con «↻ Rehacer».</span>
      </div>
      {unplaced.length > 0 && <div className="mt-3 space-y-1.5 rounded-xl border border-white/10 bg-black/20 p-3">
        <p className="text-xs font-semibold text-slate-200">Sin escena asignada: elige dónde va cada uno</p>
        {unplaced.map((u, i) => <div key={u.file.name + i} className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded bg-white/10 px-1.5 text-[10px] text-slate-300">{u.kind === "clip" ? "CLIP" : "IMAGEN"}</span>
          <span className="min-w-0 flex-1 truncate text-slate-300">{u.file.name}</span>
          <select aria-label={`Escena para ${u.file.name}`} defaultValue="" onChange={e => placeManually(i, Number(e.target.value))} className="text-xs">
            <option value="" disabled>Escena…</option>
            {scenes.map(sc => <option key={sc.n} value={sc.n}>{String(sc.n).padStart(2, "0")} · {sc.speaker}{(u.kind === "clip" ? clips : images)[sc.n] ? " (reemplaza)" : ""}</option>)}
          </select>
          <button type="button" onClick={() => setUnplaced(prev => prev.filter((_, k) => k !== i))} className="text-slate-400 hover:text-red-300">Descartar</button>
        </div>)}
      </div>}
      <p className="mt-2 text-xs text-slate-400">La revisión se guarda en tu cuenta; los archivos de vídeo se mantienen en esta sesión y tendrás que subirlos de nuevo si cierras la página.</p>
      {!referencesReady && <p className="mt-2 text-xs font-semibold text-amber-200">Aprueba primero todas las fichas maestras del elenco.</p>}
      {message && <p role="status" className="mt-2 text-xs text-amber-200">{message}</p>}
    </div></details>
    <nav className="review-strip" aria-label="Escenas para revisión">{scenes.map(scene => {
      const approvedHere = !dirtyClips.includes(scene.n) && checks.some(c => c.clipIndex === scene.n - 1 && c.approved && c.referenceSignature === referenceSignature);
      return <button type="button" key={scene.n} aria-pressed={activeScene?.n === scene.n} onClick={() => setSelectedScene(scene.n)}><span className="review-strip-picture">{imageUrls[scene.n] ? <img src={imageUrls[scene.n]} alt="" /> : <span>{String(scene.n).padStart(2, "0")}</span>}<small>{clips[scene.n] ? "Clip cargado" : "Sin clip"}</small></span><strong>{String(scene.n).padStart(2, "0")} · {scene.title || scene.speaker}</strong><span className={approvedHere ? "review-state-approved" : "review-state-pending"}>{approvedHere ? "✓ Aprobada" : "Pendiente de revisión"}</span></button>;
    })}</nav>
    <ol className="review-active-list">{scenes.filter(scene => scene.n === activeScene?.n).map(scene => {
      const check = checks.find(c => c.clipIndex === scene.n - 1);
      const sceneApproved = !!check?.approved && check.referenceSignature === referenceSignature && !dirtyClips.includes(scene.n);
      return <li key={scene.n} className="review-scene rounded-2xl border border-white/10 bg-[#151C2B] p-3 sm:p-4">
        <div className="review-scene-layout">
          <div className="review-reference"><p className="studio-eyebrow">IMAGEN DE ESTA ESCENA</p>{imageUrls[scene.n] ? <ReferencePreview src={imageUrls[scene.n]} title={`Escena ${scene.n}`} landscape /> : <p className="stage-inspector-help">Sube una imagen de referencia para revisarla junto al clip.</p>}</div>
          <div className="review-scene-information"><div className="flex flex-wrap items-center gap-2"><b className="text-sm text-white">{String(scene.n).padStart(2, "0")} · {scene.title || scene.setting}</b><span className={`rounded-full px-2 py-0.5 text-[11px] ${sceneApproved ? "bg-emerald-400/15 text-emerald-300" : check?.notes && !dirtyClips.includes(scene.n) ? "bg-rose-400/15 text-rose-200" : "bg-white/10 text-slate-300"}`}>{sceneApproved ? "Aprobado" : check?.referenceSignature && check.referenceSignature !== referenceSignature ? "Revisar con ficha nueva" : check?.notes && !dirtyClips.includes(scene.n) ? "Rehacer" : "Pendiente"}</span></div>
            <p className="mt-1 text-xs text-slate-300">{scene.speaker}: «{scene.line}»</p>
            <div className="mt-2 flex flex-wrap gap-2"><CopyButton text={scene.animationPrompt} label="Copiar prompt" /><CopyButton text={scene.imagePromptFlow} label="Copiar imagen" /></div>
            <p className="mt-2 text-[11px] text-slate-400">Referencias: {(scene.references || []).join(", ") || "—"}</p>
            <details className="review-prompt-details"><summary>Dirección y prompts de esta escena</summary><PromptWorkbench title={`Imagen · Escena ${scene.n}`} prompt={scene.imagePromptFlow || ""} /><PromptWorkbench title={`Animación · Escena ${scene.n}`} prompt={scene.animationPrompt || ""} /></details>
            <div className="mt-1 flex flex-wrap gap-3 text-[11px]">
              {images[scene.n] && <button type="button" onClick={() => dropFile(scene.n, "image")} className="text-slate-400 hover:text-red-300">Quitar imagen</button>}
              {clips[scene.n] && <button type="button" onClick={() => dropFile(scene.n, "clip")} className="text-slate-400 hover:text-red-300">Quitar clip</button>}
              {/* Cambiar (o subir) el archivo de ESTA escena, sin depender del nombre del archivo. */}
              <label className="cursor-pointer text-sky-300 hover:text-sky-200">{clips[scene.n] ? "Cambiar clip" : "Subir clip"}<input type="file" accept="video/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) { place("clip", { [scene.n]: f }); setMessage(`Clip de s${String(scene.n).padStart(2, "0")} cambiado por «${f.name}». Revísalo y apruébalo.`); } e.target.value = ""; }} /></label>
              {clips[scene.n] && scene.n < scenes.length && <button type="button" onClick={() => lastFrame(clipUrls[scene.n], scene.n)} className="text-sky-300 hover:text-sky-200" title="Úsalo como primer fotograma (imagen) de la escena siguiente: así los personajes no cambian">Último fotograma → s{String(scene.n + 1).padStart(2, "0")}</button>}
              <label className="cursor-pointer text-sky-300 hover:text-sky-200">{images[scene.n] ? "Cambiar imagen" : "Subir imagen"}<input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) place("image", { [scene.n]: f }); e.target.value = ""; }} /></label>
              {check && <button type="button" onClick={() => { void deleteReview(scene.n); }} className="text-slate-400 hover:text-red-300">Borrar revisión</button>}
            </div>
          </div>
          <div className="review-media">{clipUrls[scene.n] ? <video src={clipUrls[scene.n]} controls preload="metadata" className="w-full rounded-lg bg-black" /> : <div className="review-player-empty"><span aria-hidden="true">▷</span><strong>El próximo plano está por llegar.</strong><p>Sube el clip s{String(scene.n).padStart(2, "0")} para reproducirlo y revisar su continuidad.</p></div>}
            <div className="mt-2 flex gap-2"><button type="button" disabled={busy === scene.n || !referencesReady || !clips[scene.n]} onClick={() => mark(scene.n, true)} className="rounded-lg bg-emerald-400 px-2 py-1.5 text-xs font-bold text-slate-950 disabled:opacity-40">✓ Aprobado</button><button type="button" disabled={busy === scene.n} onClick={() => mark(scene.n, false)} className="rounded-lg border border-white/15 px-2 py-1.5 text-xs text-slate-100">↻ Rehacer</button></div>
            <input aria-label={`Motivo para rehacer escena ${scene.n}`} value={reasons[scene.n] ?? (check?.approved ? "" : check?.notes || "")} onChange={e => setReasons(prev => ({ ...prev, [scene.n]: e.target.value }))} placeholder="Motivo: cambió la cara…" className="mt-2 w-full text-xs" />
          </div>
        </div>
      </li>;
    })}</ol>
    <section className="review-delivery rounded-2xl border border-amber-400/20 bg-amber-400/[.06] p-4"><p className="studio-eyebrow cinematic-gold">ENTREGA / ÚLTIMA REVISIÓN</p><h3 className="mt-2 font-bold">Montar vídeo final</h3><p className="mt-1 text-xs text-slate-300">Se habilita con fichas maestras y todas las escenas aprobadas, y con todos los clips s01… cargados en orden.</p>
      {ready ? <div className="mt-3"><MontajePanel guion={guion} title={title} filesOverride={ordered} style={style} part={part} musicCues={scenes.map(s => s.music || "")} seconds={Math.round(scenes.length * 4.5) + 3} music={music} cover={cover} recap={recap} onDownloaded={onDownloaded} publish={publish} /></div> : <p className="mt-3 text-sm text-amber-200">Pendiente: {referencesReady ? "" : "fichas maestras; "}{scenes.length - approved} escenas por aprobar; {scenes.length - ordered.length} clips por subir.</p>}
    </section>
  </div>;
}
