"use client";
// Fase 5 del proyecto largo: montaje por actos en 16:9 (con clips verticales), unir los actos, publicación
// (títulos, descripción con capítulos, miniaturas, clips y plan al calendario) y evaluación narrativa.
import { useMemo, useState } from "react";
import MontajePanel, { PC_URL } from "@/components/MontajePanel";
import CopyButton from "@/components/CopyButton";
import { useData } from "@/lib/DataContext";
import { capitulos, CRITERIOS, escenaPorId, guionDeActo, notaMedia, tomasDelActo } from "@/lib/distribucion";
import { allScenes, type Outline } from "@/lib/outline";
import { perfilActivo, duracionClip } from "@/lib/tomas";

type Base = { outline: Outline; guardar: (o: Outline) => Promise<void>; busy: boolean; series: any };
type ConIA = Base & { ia: (body: any) => Promise<any>; run: (label: string, fn: () => Promise<void>) => Promise<void> };

// ---------- Montaje por actos ----------
export function MontajeLargo({ outline, series, style, characters }: Base & { style: string; characters: any[] }) {
  const [acto, setActo] = useState(0);
  const [gancho, setGancho] = useState<[string, string]>(["", ""]);
  const [cierre, setCierre] = useState("FIN");
  const [verOrden, setVerOrden] = useState(false);
  const p = perfilActivo(outline);
  if (!outline.acts.length) return <p className="text-sm text-slate-400">Primero crea la estructura, escribe los guiones y divide las escenas en tomas.</p>;
  const { lista, sinTomas } = tomasDelActo(outline, acto);
  const titulosClips = Object.fromEntries((outline.distribucion?.clips || []).map(c => [c.sceneId, c.titulo]));
  const titulo = outline.distribucion?.titulos?.[0] || series.title;
  const guion = guionDeActo(outline, acto, { titulo: series.title, characters, gancho, cierre, titulosClips });
  const seg = lista.reduce((a, x) => a + duracionClip(x.toma.duracion, p), 0);
  const ultimo = acto === outline.acts.length - 1;
  return <div className="space-y-3 text-xs">
    <p className="text-slate-400">El proyecto se monta <b>acto por acto</b> en tu PC (16:9 para Facebook y YouTube, hasta 80 tomas por acto) y al final se unen los actos. Cada acto saca además sus <b>clips verticales</b> para TikTok y Reels (las escenas de más tensión, con el título arriba).</p>
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-slate-300">Acto<select value={acto} onChange={e => setActo(Number(e.target.value))} className="mt-1 w-auto">{outline.acts.map((a, i) => <option key={a.id} value={i}>{i + 1}. {a.title}</option>)}</select></label>
      <span className="pb-2 text-slate-400">{lista.length} tomas · {Math.floor(seg / 60)}:{String(Math.round(seg % 60)).padStart(2, "0")} min · {guion.recortes?.length || 0} clips verticales{guion.tarjetas?.length ? ` · ${guion.tarjetas.length} saltos de tiempo` : ""}</span>
    </div>
    {!!sinTomas.length && <p className="rounded-lg border border-amber-400/25 bg-amber-400/[.06] p-2 text-amber-100">Escenas de este acto sin tomas (no entrarían en el montaje): {sinTomas.map(s => s.heading).join(" · ")}. Divídelas en «Tomas y storyboard».</p>}
    {lista.length > 80 && <p className="rounded-lg border border-rose-400/30 p-2 text-rose-200">Este acto tiene {lista.length} tomas y el montaje admite 80: divide el acto en dos o junta tomas.</p>}
    {acto === 0 && <div className="grid gap-2 sm:grid-cols-2">
      <label className="text-slate-300">Gancho, línea 1 (primeros 3 s)<input value={gancho[0]} onChange={e => setGancho([e.target.value, gancho[1]])} placeholder="Veintiún días sin respuesta" className="mt-1 py-1" /></label>
      <label className="text-slate-300">Gancho, línea 2<input value={gancho[1]} onChange={e => setGancho([gancho[0], e.target.value])} placeholder="y en el cielo había una guerra" className="mt-1 py-1" /></label>
    </div>}
    {ultimo && <label className="block text-slate-300">Tarjeta final<input value={cierre} onChange={e => setCierre(e.target.value)} className="mt-1 py-1" /></label>}
    <button type="button" onClick={() => setVerOrden(!verOrden)} className="text-sky-300 underline">{verOrden ? "Ocultar" : "Ver"} el orden de los clips para subirlos</button>
    {verOrden && <ol className="max-h-64 list-decimal space-y-0.5 overflow-auto rounded-lg border border-white/10 p-2 pl-8 text-slate-300">{lista.map(({ toma, escena }, i) =>
      <li key={toma.id}><span className="text-slate-500">{escena.heading} ·</span> {toma.dialogo ? `${toma.dialogo.speaker}: «${toma.dialogo.text.slice(0, 60)}»` : toma.accion.slice(0, 70)} <span className="text-slate-500">({duracionClip(toma.duracion, p)} s · {toma.estado})</span></li>)}</ol>}
    {lista.length > 0 && lista.length <= 80 && <MontajePanel key={`acto-${acto}`} guion={guion} title={`${series.title} · Acto ${acto + 1}`} style={style} part={acto + 1}
      cover={acto === 0 ? { serie: series.title, frase: [titulo] } : undefined} />}
    <UnirActos n={outline.acts.length} />
  </div>;
}

function UnirActos({ n }: { n: number }) {
  const [files, setFiles] = useState<File[]>([]);
  const [estado, setEstado] = useState("");
  if (n < 2) return null;
  const unir = async () => {
    setEstado("Uniendo los actos en tu PC…");
    try {
      const fd = new FormData(); for (const f of files) fd.append("partes", f, f.name);
      const r = await fetch(`${PC_URL}/unir`, { method: "POST", headers: { "X-Montaje-Local": "1" }, body: fd });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.detail || `HTTP ${r.status}`); }
      const u = URL.createObjectURL(await r.blob()); const a = document.createElement("a"); a.href = u; a.download = "pelicula-completa.mp4"; a.click(); setTimeout(() => URL.revokeObjectURL(u), 60000);
      setEstado("Listo: película completa descargada.");
    } catch (e: any) { setEstado(`No se pudieron unir: ${e?.message || e}. ¿Está abierto «Montar en mi PC» y actualizado (git pull)?`); }
  };
  return <div className="rounded-xl border border-white/10 p-3">
    <p className="font-semibold text-slate-200">Unir los actos en la película completa</p>
    <p className="mt-0.5 text-slate-400">Cuando tengas los {n} actos montados, súbelos aquí en orden (se unen sin perder calidad, en tu PC).</p>
    <input type="file" accept="video/mp4" multiple onChange={e => setFiles(Array.from(e.target.files || []).sort((a, b) => a.name.localeCompare(b.name, "es", { numeric: true })))} className="mt-2 text-xs" />
    {!!files.length && <ol className="mt-1 list-decimal pl-5 text-slate-300">{files.map(f => <li key={f.name}>{f.name}</li>)}</ol>}
    <button type="button" disabled={files.length < 2 || estado.startsWith("Uniendo")} onClick={unir} className="mt-2 rounded-lg bg-emerald-500 px-3 py-2 font-bold text-black disabled:opacity-50">Unir {files.length || ""} actos</button>
    {estado && <p role="status" className="mt-1 text-slate-300">{estado}</p>}
  </div>;
}

// ---------- Publicación ----------
const RED_A_PLATAFORMA: Record<string, string> = { youtube: "YouTube", facebook: "Facebook", tiktok: "TikTok", instagram: "Instagram", "youtube shorts": "YouTube Shorts", reels: "Instagram", shorts: "YouTube Shorts" };
export function PublicacionPanel({ outline, guardar, busy, series, ia, run }: ConIA) {
  const { data, insert } = useData();
  const d = outline.distribucion;
  const [inicio, setInicio] = useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  const [msg, setMsg] = useState("");
  const caps = useMemo(() => capitulos(outline), [outline]);
  const perfilCuenta = (data.accountProfiles || []).find((p: any) => p.accountId === series.accountId);
  const cuentas = [series.accountId, ...(series.clipAccountIds || [])].map((id: string) => data.accounts.find((a: any) => a.id === id)).filter(Boolean);
  const generar = () => run("Preparando la publicación…", async () => {
    const r = await ia({ action: "distribucion", outline, perfilCuenta });
    await guardar({ ...outline, distribucion: r });
  });
  const descripcion = d ? `${d.descripcion}\n\n${caps.join("\n")}${d.etiquetas.length ? `\n\n${d.etiquetas.slice(0, 5).map(t => `#${t.replace(/\s+/g, "")}`).join(" ")}` : ""}` : "";
  const alCalendario = async () => {
    if (!d) return;
    let n = 0;
    for (const p of d.plan) {
      const plat = RED_A_PLATAFORMA[p.red.toLowerCase()] || p.red;
      const cuenta = cuentas.find((a: any) => a.platform === plat) || cuentas.find((a: any) => a.platform.startsWith(plat.split(" ")[0])) || cuentas[0];
      const fecha = new Date(`${inicio}T12:00:00`); fecha.setDate(fecha.getDate() + p.dia);
      await insert("calendarEntries", { accountId: cuenta?.id, date: fecha.toISOString().slice(0, 10), title: `${p.pieza} · ${series.title}`, platform: plat });
      n++;
    }
    setMsg(`${n} publicaciones añadidas al calendario de Publish & Grow.`);
  };
  return <div className="space-y-3 text-xs">
    <button type="button" disabled={busy || !outline.acts.length} onClick={generar} className="rounded-lg bg-teal-700 px-3 py-2 font-bold text-white disabled:opacity-50">{d ? "Volver a proponer (IA)" : "Proponer títulos, descripción, miniaturas y clips (IA)"}</button>
    {perfilCuenta ? <p className="text-slate-400">Respeta las reglas de @{perfilCuenta.handle} (sin «comenta», «dale like» ni «comparte» si la cuenta lo prohíbe).</p> : <p className="text-amber-200">La serie no tiene cuenta con perfil: las propuestas serán genéricas. Ánclala a un canal con perfil en Publish & Grow → Cuentas.</p>}
    {d && <>
      <Bloque titulo="Títulos para YouTube y Facebook">{d.titulos.map((t, i) => <div key={i} className="flex items-center gap-2"><span className="flex-1 text-slate-200">{t} <span className="text-slate-500">({t.length})</span></span><CopyButton text={t} label="Copiar" /></div>)}</Bloque>
      <Bloque titulo="Descripción con capítulos" extra={<CopyButton text={descripcion} label="Copiar" />}>
        <pre className="whitespace-pre-wrap text-slate-300">{descripcion}</pre>
        <p className="mt-1 text-slate-500">Los tiempos de los capítulos son aproximados (salen de las tomas): revísalos con el vídeo montado antes de publicar.</p>
      </Bloque>
      {!!d.etiquetas.length && <Bloque titulo="Etiquetas" extra={<CopyButton text={d.etiquetas.join(", ")} label="Copiar" />}><p className="text-sky-200">{d.etiquetas.join(", ")}</p></Bloque>}
      <Bloque titulo="Miniaturas (propuestas)">{d.miniaturas.map((m, i) => <p key={i} className="text-slate-300"><b className="text-amber-200">«{m.texto}»</b> — {m.concepto}</p>)}
        <p className="mt-1 text-slate-500">El montaje del primer acto ya saca una miniatura 1280x720 con el primer título; elige aquí otra idea si te gusta más.</p></Bloque>
      <Bloque titulo="Tráiler">{d.trailer.texto && <p className="text-slate-200">Narrador: «{d.trailer.texto}»</p>}<ol className="list-decimal pl-5 text-slate-400">{d.trailer.sceneIds.map(id => <li key={id}>{escenaPorId(outline, id)?.heading}</li>)}</ol></Bloque>
      <Bloque titulo={`Clips para TikTok y Reels (${d.clips.length})`}>{d.clips.map(c => <div key={c.sceneId} className="border-t border-white/5 py-1.5 first:border-0">
        <p className="text-slate-200"><b>{c.titulo}</b> <span className="text-slate-500">· {escenaPorId(outline, c.sceneId)?.heading}</span></p>
        <p className="text-slate-400">{c.texto} <span className="text-sky-200">{c.hashtags}</span></p>
        <CopyButton text={`${c.texto}\n\n${c.hashtags}`} label="Copiar texto" /></div>)}
        <p className="mt-1 text-slate-500">Estos títulos van arriba en los clips verticales que saca el montaje de cada acto.</p></Bloque>
      {d.cta && <Bloque titulo="Llamada a la acción"><p className="text-slate-200">{d.cta}</p></Bloque>}
      <Bloque titulo="Plan de publicación">
        <ul className="space-y-0.5 text-slate-300">{d.plan.map((p, i) => <li key={i}><b>Día {p.dia + 1}</b> · {p.red}: {p.pieza}</li>)}</ul>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="text-slate-300">Empieza el<input type="date" value={inicio} onChange={e => setInicio(e.target.value)} className="mt-1 w-auto py-1" /></label>
          <button type="button" disabled={busy || !d.plan.length} onClick={() => run("Añadiendo al calendario…", alCalendario)} className="rounded-lg bg-emerald-500 px-3 py-2 font-bold text-black disabled:opacity-50">Enviar al calendario</button>
        </div>
        {msg && <p role="status" className="mt-1 text-emerald-200">{msg}</p>}
      </Bloque>
    </>}
  </div>;
}

function Bloque({ titulo, extra, children }: { titulo: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return <section className="rounded-xl border border-white/10 p-3"><div className="mb-1 flex items-center gap-2"><b className="text-slate-200">{titulo}</b><span className="ml-auto">{extra}</span></div>{children}</section>;
}

// ---------- Evaluación narrativa ----------
export function EvaluacionPanel({ outline, guardar, busy, series, ia, run }: ConIA) {
  const { data } = useData();
  const e = outline.evaluacion;
  const media = notaMedia(e);
  const evaluar = () => run("Evaluando el guion…", async () => {
    const r = await ia({ action: "evaluar", outline, criterios: CRITERIOS });
    await guardar({ ...outline, evaluacion: r });
  });
  // Datos observados de la cuenta (métricas importadas): solo para comparar, separados de la evaluación.
  const obs = useMemo(() => {
    const ms = (data.metrics || []).filter((m: any) => m.accountId && m.accountId === series.accountId);
    if (!ms.length) return null;
    const avg = (k: string) => Math.round(ms.reduce((a: number, m: any) => a + (Number(m[k]) || 0), 0) / ms.length);
    return { n: ms.length, vistas: avg("views"), retencion: avg("retention"), mejor: ms.slice().sort((a: any, b: any) => b.views - a.views)[0] };
  }, [data.metrics, series.accountId]);
  const sinGuion = allScenes(outline).filter(s => !s.script?.length).length;
  return <div className="space-y-3 text-xs">
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={busy || !outline.acts.length} onClick={evaluar} className="rounded-lg bg-teal-700 px-3 py-2 font-bold text-white disabled:opacity-50">{e ? "Volver a evaluar (IA)" : "Evaluar el guion (IA)"}</button>
      {sinGuion > 0 && <span className="text-amber-200">{sinGuion} escena(s) sin guion: la evaluación será más pobre.</span>}
    </div>
    <p className="text-slate-400">Puntuaciones de <b>revisión creativa</b> (0-100) para saber qué mejorar. <b>No son una predicción</b> de vistas ni de rendimiento.</p>
    {e && <>
      <div className="flex items-baseline gap-2"><span className="text-3xl font-black text-slate-100">{media}</span><span className="text-slate-400">de 100 · media de la rúbrica · {new Date(e.at).toLocaleDateString("es-DO")}</span></div>
      {e.resumen && <p className="rounded-lg bg-white/5 p-2 text-slate-200">{e.resumen}</p>}
      <ul className="space-y-2">{CRITERIOS.map(([id, label]) => { const c = e.criterios.find(x => x.id === id); if (!c) return null;
        return <li key={id} className="rounded-lg border border-white/10 p-2">
          <div className="flex items-center gap-2"><b className="text-slate-200">{label}</b><span className="ml-auto font-bold text-slate-100">{c.nota}</span></div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/5"><div style={{ width: `${c.nota}%` }} className={c.nota >= 75 ? "h-full bg-emerald-500" : c.nota >= 55 ? "h-full bg-amber-500" : "h-full bg-rose-500"} /></div>
          <p className="mt-1 text-slate-400">{c.porque}</p>
          {c.mejora && <p className="mt-0.5 text-sky-200">Mejora: {c.mejora}</p>}
        </li>; })}</ul>
    </>}
    <section className="rounded-xl border border-white/10 p-3">
      <b className="text-slate-200">Datos observados de la cuenta</b>
      {obs ? <p className="mt-1 text-slate-300">{obs.n} publicaciones medidas: media de {obs.vistas.toLocaleString("es-DO")} vistas{obs.retencion ? ` y ${obs.retencion} % de retención` : ""}. La mejor: «{obs.mejor.episodeTitle}» con {Number(obs.mejor.views).toLocaleString("es-DO")} vistas. <span className="text-slate-500">(Datos reales importados; la rúbrica de arriba es una opinión.)</span></p>
        : <p className="mt-1 text-slate-500">Aún no hay métricas importadas de la cuenta de esta serie. Cuando las haya, salen aquí para comparar con lo publicado.</p>}
    </section>
  </div>;
}
