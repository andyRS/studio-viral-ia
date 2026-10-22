"use client";
import CopyButton from "./CopyButton";
import { BASE_FORMULA, formatAdaptationForCopy, type PlatformAdaptation } from "@/lib/platforms";

export function BaseFormulaCard(){
  return <div className="rounded-xl bg-amber-950/40 border border-amber-700/50 p-4">
    <h3 className="font-bold">⭐ FÓRMULA BASE (Instagram) — se construye primero, siempre</h3>
    <ol className="list-decimal ml-5 text-sm mt-2 space-y-1">{BASE_FORMULA.structure.map((s,i)=><li key={i}>{s}</li>)}</ol>
    <p className="text-xs text-amber-200 mt-2">Regla 4B: de esta base salen 4 versiones distintas. Nunca el mismo archivo ni el mismo texto en todas las plataformas.</p>
    <CopyButton text={BASE_FORMULA.structure.join("\n")}/>
  </div>;
}

export default function PlatformAdaptations({ adaptations }:{ adaptations: PlatformAdaptation[] }){
  if(!adaptations?.length) return null;
  const icons:any = { "Instagram":"📸", "Facebook":"👍", "TikTok":"🎵", "YouTube Shorts":"▶️" };
  return <div>
    <h3 className="font-bold text-lg">4B. Adaptación por plataforma — 4 fichas separadas</h3>
    <p className="text-xs text-slate-400">Cada ficha tiene su duración, montaje, portada, descripción, hashtags, horario, CTA y archivo propio. Copia cada una por separado.</p>
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 mt-3">
      {adaptations.map((a)=>(
        <article key={a.platform} className="rounded-xl bg-[#121826] p-4 border border-slate-800 flex flex-col">
          <h4 className="font-bold">{icons[a.platform]||""} {a.platform}</h4>
          <p className="text-xs mt-2 space-y-1">
            <span className="block"><b>Duración:</b> {a.recommendedDuration}</span>
            <span className="block"><b>Archivo:</b> <code className="break-all">{a.fileName}</code></span>
            <span className="block"><b>Portada:</b> {a.coverText}</span>
            <span className="block"><b>Título:</b> {a.title}</span>
            <span className="block"><b>Descripción:</b> {a.description}</span>
            <span className="block"><b>Hashtags:</b> {a.hashtags.join(" ")}</span>
            <span className="block"><b>Mejor horario:</b> {a.bestTime}</span>
            <span className="block"><b>Frecuencia:</b> {a.frequency}</span>
            <span className="block"><b>CTA:</b> {a.cta}</span>
            {a.pinnedComment && <span className="block"><b>Comentario fijado:</b> {a.pinnedComment}</span>}
            {a.start && <span className="block"><b>Inicio:</b> {a.start}</span>}
            {a.extra && <span className="block"><b>Extra:</b> {a.extra}</span>}
            <span className="block"><b>Métricas:</b> {a.metricsToWatch.join(", ")}</span>
          </p>
          <div className="text-xs mt-2"><b>Cambios de montaje:</b><ul className="list-disc ml-4 mt-1 space-y-1">{a.editingChanges.map((c,i)=><li key={i}>{c}</li>)}</ul></div>
          <div className="text-xs mt-2"><b>Checklist:</b><ul className="list-disc ml-4 mt-1 space-y-1">{a.checklist.map((c,i)=><li key={i}>{c}</li>)}</ul></div>
          <div className="mt-auto pt-3"><CopyButton text={formatAdaptationForCopy(a)} label={`Copiar ficha ${a.platform}`}/></div>
        </article>
      ))}
    </div>
  </div>;
}
