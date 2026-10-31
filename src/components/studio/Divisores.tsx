"use client";
// Paneles redimensionables de los directores: dos divisores (izquierda y derecha) que se arrastran con el
// puntero o se mueven con el teclado (←/→, Inicio/Fin). Los anchos se recuerdan en este navegador por
// espacio de trabajo. En tablet y móvil el CSS apila los paneles y oculta los divisores.
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

type Anchos = { izq: number; der: number };
const LIM = { izq: [200, 420] as const, der: [260, 520] as const };
const acotar = (v: number, [a, b]: readonly [number, number]) => Math.max(a, Math.min(b, Math.round(v)));

export function useAnchos(clave: string, inicial: Anchos = { izq: 260, der: 320 }) {
  const [anchos, setAnchos] = useState<Anchos>(inicial);
  useEffect(() => {
    try { const g = JSON.parse(localStorage.getItem(`estudio-viral:paneles:${clave}`) || "null"); if (g?.izq && g?.der) setAnchos({ izq: acotar(g.izq, LIM.izq), der: acotar(g.der, LIM.der) }); } catch {}
  }, [clave]);
  const cambiar = useCallback((lado: keyof Anchos, v: number) => setAnchos(prev => {
    const next = { ...prev, [lado]: acotar(v, LIM[lado]) };
    try { localStorage.setItem(`estudio-viral:paneles:${clave}`, JSON.stringify(next)); } catch {}
    return next;
  }), [clave]);
  const estilo = { ["--sd-izq" as any]: `${anchos.izq}px`, ["--sd-der" as any]: `${anchos.der}px` } as CSSProperties;
  return { anchos, cambiar, estilo };
}

// lado "izq": arrastrar a la derecha agranda el panel izquierdo; lado "der": arrastrar a la izquierda agranda el derecho.
export function Divisor({ lado, valor, onCambio, etiqueta }: { lado: "izq" | "der"; valor: number; onCambio: (v: number) => void; etiqueta: string }) {
  const inicio = useRef<{ x: number; v: number } | null>(null);
  const [activo, setActivo] = useState(false);
  const signo = lado === "izq" ? 1 : -1;
  const [min, max] = LIM[lado];
  return <div role="separator" aria-orientation="vertical" aria-label={etiqueta} aria-valuenow={valor} aria-valuemin={min} aria-valuemax={max} tabIndex={0}
    className="sd-divisor" data-activo={activo}
    onPointerDown={e => { e.preventDefault(); (e.target as HTMLElement).setPointerCapture(e.pointerId); inicio.current = { x: e.clientX, v: valor }; setActivo(true); document.body.style.userSelect = "none"; }}
    onPointerMove={e => { if (inicio.current) onCambio(inicio.current.v + signo * (e.clientX - inicio.current.x)); }}
    onPointerUp={() => { inicio.current = null; setActivo(false); document.body.style.userSelect = ""; }} onPointerCancel={() => { inicio.current = null; setActivo(false); document.body.style.userSelect = ""; }}
    onDoubleClick={() => onCambio(lado === "izq" ? 260 : 320)}
    onKeyDown={e => {
      const paso = e.shiftKey ? 48 : 16;
      if (e.key === "ArrowLeft") { e.preventDefault(); onCambio(valor - signo * paso); }
      else if (e.key === "ArrowRight") { e.preventDefault(); onCambio(valor + signo * paso); }
      else if (e.key === "Home") { e.preventDefault(); onCambio(min); }
      else if (e.key === "End") { e.preventDefault(); onCambio(max); }
    }} />;
}
