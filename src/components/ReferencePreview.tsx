"use client";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Presentation only: existing references and versions, never writes data. */
export default function ReferencePreview({ src, title, previous, previousLabel = "Versión anterior", landscape = false }: { src: string; title: string; previous?: string; previousLabel?: string; landscape?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLAnchorElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const [compare, setCompare] = useState(false);
  const heading = useId();
  return <>
    <a ref={trigger} href={src} role="button" className={landscape ? "character-preview-button h-full w-full" : "character-preview-button"} onClick={event => { event.preventDefault(); setCompare(false); dialog.current?.showModal(); }} onKeyDown={event => { if (event.key === " ") { event.preventDefault(); setCompare(false); dialog.current?.showModal(); } }} aria-label={`Ampliar referencia de ${title}`} aria-haspopup="dialog"><img src={src} alt={`Referencia visual de ${title}`} loading="lazy" className={landscape ? "aspect-video h-full w-full rounded-lg bg-black/30 object-contain" : "mt-3 aspect-[9/16] max-h-64 w-full rounded-lg border border-white/10 bg-black/30 object-contain"} /><span className={landscape ? "sr-only" : "mt-2 block text-xs text-teal-200"}>Ampliar{previous ? " y comparar versiones" : " referencia"} ↗</span></a>
    {mounted && createPortal(<dialog ref={dialog} className="reference-preview" aria-labelledby={heading} onClose={() => trigger.current?.focus()} onClick={e => { if (e.target === dialog.current) { const rect = dialog.current.getBoundingClientRect(); if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) dialog.current.close(); } }}>
      <div className="reference-preview-header"><div><p className="studio-eyebrow">BIBLIA VISUAL / REFERENCIAS</p><h2 id={heading} className="mt-1 text-lg font-semibold">{title}</h2></div><div className="flex flex-wrap gap-2">{previous && <button type="button" aria-pressed={compare} className="studio-secondary-action" onClick={() => setCompare(v => !v)}>{compare ? "Solo actual" : "Comparar versiones"}</button>}<button type="button" autoFocus className="studio-secondary-action" onClick={() => dialog.current?.close()}>Cerrar <span aria-hidden="true">×</span></button></div></div>
      <div className="reference-preview-content" data-compare={compare}>{compare && previous && <figure><figcaption>{previousLabel}</figcaption><img src={previous} alt={`${title}, ${previousLabel}`} /></figure>}<figure><figcaption>Referencia actual</figcaption><img src={src} alt={`${title}, referencia actual ampliada`} /></figure></div>
    </dialog>, document.body)}
  </>;
}
