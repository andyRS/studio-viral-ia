"use client";
import { useState } from "react";
import AiAuthNotice from "./AiAuthNotice";
import { useData } from "@/lib/DataContext";
import { postApi, isAuthError } from "@/lib/api-client";
import { templateViralAnalysis } from "@/lib/llm";
import WorkspaceIntro, { WorkspaceLoading } from "./WorkspaceIntro";

function readable(value: any): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.length ? value.map(readable).join(" · ") : "Sin datos";
  if (value && typeof value === "object") return Object.entries(value).map(([key, item]) => key + ": " + readable(item)).join(" · ");
  return value == null ? "Sin datos" : String(value);
}

export default function ViralAnalyzerModule(){
  const { data, insert, remove, mode } = useData();
  const [transcript, setTranscript] = useState("");
  const [notes, setNotes] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [out, setOut] = useState<any>(null);
  const [authError, setAuthError] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function persist(structure: any, note: string){
    const formula = await insert("formulas", { name: structure.formulaName, content: JSON.stringify(structure), structure: structure.scenes || [], category: "viral-importada" });
    await insert("viralAnalyses", { transcript, notes, sourceUrl: sourceUrl || undefined, structure, formulaId: formula?.id });
    setOut(structure); setNotice(note);
  }
  async function runLocal(){
    if (!transcript.trim()) { setNotice("Pega una transcripción para analizarla."); return; }
    setBusy(true);
    setAuthError(false);
    try {
      await persist(templateViralAnalysis({ transcript, notes }), mode === "supabase" ? "Análisis creado con plantilla, sin IA. La fórmula se guardó en tu cuenta." : "Análisis creado con plantilla, sin IA. La fórmula se guardó en este navegador.");
    } catch {
      setNotice("No se pudo completar el guardado. Revisa la biblioteca antes de intentarlo de nuevo.");
    } finally { setBusy(false); }
  }
  async function run(){
    if (!transcript.trim()) { setNotice("Pega una transcripción para analizarla."); return; }
    setAuthError(false); setNotice("");
    if (mode !== "supabase") { await runLocal(); return; }
    setBusy(true);
    try {
      const r = await postApi("/api/analyze-viral", { transcript, notes, sourceUrl });
      if (isAuthError(r)) { setAuthError(true); return; }
      if (!r.json?.data) { setNotice("No se pudo analizar el video. Inténtalo de nuevo."); return; }
      await persist(r.json.data, r.json.mode === "plantilla-local" ? "Análisis creado con plantilla, sin IA. La fórmula se guardó en tu cuenta." : "Análisis creado con IA. La fórmula se guardó en tu cuenta.");
    } catch {
      setNotice("No se pudo completar el guardado. Revisa la biblioteca antes de intentarlo de nuevo.");
    } finally { setBusy(false); }
  }

  if (mode === "cargando") return <WorkspaceLoading label="Intelligence Hub / Laboratorio narrativo" />;
  return <section className="growth-workspace analyzer-workspace space-y-6">
    <WorkspaceIntro eyebrow="Intelligence Hub / Laboratorio narrativo" title="Descubre cómo atrapa una historia." description="Del primer segundo al último giro. Descompón una transcripción y convierte su estructura en una fórmula para crear." index="02 / EXPLORAR">
      <a className="studio-secondary-action" href="#analysis-archive">{data.viralAnalyses.length} análisis {data.viralAnalyses.length === 1 ? "guardado" : "guardados"} ↘</a>
      <p className="growth-source">{mode === "supabase" ? "Análisis y fórmulas en tu cuenta" : "Plantilla local sin IA · en este navegador"}</p>
    </WorkspaceIntro>
    <div className="analyzer-layout">
    <form className="analyzer-input space-y-3" onSubmit={e => { e.preventDefault(); void run(); }}>
      <div className="growth-panel-heading"><div><p className="studio-eyebrow">Material de estudio</p><h3 className="mt-1 text-lg font-semibold">La historia bajo la lupa</h3></div><span className="growth-count">01 / ENTRADA</span></div>
      <label htmlFor="viral-source" className="field-label block">URL del video (opcional)</label>
      <input id="viral-source" type="url" placeholder="https://…" value={sourceUrl} onChange={e => setSourceUrl(e.target.value)}/>
      <label htmlFor="viral-transcript" className="field-label block">Transcripción del video</label>
      <textarea id="viral-transcript" required className="min-h-[250px]" placeholder="Pega la historia tal como se cuenta, desde el gancho hasta el cierre…" value={transcript} onChange={e => setTranscript(e.target.value)}/>
      <p className="analyzer-word-count">{transcript.trim() ? transcript.trim().split(/\s+/).length : 0} palabras · {transcript.length} caracteres</p>
      <label htmlFor="viral-notes" className="field-label block">Notas (opcional)</label>
      <textarea id="viral-notes" placeholder="Cuenta, vistas o detalles observados" value={notes} onChange={e => setNotes(e.target.value)}/>
      <button type="submit" disabled={busy} className="mt-2 rounded bg-amber-500 text-black font-bold px-4 py-2">{busy ? "Analizando…" : "Analizar y guardar como fórmula"}</button>
      {busy && <p role="status" className="growth-form-note">Revisando la estructura y preparando su fórmula…</p>}
    </form>
    <aside className="analyzer-guide"><p className="studio-eyebrow">Qué vas a descubrir</p><h3>La arquitectura de la atención.</h3><ol><li><span>01</span><div><h4>El gancho</h4><p>La promesa o pregunta que invita a seguir mirando.</p></div></li><li><span>02</span><div><h4>El giro</h4><p>El momento que cambia lo que esperabas de la historia.</p></div></li><li><span>03</span><div><h4>El cierre</h4><p>La resolución que conecta con la emoción inicial.</p></div></li></ol><div className="analyzer-guide-note"><b>Empieza por el texto.</b><p>La URL identifica la fuente. El análisis utiliza la transcripción que pegas; no descarga ni reproduce el video.</p></div></aside>
    </div>
    {authError && <AiAuthNotice onLocalTemplate={runLocal}/>}
    {notice && <p role="status" className="text-xs text-emerald-300 mt-2">{notice}</p>}
    {out && <article id="analysis-result" className="analyzer-result mt-4 rounded-2xl border border-white/10 bg-[#121826] p-4 sm:p-5" aria-label="Resultado del análisis">
      <p className="field-label">Resumen del análisis</p>
      <h3 className="text-lg font-bold text-white">{out.formulaName || "Nueva fórmula"}</h3>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {([["Gancho", out.hook], ["Giro", out.twist], ["Cierre", out.closing]] as const).map(([label, value]) => <div key={label} className="rounded-xl border border-white/10 bg-black/15 p-3">
          <p className="text-xs font-semibold text-amber-200">{label}</p><p className="mt-1 text-sm text-slate-200">{readable(value)}</p>
        </div>)}
      </div>
      {Array.isArray(out.scenes) && out.scenes.length > 0 && <div className="mt-4">
        <h4 className="text-sm font-semibold text-white">Secuencia de escenas</h4>
        <ol className="mt-2 list-inside list-decimal space-y-1 text-sm text-slate-300">{out.scenes.map((scene: any, index: number) => <li key={index}>{readable(scene)}</li>)}</ol>
      </div>}
      {out.timeJumps && <p className="mt-3 text-sm text-slate-300"><b className="text-white">Saltos de tiempo:</b> {readable(out.timeJumps)}</p>}
      <details className="mt-4 border-t border-white/10 pt-3"><summary className="cursor-pointer text-xs font-semibold text-slate-300">Ver datos completos</summary><pre className="mt-3 max-h-72 overflow-auto rounded-lg bg-black/20 p-3 text-xs">{JSON.stringify(out, null, 2)}</pre></details>
    </article>}

    <div id="analysis-archive" className="growth-panel-heading"><div><p className="studio-eyebrow">Biblioteca de estructuras</p><h3 className="mt-1 text-lg font-semibold">Análisis guardados</h3></div><span className="growth-count">{data.viralAnalyses.length} {data.viralAnalyses.length === 1 ? "estructura" : "estructuras"}</span></div>
    <div className="analyzer-archive">
      {[...data.viralAnalyses].reverse().map((a, index) => <article key={a.id} className="analyzer-saved text-sm">
        <p className="studio-eyebrow">ESTRUCTURA {String(index + 1).padStart(2, "0")}</p>
        <h4 className="mt-3 font-semibold">{a.structure?.formulaName || "Análisis viral"}</h4>
        <p className="text-xs text-slate-300 mt-3">Gancho: {readable(a.structure?.hook || "—")} · Giro: {readable(a.structure?.twist || "—")} · Cierre: {readable(a.structure?.closing || "—")}</p>
        {a.transcript && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{a.transcript}</p>}
        <div className="analyzer-saved-actions"><button type="button" className="studio-text-action" onClick={() => { setOut(a.structure); setNotice("Consulta de un análisis guardado. No se ha generado una fórmula nueva."); requestAnimationFrame(() => document.getElementById("analysis-result")?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })); }}>Explorar estructura ↗</button><button type="button" className="text-slate-400 hover:text-red-300 text-xs" onClick={() => { if (window.confirm("¿Eliminar este análisis? La fórmula guardada permanecerá en la biblioteca.")) void remove("viralAnalyses", a.id); }}>Eliminar</button></div>
      </article>)}
      {data.viralAnalyses.length === 0 && <div className="growth-empty"><span aria-hidden="true">⌕</span><h4>Tu biblioteca empieza con una historia.</h4><p>Pega una transcripción para estudiar su estructura y guardar una fórmula.</p></div>}
    </div>
  </section>;
}
