"use client";
import { useMemo, useState } from "react";
import { useData } from "@/lib/DataContext";
import CopyButton from "./CopyButton";

const DOLA_URL = "https://www.dola.com/chat";

function buildClaudePack(ep: any, chars: any[], metrics: any[], checks: any[]) {
  const o = ep?.output || {};
  const m = metrics.filter((x: any) => x.episodeId === ep?.id || x.episodeTitle === ep?.title);
  const c = checks.filter((x: any) => x.episodeId === ep?.id);
  return [
    `# Paquete para Claude — ${ep?.title || ep?.theme}`,
    `Fecha: ${new Date().toLocaleString("es-DO")}`,
    "",
    "## Qué necesito",
    "Revisa los clips que adjunto junto a este archivo: caras y cabezas de fruta consistentes, frases completas y bien pronunciadas. Luego monta el episodio con gancho, subtítulos de colores, tarjetas y cierre, sin marca de agua, y prepara las 4 versiones por plataforma.",
    "",
    "## Personajes",
    ...chars.map((x: any) => `- ${x.name} (color ${x.subtitleColor}): ${x.visualES}; ropa: ${x.clothing}. Pronunciación: ${(x.pronunciations || []).join("; ") || "—"}`),
    "",
    "## guion.json",
    "```json", JSON.stringify(o.guionJson || {}, null, 2), "```",
    "",
    "## Prompts usados",
    `### Dola ${o.dolaDuration || 60}s${o.dolaIsAdaptation ? ` (adaptación del guion de ${o.duration}s)` : ""}`, o.dolaPrompt || "—",
    ...(o.prompts || []).map((p: string, i: number) => `### Bloque ${i + 1}\n${p}`),
    "",
    "## Versiones por plataforma",
    "```json", JSON.stringify(o.platformAdaptations || o.platform_adaptations || ep?.platformAdaptations || [], null, 2), "```",
    "",
    "## Revisión de clips",
    c.length ? c.map((x: any) => `- Clip ${x.clipIndex + 1}: caras ${x.facesConsistent ? "OK" : "revisar"}, frases ${x.fullPhrases ? "OK" : "revisar"}, pronunciación ${x.pronunciationOk ? "OK" : "revisar"}, marca de agua ${x.noWatermark ? "no" : "sí"}, cabezas de fruta ${x.fruitHeads ? "OK" : "revisar"}${x.notes ? ` — ${x.notes}` : ""}`).join("\n") : "Sin revisión registrada.",
    "",
    "## Métricas",
    m.length ? m.map((x: any) => `- ${x.platform} (${x.date}): ${x.views} vistas, ${x.avgWatch}s promedio, ${x.interactions} interacciones, +${x.followers} seguidores`).join("\n") : "Sin métricas todavía.",
  ].join("\n");
}
function downloadText(text: string, name: string) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "text/markdown" })); a.download = name; a.click();
}

export default function DolaStudioModule() {
  const { data } = useData();
  const d: any = data;
  const episodes = useMemo(() => [...(data.episodes || [])].reverse(), [data.episodes]);
  const [epId, setEpId] = useState<string>(episodes[0]?.id || "");
  const [frameKey, setFrameKey] = useState(0);
  const [mobileTab, setMobileTab] = useState<"prompts" | "dola">("prompts");
  const ep: any = episodes.find(e => e.id === epId) || episodes[0];
  const out = ep?.output || {};
  const chars = (data.characters || []).filter((c: any) => !ep?.seriesId || c.seriesId === ep.seriesId);
  const missingMasters = (out.cast || []).filter((castMember: any) => !chars.some(c => c.name.toLowerCase() === String(castMember.name).toLowerCase() && c.imageUrl && c.referenceApprovedAt));
  const versionsMatch = !!out.referenceVersions && (out.cast || []).every((castMember: any) => {
    const saved = chars.find(c => c.name.toLowerCase() === String(castMember.name).toLowerCase());
    return saved && Number(saved.referenceVersion || 1) === Number(out.referenceVersions[String(castMember.name).toLowerCase()]);
  });
  const endingProtected = !out.dolaIsAdaptation || (Array.isArray(out.dolaSceneNumbers) && out.dolaSceneNumbers.includes(out.scenes?.length));
  const verified = !!out.mode && out.mode !== "plantilla-local" && Array.isArray(out.cast) && out.cast.length >= 2 && !missingMasters.length && versionsMatch && endingProtected;
  const sec = Array.isArray(out.scenes) && out.scenes.length ? 8 : 15;
  const dolaDuration = out.dolaDuration || 60;

  const promptsPanel = (
    <div className="space-y-3">
      {episodes.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-white/[.03] p-4 text-sm text-slate-300">Todavía no hay episodios. Genera uno en el <b>Generador</b> y vuelve aquí para trabajarlo con Dola.</p>
      ) : (
        <select value={ep?.id} onChange={e => setEpId(e.target.value)}>
          {episodes.map(e => <option key={e.id} value={e.id}>{e.title || e.theme}{e.status === "Borrador" || e.output?.mode === "plantilla-local" ? " · Borrador" : ""}</option>)}
        </select>
      )}
      <div className="rounded-xl bg-[#121826] p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">1 · Prepara Dola</p>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-slate-300">
          <li>Activa la habilidad <b>Zehlas 1min</b> y el modo <b>Profesional</b>.</li>
          <li>Sube las fichas en este orden:</li>
        </ul>
        <ol className="mt-2 flex flex-wrap gap-2 text-xs">
          {chars.map((c: any, i: number) => (
            <li key={c.id} className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
              <span className="font-bold text-amber-300">{i + 1}</span>
              {c.imageUrl ? <img src={c.imageUrl} alt="" className="h-5 w-5 rounded-full object-cover" /> : <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.subtitleColor }} />}
              {c.name}
            </li>
          ))}
        </ol>
      </div>
      {ep && (
        <div className="rounded-xl bg-[#121826] p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">2 · Pega el prompt</p>
          {!verified && <p className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-xs leading-5 text-amber-100">{out.mode === "plantilla-local" ? "Este episodio es un borrador de plantilla. Recréalo con Gemini antes de producir." : missingMasters.length ? `Faltan fichas maestras aprobadas: ${missingMasters.map((c: any) => c.name).join(", ")}. Apruébalas en Generador → Biblia.` : !versionsMatch ? "El guion usa fichas anteriores o no tiene versión registrada. Regenera el episodio con la biblia actual." : !endingProtected ? "Este prompt es anterior a la corrección de duración y puede cortar el cierre. Regenera el episodio antes de usar Dola." : "Este episodio necesita revisión en Generador antes de producir."}</p>}
          {verified && out.dolaIsAdaptation && <p className="mt-3 rounded-lg border border-sky-400/20 bg-sky-400/[.06] p-3 text-xs text-sky-100">Versión de {dolaDuration} s: mantiene el inicio y el cierre. Escenas originales incluidas: {(out.dolaSceneNumbers || []).join(", ")}.</p>}
          {verified && <details className="prompt-box" open><summary><span>Prompt Dola {dolaDuration} s{out.dolaIsAdaptation ? " · adaptación" : ""}</span></summary><div className="flex justify-end px-3 pb-1"><CopyButton text={out.dolaPrompt || ""} /></div><p className="prompt-text">{out.dolaPrompt || "Este episodio no tiene prompt de Dola."}</p></details>}
          {verified && (out.prompts || []).map((p: string, i: number) => (
            <details key={i} className="prompt-box"><summary><span>{sec === 8 ? "Escena" : "Bloque"} {i + 1} · {i * sec}-{(i + 1) * sec}s</span></summary><div className="flex justify-end px-3 pb-1"><CopyButton text={p} /></div><p className="prompt-text">{p}</p></details>
          ))}
          <p className="mt-3 text-xs text-slate-400">Si Dola entrega solo 30 s, escríbele «continúa». Descarga los clips.</p>
        </div>
      )}
      {ep && verified && (
        <div className="rounded-xl bg-[#121826] p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">3 · Envíalo a Claude</p>
          <p className="mt-2 text-sm text-slate-300">Descarga el paquete y adjúntalo en tu chat con Claude junto con los clips de Dola. Solicita allí la revisión, el montaje y las cuatro versiones; comprueba cada entrega antes de publicarla.</p>
          <button onClick={() => downloadText(buildClaudePack(ep, chars, d.metrics || [], d.clipChecks || []), `paquete-claude-${(ep.title || "episodio").replace(/[^a-z0-9áéíóúñ]+/gi, "-").toLowerCase()}.md`)}
            className="mt-3 w-full rounded bg-amber-500 px-4 py-2 font-bold">Descargar paquete para Claude</button>
        </div>
      )}
    </div>
  );

  const dolaPanel = (
    <div className="flex h-full min-h-[70vh] flex-col overflow-hidden rounded-xl border border-white/10 bg-black">
      <div className="flex items-center gap-2 border-b border-white/10 bg-[#0d1220] px-3 py-2 text-xs">
        <span className="h-2.5 w-2.5 rounded-full bg-violet-400" />
        <span className="flex-1 truncate text-slate-400">dola.com/chat</span>
        <button onClick={() => setFrameKey(k => k + 1)} className="rounded-md px-2 py-1 text-slate-300 hover:bg-white/10">Recargar</button>
        <a href={DOLA_URL} target="_blank" rel="noopener" className="rounded-md px-2 py-1 font-semibold text-violet-300 hover:bg-white/10">Abrir en pestaña</a>
      </div>
      <iframe key={frameKey} src={DOLA_URL} title="Dola" className="w-full flex-1 bg-white"
        allow="clipboard-read; clipboard-write; microphone; fullscreen; autoplay"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals allow-storage-access-by-user-activation" />
      <p className="border-t border-white/10 bg-[#0d1220] px-3 py-2 text-[11px] text-slate-400">Si Dola no te deja iniciar sesión aquí dentro (algunos navegadores bloquean el login en ventanas integradas), usa «Abrir en pestaña»: los prompts siguen a la izquierda.</p>
    </div>
  );

  return (
    <div>
      <h2 className="text-xl font-bold">Estudio Dola</h2>
      <p className="mt-1 text-sm text-slate-400">Trabaja el episodio con Dola sin salir de la app.</p>
      <div className="mt-3 grid grid-cols-2 gap-2 lg:hidden">
        {(["prompts", "dola"] as const).map(t => (
          <button key={t} onClick={() => setMobileTab(t)} className={`rounded-xl border px-3 py-2 text-sm ${mobileTab === t ? "border-amber-400/50 bg-amber-400/10 text-amber-200" : "border-white/10 text-slate-300"}`}>{t === "prompts" ? "Prompts" : "Dola"}</button>
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(320px,400px)_1fr]">
        <div className={`${mobileTab === "prompts" ? "" : "hidden"} lg:block lg:max-h-[calc(100vh-180px)] lg:overflow-y-auto lg:pr-1`}>{promptsPanel}</div>
        <div className={`${mobileTab === "dola" ? "" : "hidden"} lg:block lg:h-[calc(100vh-180px)]`}>{dolaPanel}</div>
      </div>
    </div>
  );
}
