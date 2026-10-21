"use client";
import { useState } from "react";
import AiAuthNotice from "./AiAuthNotice";
import { useData } from "@/lib/DataContext";
import { postApi, isAuthError } from "@/lib/api-client";
import { templateViralAnalysis } from "@/lib/llm";

export default function ViralAnalyzerModule(){
  const { data, insert, remove, mode } = useData();
  const [transcript, setTranscript] = useState("");
  const [notes, setNotes] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [out, setOut] = useState<any>(null);
  const [authError, setAuthError] = useState(false);
  const [notice, setNotice] = useState("");

  async function persist(structure: any, note: string){
    const formula = await insert("formulas", { name: structure.formulaName, content: JSON.stringify(structure), structure: structure.scenes || [], category: "viral-importada" });
    await insert("viralAnalyses", { transcript, notes, sourceUrl: sourceUrl || undefined, structure, formulaId: formula?.id });
    setOut(structure); setNotice(note);
  }
  async function runLocal(){
    setAuthError(false);
    await persist(templateViralAnalysis({ transcript, notes }), "Analizado con plantilla local en el cliente (sin IA) y guardado como fórmula nueva.");
  }
  async function run(){
    setAuthError(false); setNotice("");
    if (mode !== "supabase") { await runLocal(); return; }
    const r = await postApi("/api/analyze-viral", { transcript, notes, sourceUrl });
    if (isAuthError(r)) { setAuthError(true); return; }
    if (!r.json?.data) { setNotice("Error de la API: " + (r.json?.error || ("HTTP " + r.status))); return; }
    await persist(r.json.data, r.json.mode === "plantilla-local" ? "Analizado con plantilla local del servidor (sin LLM_API_KEY), guardado en Supabase como fórmula nueva." : "Analizado con IA y guardado en Supabase (viral_analyses + formulas).");
  }

  return <section>
    <h2 className="text-xl font-bold">Analizador de virales</h2>
    <p className="text-xs text-slate-500 mt-1">{mode === "supabase" ? "Los análisis se guardan en Supabase (viral_analyses) y la estructura como fórmula nueva (formulas)." : "Modo sin login: análisis con plantilla local, guardado en localStorage."}</p>
    <input className="mt-3" placeholder="URL del video viral (opcional)" value={sourceUrl} onChange={e => setSourceUrl(e.target.value)}/>
    <textarea className="mt-2 min-h-[100px]" placeholder="Pega la transcripción del video viral..." value={transcript} onChange={e => setTranscript(e.target.value)}/>
    <textarea className="mt-2" placeholder="Notas (cuenta, vistas, por qué funcionó...)" value={notes} onChange={e => setNotes(e.target.value)}/>
    <button onClick={run} className="mt-2 rounded bg-amber-500 text-black font-bold px-4 py-2">Analizar y guardar como fórmula</button>
    {authError && <AiAuthNotice onLocalTemplate={runLocal}/>}
    {notice && <p className="text-xs text-emerald-300 mt-2">{notice}</p>}
    {out && <pre className="mt-3 text-xs whitespace-pre-wrap rounded bg-[#121826] p-3">{JSON.stringify(out, null, 2)}</pre>}

    <h3 className="font-bold mt-6">🗂️ Análisis guardados</h3>
    <div className="space-y-2 mt-2">
      {[...data.viralAnalyses].reverse().map(a => <div key={a.id} className="rounded bg-[#121826] p-3 text-sm">
        <div className="flex justify-between gap-2"><b>{a.structure?.formulaName || "Análisis viral"}</b><button className="text-red-400 text-xs shrink-0" onClick={() => remove("viralAnalyses", a.id)}>Eliminar</button></div>
        <p className="text-xs text-slate-400 mt-1">Gancho: {a.structure?.hook || "—"} · Giro: {a.structure?.twist || "—"} · Cierre: {a.structure?.closing || "—"}</p>
        {a.transcript && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{a.transcript}</p>}
      </div>)}
      {data.viralAnalyses.length === 0 && <p className="text-sm text-slate-400">Sin análisis todavía.</p>}
    </div>
  </section>;
}
