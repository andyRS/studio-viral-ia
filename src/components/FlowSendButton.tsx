"use client";
// Envía el lote de escenas a la extensión «Estudio Viral → Google Flow».
// La extensión adjunta en Flow las fichas aprobadas de cada escena, pega el prompt y genera.
import { useEffect, useState } from "react";

export default function FlowSendButton({ title, scenes, cast, master }: {
  title: string; scenes: any[]; cast: any[]; master: (any | undefined)[];
}) {
  const [installed, setInstalled] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== window || e.origin !== window.location.origin || e.data?.source !== "ev-extension") return;
      if (e.data.type === "EV_EXTENSION_READY") setInstalled(true);
      if (e.data.type === "EV_FLOW_BATCH_OK") setStatus(e.data.error ? `La extensión no pudo guardar el lote: ${e.data.error}` : `✓ ${e.data.scenes} escenas preparadas para la extensión. Abre un proyecto en Flow y pulsa «Preparar siguiente».`);
    };
    window.addEventListener("message", onMsg);
    window.postMessage({ source: "estudio-viral", type: "EV_PING" }, window.location.origin);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  // Solo la versión aprobada y vigente de la biblia se puede enviar a Flow.
  const sheets = cast.map((c, i) => ({ name: String(c.name || "").trim(), dataUrl: master[i]?.imageUrl as string | undefined,
    approved: !!master[i]?.referenceApprovedAt, version: Number(master[i]?.referenceVersion || 1) }))
    .filter(s => s.name && s.approved && /^data:image\/(?:png|jpeg|webp);base64,/i.test(s.dataUrl || ""));
  const byName = new Map(sheets.map(s => [s.name.toLocaleLowerCase("es"), s]));
  const missing = cast.filter((c, i) => !master[i]?.referenceApprovedAt || !/^data:image\/(?:png|jpeg|webp);base64,/i.test(master[i]?.imageUrl || ""))
    .map(c => String(c.name || "sin nombre"));

  function send() {
    if (missing.length) { setStatus(`No se envió: faltan fichas aprobadas válidas de ${missing.join(", ")}.`); return; }
    const prepared = scenes.map(s => {
      const raw = String(s.imagePromptFlow || "").replace(/^\[(?:P\d{2}|\d{3})\]\s*/, "").trim();
      const names = Array.from(new Set([...(Array.isArray(s.characters) ? s.characters : []),
        ...cast.filter(c => { const escaped = String(c.name || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); return escaped && new RegExp(`(^|[^\\p{L}])${escaped}($|[^\\p{L}])`, "iu").test(raw); }).map(c => c.name)]));
      const refs = names.map((name: string) => byName.get(String(name).trim().toLocaleLowerCase("es")));
      const unresolved = names.filter((_: string, i: number) => !refs[i]);
      if (unresolved.length) throw new Error(`Escena ${s.n}: falta la ficha aprobada de ${unresolved.join(", ")}.`);
      const unique = Array.from(new Map(refs.filter(Boolean).map((r: any) => [r.name, r])).values()) as typeof sheets;
      if (!raw) throw new Error(`Escena ${s.n}: falta el prompt para Flow.`);
      const prefix = unique.length ? `Usa las imágenes adjuntas como referencia visual exacta: ${unique.map(r => `${r.name} = ficha aprobada v${r.version}`).join("; ")}. Conserva sus rostros, fruta, ropa y colores.\n` : "";
      return { id: `[${String(s.n).padStart(3, "0")}]`, n: s.n, title: s.title || s.setting,
        prompt: `${prefix}${raw}`, refs: unique.map(r => r.name) };
    });
    const batch = {
      title,
      sheets: sheets.map(({ name, dataUrl, version }) => ({ name, dataUrl, version })),
      scenes: prepared,
    };
    setStatus("Enviando a la extensión…");
    window.postMessage({ source: "estudio-viral", type: "EV_FLOW_BATCH", batch }, window.location.origin);
    setTimeout(() => setStatus(prev => prev === "Enviando a la extensión…" ? "La extensión no respondió. Comprueba que está instalada y recarga esta página." : prev), 4000);
  }

  return <div className="mt-3 rounded-xl border border-orange-400/30 bg-orange-400/[.07] p-3">
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={!installed || !scenes.length || !!missing.length} onClick={() => { try { send(); } catch (error) { setStatus(error instanceof Error ? error.message : String(error)); } }} className="rounded-lg bg-orange-500 px-3 py-2 text-sm font-bold text-black disabled:opacity-50">🚀 Enviar a Flow ({scenes.length} escenas)</button>
      <span className="text-xs text-slate-300">{missing.length ? `Faltan fichas aprobadas: ${missing.join(", ")}` : installed ? `Extensión lista · ${sheets.length} fichas aprobadas se adjuntarán como referencia` : "Necesita la extensión «Estudio Viral → Google Flow»."}</span>
      {!installed && <a href="/estudio-viral-flow-extension.zip" download className="text-xs font-semibold text-sky-300 hover:text-sky-200">Descargar extensión</a>}
    </div>
    {!installed && <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-[11px] leading-5 text-slate-400">
      <li>Descarga la extensión y descomprime el .zip en una carpeta.</li>
      <li>En Chrome abre <b>chrome://extensions</b>, activa <b>Modo de desarrollador</b> y pulsa <b>Cargar descomprimida</b> eligiendo esa carpeta.</li>
      <li>Recarga esta página: el botón se activará.</li>
    </ol>}
    {status && <p className="mt-2 text-xs text-amber-100">{status}</p>}
    <p className="mt-2 text-[11px] leading-5 text-slate-400">«Copiar» lleva solo el texto. «Enviar a Flow» pasa también las imágenes aprobadas y las asocia por nombre a cada escena. La extensión prepara sin generar hasta que lo decidas en Flow.</p>
  </div>;
}
