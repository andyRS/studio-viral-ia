"use client";
import { useState } from "react";
import { postApi, isAuthError } from "@/lib/api-client";
import { templateHookVariants, type HookVariant } from "@/lib/hooks";

// Paso previo a generar: la IA propone 5 ganchos y el usuario elige el más fuerte.
export default function HookPicker({ body, online, chosen, onChoose }: {
  body: () => any; online: boolean; chosen: string[] | null; onChoose: (lines: string[] | null) => void;
}) {
  const [variants, setVariants] = useState<HookVariant[]>([]);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState("");

  async function propose() {
    setLoading(true); setNote("");
    try {
      const b = body();
      if (!online) { setVariants(templateHookVariants(b)); setNote("Modo local: ganchos de plantilla. Inicia sesión para que la IA los escriba."); return; }
      const r = await postApi("/api/hooks", b);
      if (isAuthError(r)) { setVariants(templateHookVariants(b)); setNote("Inicia sesión para que la IA proponga los ganchos. Mientras, tienes estos de plantilla."); return; }
      if (!r.json?.ok) { setNote("Error de la IA: " + (r.json?.error || "HTTP " + r.status)); return; }
      setVariants(r.json.data.variants || []);
      if (r.json.data.mode === "plantilla-local") setNote("El servidor no tiene clave de IA: ganchos de plantilla.");
    } finally { setLoading(false); }
  }

  const same = (l: string[]) => !!chosen && chosen.join("|") === l.join("|");

  return (
    <div className="rounded-xl border border-amber-400/20 bg-amber-400/[.04] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold">🎣 Gancho de los primeros 3 s</p>
        <button type="button" disabled={loading} onClick={propose} className="ml-auto rounded border border-amber-400/40 px-3 py-1.5 text-xs font-bold text-amber-200 hover:bg-amber-400/10">
          {loading ? "Pensando ganchos…" : variants.length ? "Proponer otros 5" : "Proponer 5 ganchos"}
        </button>
      </div>
      {!variants.length && <p className="mt-1 text-xs text-slate-400">Opcional: elige el gancho antes de generar. Si no eliges, la IA decide.</p>}
      {note && <p className="mt-2 text-xs text-amber-200/80">{note}</p>}
      {!!variants.length && <div className="mt-3 space-y-2">
        {variants.map((v, i) => (
          <button type="button" key={i} onClick={() => onChoose(same(v.lines) ? null : v.lines)}
            className={`block w-full rounded-lg border px-3 py-2 text-left ${same(v.lines) ? "border-amber-400 bg-amber-400/15" : "border-white/10 bg-white/[.03] hover:bg-white/[.06]"}`}>
            <span className="block text-sm font-bold">{v.lines.join(" / ")}</span>
            {v.why && <span className="block text-xs text-slate-400">{v.why}</span>}
          </button>
        ))}
        <p className="text-xs text-slate-500">{chosen ? "✓ Gancho elegido: la IA construirá el episodio alrededor de él. Tócalo otra vez para quitarlo." : "Toca uno para elegirlo."}</p>
      </div>}
    </div>
  );
}
