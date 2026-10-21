"use client";
import { useState } from "react";
import AiAuthNotice from "./AiAuthNotice";
import { useData } from "@/lib/DataContext";
import { postApi, isAuthError } from "@/lib/api-client";
import { templateViralAnalysis } from "@/lib/llm";

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

  return <section>
    <h2 className="text-xl font-bold">Analizador de virales</h2>
    <p className="text-xs text-slate-400 mt-1">{mode === "supabase" ? "El análisis y su fórmula se guardan en tu cuenta." : "Modo local: se usa una plantilla sin IA y los cambios se guardan en este navegador."}</p>
    <form className="mt-4 space-y-2" onSubmit={e => { e.preventDefault(); void run(); }}>
      <label htmlFor="viral-source" className="field-label block">URL del video (opcional)</label>
      <input id="viral-source" type="url" placeholder="https://…" value={sourceUrl} onChange={e => setSourceUrl(e.target.value)}/>
      <label htmlFor="viral-transcript" className="field-label block">Transcripción del video</label>
      <textarea id="viral-transcript" required className="min-h-[100px]" placeholder="Pega aquí la transcripción…" value={transcript} onChange={e => setTranscript(e.target.value)}/>
      <label htmlFor="viral-notes" className="field-label block">Notas (opcional)</label>
      <textarea id="viral-notes" placeholder="Cuenta, vistas o detalles observados" value={notes} onChange={e => setNotes(e.target.value)}/>
      <button type="submit" disabled={busy} className="mt-2 rounded bg-amber-500 text-black font-bold px-4 py-2">{busy ? "Analizando…" : "Analizar y guardar como fórmula"}</button>
    </form>
    {authError && <AiAuthNotice onLocalTemplate={runLocal}/>}
    {notice && <p role="status" className="text-xs text-emerald-300 mt-2">{notice}</p>}
    {out && <article className="mt-4 rounded-2xl border border-white/10 bg-[#121826] p-4 sm:p-5" aria-label="Resultado del análisis">
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

    <h3 className="font-bold mt-6">🗂️ Análisis guardados</h3>
    <div className="space-y-2 mt-2">
      {[...data.viralAnalyses].reverse().map(a => <div key={a.id} className="rounded bg-[#121826] p-3 text-sm">
        <div className="flex justify-between gap-2"><b>{a.structure?.formulaName || "Análisis viral"}</b><button className="text-slate-400 hover:text-red-300 text-xs shrink-0" onClick={() => { if (window.confirm("¿Eliminar este análisis? La fórmula guardada permanecerá en la biblioteca.")) void remove("viralAnalyses", a.id); }}>Eliminar</button></div>
        <p className="text-xs text-slate-400 mt-1">Gancho: {a.structure?.hook || "—"} · Giro: {a.structure?.twist || "—"} · Cierre: {a.structure?.closing || "—"}</p>
        {a.transcript && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{a.transcript}</p>}
      </div>)}
      {data.viralAnalyses.length === 0 && <p className="text-sm text-slate-400">Sin análisis todavía.</p>}
    </div>
  </section>;
}
