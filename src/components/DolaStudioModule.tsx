"use client";
import PromptWorkbench from "./PromptWorkbench";
import { useMemo, useState } from "react";
import { useData } from "@/lib/DataContext";
import WorkspaceIntro, { WorkspaceLoading } from "./WorkspaceIntro";

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

export default function DolaStudioModule({ onNavigate }: { onNavigate?: (module: string) => void } = {}) {
  const { data, mode } = useData();
  const d: any = data;
  const episodes = useMemo(() => [...(data.episodes || [])].reverse(), [data.episodes]);
  const [epId, setEpId] = useState<string>(episodes[0]?.id || "");
  const [frameKey, setFrameKey] = useState(0);
  const [showDola, setShowDola] = useState(false);
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
  // La plantilla local también se puede producir (con aviso): lo que se exige es elenco y fichas aprobadas.
  const verified = !!out.mode && Array.isArray(out.cast) && out.cast.length >= 2 && !missingMasters.length && versionsMatch && endingProtected;
  const isTemplate = out.mode === "plantilla-local";
  const sec = Array.isArray(out.scenes) && out.scenes.length ? 8 : 15;
  const dolaDuration = out.dolaDuration || 60;

  const promptsPanel = (
    <div className="dola-prompt-stack space-y-4">
      {episodes.length === 0 ? (
        <div className="dola-empty"><span aria-hidden="true">✦</span><p className="studio-eyebrow">01 / PREPARAR EL EPISODIO</p><h3>Tu mesa está lista.</h3><p>Todavía no hay episodios. Crea uno en el Generador y vuelve aquí para revisar sus referencias y prompts.</p>{onNavigate && <button type="button" className="studio-secondary-action" onClick={() => onNavigate("generador")}>Ir al Generador ↗</button>}</div>
      ) : (
        <label className="dola-episode-picker">Episodio en la mesa<select value={ep?.id} onChange={e => setEpId(e.target.value)}>
          {episodes.map(e => <option key={e.id} value={e.id}>{e.title || e.theme}{e.status === "Borrador" || e.output?.mode === "plantilla-local" ? " · Borrador" : ""}</option>)}
        </select></label>
      )}
      {ep && <div className="dola-step rounded-xl bg-[#121826] p-4">
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
      </div>}
      {ep && (
        <div className="dola-step rounded-xl bg-[#121826] p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">2 · Pega el prompt</p>
          {!verified && <p className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-xs leading-5 text-amber-100">{!Array.isArray(out.cast) || out.cast.length < 2 ? "Este episodio no tiene elenco de producción. Recréalo desde el Generador." : missingMasters.length ? `Faltan fichas maestras aprobadas: ${missingMasters.map((c: any) => c.name).join(", ")}. Apruébalas en Generador → Personajes canónicos.` : !versionsMatch ? "El guion usa fichas anteriores o no tiene versión registrada. Regenera el episodio con la biblia actual." : !endingProtected ? "Este prompt es anterior a la corrección de duración y puede cortar el cierre. Regenera el episodio antes de usar Dola." : "Este episodio necesita revisión en Generador antes de producir."}</p>}
          {verified && isTemplate && <p className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-xs leading-5 text-amber-100">Borrador de la plantilla local: el diálogo es de estructura genérica. Revísalo antes de producir o recréalo con la IA.</p>}
          {verified && out.dolaIsAdaptation && <p className="mt-3 rounded-lg border border-sky-400/20 bg-sky-400/[.06] p-3 text-xs text-sky-100">Versión de {dolaDuration} s: mantiene el inicio y el cierre. Escenas originales incluidas: {(out.dolaSceneNumbers || []).join(", ")}.</p>}
          {verified && <details className="prompt-box" open><summary><span>Prompt Dola {dolaDuration} s{out.dolaIsAdaptation ? " · adaptación" : ""}</span></summary><PromptWorkbench title={`Dola · ${dolaDuration} s`} prompt={out.dolaPrompt || ""} context="Prompt original y copia de trabajo" /></details>}
          {verified && (out.prompts || []).map((p: string, i: number) => (
            <details key={i} className="prompt-box"><summary><span>{sec === 8 ? "Escena" : "Bloque"} {i + 1} · {i * sec}-{(i + 1) * sec}s</span></summary><PromptWorkbench title={`Bloque ${i + 1}`} prompt={p} /></details>
          ))}
          <p className="mt-3 text-xs text-slate-400">Si Dola entrega solo 30 s, escríbele «continúa». Descarga los clips.</p>
        </div>
      )}
      {ep && verified && (
        <div className="dola-step rounded-xl bg-[#121826] p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">3 · Envíalo a Claude</p>
          <p className="mt-2 text-sm text-slate-300">Descarga el paquete y adjúntalo en tu chat con Claude junto con los clips de Dola. Solicita allí la revisión, el montaje y las cuatro versiones; comprueba cada entrega antes de publicarla.</p>
          <button onClick={() => downloadText(buildClaudePack(ep, chars, d.metrics || [], d.clipChecks || []), `paquete-claude-${(ep.title || "episodio").replace(/[^a-z0-9áéíóúñ]+/gi, "-").toLowerCase()}.md`)}
            className="mt-3 w-full rounded bg-amber-500 px-4 py-2 font-bold">Descargar paquete para Claude</button>
        </div>
      )}
    </div>
  );

  const dolaPanel = (
    <div className="dola-external-canvas flex h-full min-h-[70vh] flex-col overflow-hidden rounded-xl border border-white/10 bg-black">
      <div className="flex items-center gap-2 border-b border-white/10 bg-[#0d1220] px-3 py-2 text-xs">
        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full border border-cyan-200/50" />
        <span className="flex-1 truncate text-slate-300">Dola · espacio externo</span>
        <button disabled={!showDola} onClick={() => setFrameKey(k => k + 1)} className="rounded-md px-2 py-1 text-slate-300 hover:bg-white/10 disabled:opacity-40">Recargar</button>
        <a href={DOLA_URL} target="_blank" rel="noopener" className="rounded-md px-2 py-1 font-semibold text-teal-300 hover:bg-white/10">Abrir en pestaña</a>
      </div>
      {showDola ? <iframe key={frameKey} src={DOLA_URL} title="Dola" className="w-full flex-1 bg-white"
        allow="clipboard-read; clipboard-write; microphone; fullscreen; autoplay"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals allow-storage-access-by-user-activation" /> : <div className="dola-launch-canvas"><span className="dola-aperture" aria-hidden="true">D</span><p className="studio-eyebrow">ESPACIO EXTERNO / DOLA</p><h3>La próxima escena empieza contigo.</h3><p>Revisa tu material y abre el espacio de generación cuando estés listo.</p><button type="button" className="studio-primary-action" onClick={() => setShowDola(true)}>Abrir espacio integrado ↗</button><small>La sesión y disponibilidad dependen de Dola.</small></div>}
      <p className="border-t border-white/10 bg-[#0d1220] px-3 py-2 text-[11px] text-slate-400">Si Dola no te deja iniciar sesión aquí dentro (algunos navegadores bloquean el login en ventanas integradas), usa «Abrir en pestaña»: los prompts siguen a la izquierda.</p>
    </div>
  );

  if (mode === "cargando") return <WorkspaceLoading label="Creative Studio / Estudio Dola" />;
  return (
    <section className="growth-workspace creative-library dola-studio space-y-6">
      <WorkspaceIntro eyebrow="Creative Studio / Estudio Dola" title="De la dirección al movimiento." description="Prepara las referencias, revisa el prompt y lleva tu episodio al espacio de generación. Todo el material, al alcance de tu próxima decisión." index="01 / DOLA">
        <a href={DOLA_URL} target="_blank" rel="noopener" className="studio-primary-action">Abrir Dola ↗</a><p className="growth-source">{ep ? ep.title : "Selecciona un episodio para empezar"}</p>
      </WorkspaceIntro>
      {ep && <div className="dola-context-strip"><div><span>EPISODIO</span><strong>{ep.title || ep.theme}</strong></div><div><span>REFERENCIAS</span><strong>{chars.filter(c => c.imageUrl && c.referenceApprovedAt).length} aprobadas</strong></div><div><span>PREPARACIÓN</span><strong data-ready={verified}>{verified ? isTemplate ? "Plantilla por revisar" : "Fichas y versiones verificadas" : "Requiere revisión"}</strong></div></div>}
      <div className="dola-mobile-switch mt-3 grid grid-cols-2 gap-2 lg:hidden" role="group" aria-label="Área de trabajo Dola">
        {(["prompts", "dola"] as const).map(t => (
          <button key={t} aria-pressed={mobileTab === t} onClick={() => setMobileTab(t)} className={`rounded-xl border px-3 py-2 text-sm ${mobileTab === t ? "border-cyan-300/50 bg-cyan-300/10 text-cyan-100" : "border-white/10 text-slate-300"}`}>{t === "prompts" ? "Prompts" : "Dola"}</button>
        ))}
      </div>
      <div className="dola-workspace-grid mt-4 grid gap-4 lg:grid-cols-[minmax(320px,400px)_1fr]">
        <div className={`dola-directions ${mobileTab === "prompts" ? "" : "hidden"} lg:block`}>{promptsPanel}</div>
        <div className={`dola-browser ${mobileTab === "dola" ? "" : "hidden"} lg:block`}>{dolaPanel}</div>
      </div>
    </section>
  );
}
