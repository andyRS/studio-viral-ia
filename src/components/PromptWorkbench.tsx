"use client";
import { useId, useState } from "react";
import CopyButton from "./CopyButton";

type Props = { prompt: string; title: string; context?: string };
export default function PromptWorkbench(props: Props) {
  // A source update starts a new copy instead of silently pairing an old draft with a new original.
  return <PromptEditor key={props.prompt} {...props} />;
}
function PromptEditor({ prompt = "", title, context }: Props) {
  const [draft, setDraft] = useState(prompt);
  const [editing, setEditing] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [focus, setFocus] = useState(false);
  const id = useId();
  const changed = draft !== prompt;
  const download = () => {
    const url = URL.createObjectURL(new Blob([draft], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `${title.replace(/[^a-z0-9áéíóúñ]+/gi, "-")}.txt`; a.click(); URL.revokeObjectURL(url);
  };
  return <section className={`prompt-workbench${focus ? " is-focused" : ""}`} aria-label={title}>
    <header className="prompt-workbench-header"><div><span className="studio-eyebrow">PROMPT INTELLIGENCE</span><h4>{title}</h4>{context && <p>{context}</p>}</div><span className="prompt-source-badge">{changed ? "Copia ajustada" : "Original"}</span></header>
    <div className="prompt-workbench-toolbar" role="group" aria-label={`Herramientas de ${title}`}><button type="button" aria-pressed={editing} onClick={() => setEditing(v => !v)}>{editing ? "Vista de lectura" : "Ajustar copia"}</button><button type="button" aria-pressed={focus} onClick={() => setFocus(v => !v)}>{focus ? "Salir de concentración" : "Concentración"}</button>{changed && <><button type="button" aria-pressed={comparing} onClick={() => setComparing(v => !v)}>{comparing ? "Ocultar original" : "Comparar con original"}</button><button type="button" onClick={() => { setDraft(prompt); setComparing(false); }}>Restablecer copia</button></>}<button type="button" onClick={download} disabled={!draft}>Exportar .txt</button><CopyButton text={draft} label={changed ? "Copiar ajuste" : "Copiar prompt"} /></div>
    <div className="prompt-comparison" data-compare={comparing && changed}>{comparing && changed && <div className="prompt-original"><p className="prompt-pane-label">ORIGINAL GUARDADO</p><pre>{prompt}</pre></div>}<div><label className="prompt-pane-label" htmlFor={editing ? id : undefined}>{changed ? "TU AJUSTE PARA COPIAR" : "DIRECCIÓN DE GENERACIÓN"}</label>{editing ? <textarea id={id} value={draft} onChange={e => setDraft(e.target.value)} rows={10} spellCheck={false} /> : <pre>{draft || "No hay prompt disponible."}</pre>}</div></div>
    <footer className="prompt-workbench-footer"><span aria-hidden="true">✦</span><p>{changed || editing ? "Copia temporal para copiar o exportar. No modifica el prompt guardado ni sus referencias; se pierde al salir de este panel." : "Aísla la dirección que necesitas. Ajusta una copia y compara antes de llevarla a producción."}</p><span>{draft.length.toLocaleString("es")} caracteres</span></footer>
  </section>;
}
