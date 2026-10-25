"use client";
// Herramientas del PC: comprimir, mejorar la calidad y quitar marcas de agua de cualquier vídeo.
// Todo corre en el montaje de este PC («Montar en mi PC»): el vídeo no sale a internet y no hay límite de tamaño.
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import LogoPicker, { FRUTI, defaultLogo, logoFile, rememberLogo } from "./LogoPicker";

const PC_URL = "http://127.0.0.1:8765";
type Zona = { x: number; y: number; w: number; h: number };

const CALIDADES = [
  { id: "revisar", label: "Para revisar", desc: "540p · unos 10-15 MB por minuto. Para mandarlo al chat o por WhatsApp." },
  { id: "ligero", label: "Lo más ligero", desc: "360p · si «Para revisar» aún pesa mucho." },
  { id: "redes", label: "Calidad para redes", desc: "1080p · se ve igual de bien y pesa menos que el original." },
  { id: "mejorar", label: "Mejorar calidad", desc: "Sube a 1080p con escalado fino, quita ruido y da nitidez. Ideal para clips de 720p antes de publicar." },
];
const METODOS = [
  { id: "tapar", label: "Tapar con un logo (recomendado)", desc: "Borra la marca y pone encima el logo de tu página (FrutiEnganchados, Un Minuto en Oración…), del tamaño justo para que no se vea nada." },
  { id: "borrar", label: "Borrar", desc: "Rellena la zona con lo que la rodea. Sin logo encima se nota una mancha borrosa." },
  { id: "difuminar", label: "Difuminar", desc: "Desenfoca la zona (como online-video-cutter)." },
  { id: "recortar", label: "Recortar", desc: "Corta la franja del borde con el logo y vuelve al tamaño original (zoom suave)." },
];

const mb = (b: number) => `${(b / 1048576).toFixed(1)} MB`;

// Sube el vídeo al montaje del PC y devuelve el resultado (con progreso de subida).
function enviar(path: string, fd: FormData, onPct: (p: number) => void) {
  return new Promise<Blob>((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("POST", PC_URL + path); x.setRequestHeader("X-Montaje-Local", "1"); x.responseType = "blob";
    x.upload.onprogress = e => { if (e.lengthComputable) onPct(Math.round((e.loaded / e.total) * 100)); };
    x.onload = async () => {
      if (x.status === 200) return resolve(x.response);
      let msg = `HTTP ${x.status}`; try { msg = JSON.parse(await (x.response as Blob).text()).detail || msg; } catch {}
      reject(new Error(msg));
    };
    x.onerror = () => reject(new Error("se cortó la conexión con el montaje del PC. ¿Sigue abierta la ventana «Montar en mi PC»?"));
    x.send(fd);
  });
}

function descargar(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function useTrabajo() {
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [msg, setMsg] = useState("");
  const [secs, setSecs] = useState(0);
  useEffect(() => { if (!busy) return; const t0 = Date.now(); const t = setInterval(() => setSecs(Math.round((Date.now() - t0) / 1000)), 1000); return () => clearInterval(t); }, [busy]);
  async function run(path: string, fd: FormData, file: File, suffix: string) {
    setBusy(true); setPct(0); setSecs(0); setMsg("Subiendo al montaje del PC…");
    try {
      const blob = await enviar(path, fd, p => { setPct(p); if (p >= 100) setMsg("Procesando con la GPU de tu PC…"); });
      descargar(blob, `${file.name.replace(/\.[^.]+$/, "")}-${suffix}.mp4`);
      setMsg(`✓ Listo: ${mb(file.size)} → ${mb(blob.size)}. Se descargó solo.`);
    } catch (e: any) { setMsg("No se pudo: " + (e?.message || e)); }
    finally { setBusy(false); }
  }
  return { busy, pct, msg, secs, run };
}

function Estado({ t }: { t: ReturnType<typeof useTrabajo> }) {
  if (!t.busy && !t.msg) return null;
  return <div role="status" aria-live="polite" className="mt-3 text-xs text-slate-200">
    {t.busy && <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#FF9F1C] transition-[width]" style={{ width: `${t.pct < 100 ? t.pct : 100}%` }} /></div>}
    {t.msg}{t.busy && t.pct >= 100 ? ` (${t.secs} s)` : ""}
  </div>;
}

function FilePick({ file, onFile, disabled }: { file: File | null; onFile: (f: File | null) => void; disabled: boolean }) {
  const [over, setOver] = useState(false);
  return <label onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
    onDrop={e => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
    className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-6 text-center text-sm transition ${over ? "border-[#FF9F1C] bg-[#FF9F1C]/[.07]" : "border-white/20 hover:border-white/35"}`}>
    <input type="file" accept="video/*" className="sr-only" disabled={disabled} onChange={e => onFile(e.target.files?.[0] || null)} />
    <b className="text-slate-100">{file ? file.name : "Arrastra aquí el vídeo"}</b>
    <span className="text-xs text-slate-400">{file ? mb(file.size) : "o haz clic para elegirlo"}</span>
  </label>;
}

function Comprimir({ disabled }: { disabled: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [q, setQ] = useState("revisar");
  const t = useTrabajo();
  return <section className="studio-panel p-5">
    <h3 className="text-lg font-semibold">Comprimir o mejorar la calidad</h3>
    <p className="mt-1 text-sm text-slate-400">Para mandar un episodio a revisar, por WhatsApp, o subir un clip de 720p a 1080p antes de publicar.</p>
    <div className="mt-4"><FilePick file={file} onFile={setFile} disabled={t.busy} /></div>
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      {CALIDADES.map(c => <label key={c.id} className={`flex cursor-pointer gap-2 rounded-xl border p-3 text-sm ${q === c.id ? "border-[#598BFF] bg-[#598BFF]/10" : "border-white/10"}`}>
        <input type="radio" name="calidad" className="mt-1 w-auto" checked={q === c.id} onChange={() => setQ(c.id)} disabled={t.busy} />
        <span><b>{c.label}</b><span className="block text-xs text-slate-400">{c.desc}</span></span>
      </label>)}
    </div>
    <button type="button" disabled={disabled || !file || t.busy} onClick={() => { const fd = new FormData(); fd.append("video", file!); t.run(`/comprimir?calidad=${q}`, fd, file!, q); }}
      className="mt-4 w-full rounded-xl bg-[#FF9F1C] px-4 py-2.5 text-sm font-bold text-[#090D16] disabled:opacity-50">{t.busy ? "Procesando…" : q === "mejorar" ? "Mejorar calidad" : "Comprimir"}</button>
    <Estado t={t} />
  </section>;
}

function QuitarMarca({ disabled }: { disabled: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [dim, setDim] = useState<{ w: number; h: number } | null>(null);
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [draft, setDraft] = useState<Zona | null>(null);
  const [metodo, setMetodo] = useState("tapar");
  const [logo, setLogo] = useState(FRUTI);
  useEffect(() => { defaultLogo("herramientas").then(setLogo); }, []);
  const box = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const vref = useRef<HTMLVideoElement>(null);
  const [dur, setDur] = useState(0); const [pos, setPos] = useState(1);
  const t = useTrabajo();

  useEffect(() => {
    if (!file) { setUrl(""); return; }
    const u = URL.createObjectURL(file); setUrl(u); setZonas([]); setDim(null);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  // Coordenadas del puntero en píxeles REALES del vídeo (no de la pantalla).
  function punto(e: RPointerEvent) {
    const r = box.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * (dim?.w || 1), y: ((e.clientY - r.top) / r.height) * (dim?.h || 1) };
  }
  const norm = (a: { x: number; y: number }, b: { x: number; y: number }): Zona => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });
  const pct = (z: Zona) => ({ left: `${(z.x / dim!.w) * 100}%`, top: `${(z.y / dim!.h) * 100}%`, width: `${(z.w / dim!.w) * 100}%`, height: `${(z.h / dim!.h) * 100}%` });

  return <section className="studio-panel p-5">
    <h3 className="text-lg font-semibold">Quitar marca de agua</h3>
    <p className="mt-1 text-sm text-slate-400">Elige el vídeo, pausa donde se vea el logo y dibuja un recuadro encima (puedes marcar varios). El vídeo sale completo, con la misma calidad y el mismo audio.</p>
    <div className="mt-4"><FilePick file={file} onFile={setFile} disabled={t.busy} /></div>
    {url && <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,320px)_1fr]">
      <div>
        <div ref={box} className="relative mx-auto w-full max-w-[320px] touch-none select-none overflow-hidden rounded-xl bg-black"
          style={dim ? { aspectRatio: `${dim.w} / ${dim.h}` } : undefined}
          onPointerDown={e => { if (!dim || t.busy) return; (e.target as Element).setPointerCapture?.(e.pointerId); start.current = punto(e); setDraft(null); }}
          onPointerMove={e => { if (start.current) setDraft(norm(start.current, punto(e))); }}
          onPointerUp={e => { if (start.current) { const z = norm(start.current, punto(e)); start.current = null; setDraft(null); if (z.w > 6 && z.h > 6) setZonas(zs => [...zs, z].slice(0, 6)); } }}>
          <video ref={vref} src={url} className="pointer-events-none h-full w-full object-contain" muted playsInline preload="metadata"
            onLoadedMetadata={e => { const v = e.currentTarget; setDim({ w: v.videoWidth, h: v.videoHeight }); setDur(v.duration || 0); const p = Math.min(1, (v.duration || 0) / 2); setPos(p); v.currentTime = p; }} />
          {dim && zonas.map((z, i) => <div key={i} className="pointer-events-none absolute border-2 border-[#FF9F1C] bg-[#FF9F1C]/20" style={pct(z)} />)}
          {dim && draft && <div className="pointer-events-none absolute border-2 border-dashed border-white bg-white/10" style={pct(draft)} />}
        </div>
        {dur > 0 && <label className="mx-auto mt-2 block max-w-[320px] text-[11px] text-slate-400">Buscar el momento del logo: {pos.toFixed(1)} s
          <input type="range" min={0} max={dur} step={0.1} value={pos} className="w-full" onChange={e => { const p = Number(e.target.value); setPos(p); if (vref.current) vref.current.currentTime = p; }} />
        </label>}
      </div>
      <div className="space-y-3">
        <p className="text-sm text-slate-300">{zonas.length ? `${zonas.length} ${zonas.length === 1 ? "zona marcada" : "zonas marcadas"}` : "Dibuja un recuadro sobre el logo arrastrando encima del vídeo."}
          {zonas.length > 0 && <button type="button" onClick={() => setZonas([])} disabled={t.busy} className="ml-2 text-xs text-slate-400 underline hover:text-rose-300">Borrar zonas</button>}</p>
        <div className="grid gap-2">
          {METODOS.map(m => <label key={m.id} className={`flex cursor-pointer gap-2 rounded-xl border p-3 text-sm ${metodo === m.id ? "border-[#598BFF] bg-[#598BFF]/10" : "border-white/10"}`}>
            <input type="radio" name="metodo" className="mt-1 w-auto" checked={metodo === m.id} onChange={() => setMetodo(m.id)} disabled={t.busy} />
            <span><b>{m.label}</b><span className="block text-xs text-slate-400">{m.desc}</span></span>
          </label>)}
        </div>
        {metodo === "tapar" && <div className="rounded-xl border border-white/10 p-3"><p className="mb-2 text-xs font-semibold text-slate-300">Logo que tapa la marca</p><LogoPicker value={logo} onChange={id => { setLogo(id); rememberLogo("herramientas", id); }} disabled={t.busy} /></div>}
        <button type="button" disabled={disabled || !zonas.length || t.busy}
          onClick={async () => { const fd = new FormData(); fd.append("video", file!); fd.append("zonas", JSON.stringify(zonas.map(z => ({ x: Math.round(z.x), y: Math.round(z.y), w: Math.round(z.w), h: Math.round(z.h) })))); fd.append("metodo", metodo); const lf = metodo === "tapar" ? await logoFile(logo) : null; if (lf) fd.append("logo", lf); t.run("/quitar-marca", fd, file!, "sin-marca"); }}
          className="w-full rounded-xl bg-[#FF9F1C] px-4 py-2.5 text-sm font-bold text-[#090D16] disabled:opacity-50">{t.busy ? "Procesando…" : "Quitar marca"}</button>
        <Estado t={t} />
      </div>
    </div>}
  </section>;
}

export default function ToolsModule() {
  const [caps, setCaps] = useState<any>(undefined);
  async function check() {
    setCaps(undefined);
    const c = await fetch(`${PC_URL}/salud`, { signal: AbortSignal.timeout(4000) }).then(r => r.json()).catch(() => null);
    setCaps(c);
  }
  useEffect(() => { check(); }, []);
  const ready = !!caps?.comprimir && !!caps?.quitar_marca && !!caps?.logo_propio;
  return <div className="space-y-5">
    <section className="studio-panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Herramientas del PC</h2>
          <p className="mt-1 text-sm text-slate-400">Usan el montaje de tu PC y su tarjeta gráfica: el vídeo no sale a internet y no hay límite de tamaño.</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${ready ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-amber-400/30 bg-amber-400/10 text-amber-200"}`}>
          {caps === undefined ? "Comprobando el PC…" : ready ? `PC conectado${caps.gpu ? ` · ${caps.gpu}` : ""}` : caps ? "PC desactualizado" : "PC sin conectar"}
        </span>
      </div>
      {caps !== undefined && !ready && <div className="mt-3 rounded-xl border border-amber-400/25 bg-amber-400/[.06] p-3 text-xs leading-relaxed text-amber-100">
        {caps ? <>El montaje de tu PC es de una versión anterior. En la carpeta del proyecto ejecuta <code>git pull</code>, cierra la ventana «Montar en mi PC» y ábrela de nuevo.</>
          : <>Abre <b>«Montar en mi PC»</b> (<code>C:\tmp\Estudio Viral IA\montaje\local\Montar en mi PC.bat</code>) y deja la ventana abierta.</>}
        <button type="button" onClick={check} className="ml-2 font-semibold underline">Volver a comprobar</button>
      </div>}
    </section>
    <Comprimir disabled={!ready} />
    <QuitarMarca disabled={!ready} />
  </div>;
}
