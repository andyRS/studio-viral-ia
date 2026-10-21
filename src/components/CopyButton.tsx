"use client";
import { useState } from "react";
export default function CopyButton({ text, label = "Copiar" }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false);
  async function copy(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500); } catch {}
  }
  return <button type="button" onClick={copy} className={`rounded-lg border px-3 py-1 text-xs font-medium transition ${ok ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-300" : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"}`}>{ok ? "¡Copiado!" : label}</button>;
}
export function DownloadJson({ data, filename = "guion.json" }: { data: any; filename?: string }) {
  function dl() { const b = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = filename; a.click(); }
  return <button type="button" onClick={dl} className="rounded-lg border border-emerald-400/30 bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-500/25">Descargar {filename}</button>;
}
