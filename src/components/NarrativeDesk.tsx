"use client";
import { useRef, type ReactNode } from "react";

export type DeskScene = {
  n: number; title?: string; speaker?: string; line?: string; emotion?: string; phone?: unknown;
  goal?: string; characters?: string[]; location?: string; shot?: string; setting?: string;
  sfx?: string; music?: string; transition?: string; nextLink?: string;
};
type DeskCharacter = { name: string; imageUrl?: string; subtitleColor?: string; fruitEmoji?: string };

export function SceneRail({ scenes, active, onSelect }: { scenes: DeskScene[]; active: number; onSelect: (n: number) => void }) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  return <nav className="episode-scene-rail" aria-label="Secuencia de escenas">{scenes.map((scene, i) => <button type="button" key={scene.n} ref={node => { buttons.current[i] = node; }} aria-current={scene.n === active ? "step" : undefined} aria-label={`Escena ${scene.n}: ${scene.title || scene.speaker || "Sin título"}`} onClick={() => onSelect(scene.n)} onKeyDown={event => {
    let next = i;
    if (event.key === "ArrowRight") next = Math.min(scenes.length - 1, i + 1);
    else if (event.key === "ArrowLeft") next = Math.max(0, i - 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = scenes.length - 1;
    else return;
    event.preventDefault(); onSelect(scenes[next].n); buttons.current[next]?.focus();
  }}><span className="scene-rail-number">{String(scene.n).padStart(2, "0")}</span><strong>{scene.title || `Escena ${scene.n}`}</strong><small>{scene.speaker || "Narración"}</small></button>)}</nav>;
}

export default function NarrativeDesk({ scenes, cast, masters, active, onSelect, onCharacters, onPrompts, productionReady, renderPhone }: { scenes: DeskScene[]; cast: DeskCharacter[]; masters: (DeskCharacter | undefined)[]; active: number; onSelect: (n: number) => void; onCharacters: () => void; onPrompts: () => void; productionReady: boolean; renderPhone?: (phone: unknown, speaker: string) => ReactNode }) {
  const scene = scenes.find(s => s.n === active) || scenes[0];
  if (!scene) return null;
  const speaker = cast.find(c => c.name === scene.speaker);
  const reference = masters.find(c => c?.name?.toLowerCase() === String(scene.speaker).toLowerCase());
  const fields = [["Objetivo", scene.goal], ["Lugar", scene.location], ["Plano", scene.shot], ["Acción visual", scene.setting], ["Ambiente sonoro", scene.sfx], ["Música", scene.music], ["Transición", scene.transition], ["Conexión", scene.nextLink]].filter(([, v]) => v);
  return <section className="narrative-desk" aria-label="Mesa de lectura y dirección">
    <div className="narrative-workspace"><div className="narrative-center">
      <header className="stage-panel-header"><span className="studio-eyebrow">DIRECCIÓN NARRATIVA</span><span>ESCENA {String(scene.n).padStart(2, "0")} · {scenes.length} EN TOTAL</span></header>
      <div className="narrative-screen">{reference?.imageUrl && <img src={reference.imageUrl} alt={`Referencia de ${reference.name}, no es un fotograma de la escena`} />}<div className="narrative-screen-shade" /><span className="narrative-screen-caption">{reference?.imageUrl ? "REFERENCIA DEL PERSONAJE" : "LECTURA DE ESCENA / SIN IMAGEN"}</span><div className="narrative-scene-title"><p className="studio-eyebrow cinematic-gold">{scene.location || "LA INTENCIÓN DE LA ESCENA"}</p><h3>{scene.title || `Escena ${scene.n}`}</h3><p>{scene.setting || scene.goal || "Explora el diálogo y la dirección de esta escena."}</p></div><span className="narrative-screen-index" aria-hidden="true">{String(scene.n).padStart(2, "0")}</span></div>
      <div className="narrative-dialogue"><div className="dialogue-speaker"><span style={{ background: speaker?.subtitleColor || "var(--creative)" }} /><strong>{scene.speaker || "Narración"}</strong>{scene.emotion && <small>{scene.emotion}</small>}</div><blockquote>“{scene.line || "Sin diálogo registrado."}”</blockquote>{!!scene.phone && renderPhone?.(scene.phone, scene.speaker || "")}</div>
      {!!cast.length && <div className="narrative-cast"><span className="studio-eyebrow">ELENCO</span>{cast.map(c => { const m = masters.find(x => x?.name === c.name); return <button type="button" key={c.name} onClick={onCharacters}>{m?.imageUrl ? <img src={m.imageUrl} alt="" /> : <span className="cast-initial" aria-hidden="true">{c.name.slice(0, 1)}</span>}<span>{c.name}</span></button>; })}</div>}
    </div><aside className="narrative-inspector"><header className="stage-panel-header"><span className="studio-eyebrow">NOTAS DE DIRECCIÓN</span><span aria-hidden="true">⌘</span></header><div className="stage-inspector-body"><h4>La intención del plano.</h4><p className="stage-inspector-intro">Lo que ocurre, lo que cambia y cómo lo verá tu audiencia.</p><dl>{fields.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}{!!scene.characters?.length && <div><dt>Personajes en escena</dt><dd>{scene.characters.join(", ")}</dd></div>}</dl><button type="button" className="studio-secondary-action w-full" onClick={onPrompts} disabled={!productionReady}>Prompts de imagen ↗</button>{!productionReady && <p className="stage-inspector-help">Aprueba las fichas vigentes del elenco para abrir los prompts de producción.</p>}</div></aside></div>
    <SceneRail scenes={scenes} active={scene.n} onSelect={onSelect} />
  </section>;
}
