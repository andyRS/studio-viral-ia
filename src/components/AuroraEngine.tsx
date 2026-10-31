"use client";
// Aurora Glow Engine: un único listener de puntero para todo el documento (sin estado de React por
// movimiento) que escribe --mx/--my en el elemento [data-spotlight] bajo el cursor, en un frame de
// animación. También aplica la preferencia de intensidad de efectos (reducidos/equilibrados/cinematográficos).
import { useEffect, useState } from "react";

export type Efectos = "reducidos" | "equilibrados" | "cinematograficos";
const CLAVE = "estudio-viral:efectos";
export function leerEfectos(): Efectos {
  try { const v = localStorage.getItem(CLAVE); if (v === "reducidos" || v === "cinematograficos" || v === "equilibrados") return v; } catch {}
  return "equilibrados";
}
function aplicar(e: Efectos) { document.documentElement.dataset.efectos = e; }

export default function AuroraEngine() {
  useEffect(() => {
    aplicar(leerEfectos());
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let actual: HTMLElement | null = null; let frame = 0; let x = 0, y = 0;
    const pintar = () => {
      frame = 0;
      if (!actual) return;
      const r = actual.getBoundingClientRect();
      actual.style.setProperty("--mx", `${x - r.left}px`); actual.style.setProperty("--my", `${y - r.top}px`);
    };
    const mover = (ev: PointerEvent) => {
      if (reduce.matches || document.documentElement.dataset.efectos === "reducidos" || ev.pointerType === "touch") return;
      const el = (ev.target as Element | null)?.closest?.("[data-spotlight]") as HTMLElement | null;
      if (el !== actual) { actual?.removeAttribute("data-spotlight-activo"); actual = el; actual?.setAttribute("data-spotlight-activo", ""); }
      x = ev.clientX; y = ev.clientY;
      if (actual && !frame) frame = requestAnimationFrame(pintar);
    };
    const salir = () => { actual?.removeAttribute("data-spotlight-activo"); actual = null; };
    document.addEventListener("pointermove", mover, { passive: true });
    document.addEventListener("pointerleave", salir);
    return () => { document.removeEventListener("pointermove", mover); document.removeEventListener("pointerleave", salir); if (frame) cancelAnimationFrame(frame); };
  }, []);
  return null;
}

// Control de intensidad de efectos visuales (se recuerda en este navegador).
export function PreferenciaEfectos() {
  const [e, setE] = useState<Efectos>("equilibrados");
  useEffect(() => { setE(leerEfectos()); }, []);
  const elegir = (v: Efectos) => { setE(v); aplicar(v); try { localStorage.setItem(CLAVE, v); } catch {} };
  return <div className="aurora-efectos" role="group" aria-label="Intensidad de los efectos visuales">
    {([["reducidos", "Reducidos"], ["equilibrados", "Equilibrados"], ["cinematograficos", "Cine"]] as const).map(([v, l]) =>
      <button key={v} type="button" aria-pressed={e === v} onClick={() => elegir(v)} title={`Efectos ${l.toLowerCase()}`}>{l}</button>)}
  </div>;
}
