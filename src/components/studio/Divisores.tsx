"use client";
// Paneles redimensionables de los directores: dos divisores (izquierda y derecha) que se arrastran con el
// puntero o se mueven con el teclado (←/→, Inicio/Fin). Los anchos se recuerdan en este navegador por
// espacio de trabajo. El centro (lienzo) conserva siempre un mínimo: los máximos de cada panel se calculan
// con el ancho real del espacio y el del otro panel, y se recalculan si el espacio cambia de tamaño.
// En espacios estrechos el CSS (container queries) apila los paneles y oculta los divisores.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

type Anchos = { izq: number; der: number };
export const LIM = { izq: [200, 420] as const, der: [260, 520] as const };
export const MIN_CENTRO = 380;
const DIVISORES = 20 + 16;   // dos divisores de 10 px + separaciones entre columnas
const acotar = (v: number, a: number, b: number) => Math.max(a, Math.min(b, Math.round(v)));

// Anchos efectivos con el espacio disponible: nunca dejan menos de MIN_CENTRO al lienzo.
export function ajustarAnchos(deseados: Anchos, disponible: number): Anchos & { maxIzq: number; maxDer: number } {
  const libre = disponible > 0 ? disponible - DIVISORES - MIN_CENTRO : Infinity;
  const der = acotar(deseados.der, LIM.der[0], Math.min(LIM.der[1], libre - LIM.izq[0]));
  const izq = acotar(deseados.izq, LIM.izq[0], Math.min(LIM.izq[1], libre - der));
  return { izq, der, maxIzq: Math.max(LIM.izq[0], Math.min(LIM.izq[1], libre - der)), maxDer: Math.max(LIM.der[0], Math.min(LIM.der[1], libre - izq)) };
}

export function useAnchos(clave: string, inicial: Anchos = { izq: 260, der: 320 }) {
  const [deseados, setDeseados] = useState<Anchos>(inicial);
  const [disponible, setDisponible] = useState(0);
  const ro = useRef<ResizeObserver | null>(null);
  useEffect(() => {
    try { const g = JSON.parse(localStorage.getItem(`estudio-viral:paneles:${clave}`) || "null"); if (g?.izq && g?.der) setDeseados({ izq: g.izq, der: g.der }); } catch {}
  }, [clave]);
  useEffect(() => () => ro.current?.disconnect(), []);
  // Se pone en el contenedor de los paneles (.sd-workspace) para medir su ancho real.
  const ref = useCallback((el: HTMLElement | null) => {
    ro.current?.disconnect();
    if (!el || typeof ResizeObserver === "undefined") return;
    ro.current = new ResizeObserver(([e]) => setDisponible(e.contentRect.width));
    ro.current.observe(el);
  }, []);
  const anchos = useMemo(() => ajustarAnchos(deseados, disponible), [deseados, disponible]);
  const cambiar = useCallback((lado: keyof Anchos, v: number) => setDeseados(prev => {
    const ef = ajustarAnchos({ ...prev, [lado]: v }, disponible);
    const next = { izq: ef.izq, der: ef.der };
    try { localStorage.setItem(`estudio-viral:paneles:${clave}`, JSON.stringify(next)); } catch {}
    return next;
  }), [clave, disponible]);
  const estilo = { ["--sd-izq" as any]: `${anchos.izq}px`, ["--sd-der" as any]: `${anchos.der}px` } as CSSProperties;
  return { anchos, cambiar, estilo, ref };
}

// lado "izq": arrastrar a la derecha agranda el panel izquierdo; lado "der": arrastrar a la izquierda agranda el derecho.
export function Divisor({ lado, valor, max, onCambio, etiqueta }: { lado: "izq" | "der"; valor: number; max: number; onCambio: (v: number) => void; etiqueta: string }) {
  const inicio = useRef<{ x: number; v: number } | null>(null);
  const [activo, setActivo] = useState(false);
  const signo = lado === "izq" ? 1 : -1;
  const min = LIM[lado][0];
  const soltar = () => { inicio.current = null; setActivo(false); document.body.style.userSelect = ""; };
  return <div role="separator" aria-orientation="vertical" aria-label={etiqueta} aria-valuenow={valor} aria-valuemin={min} aria-valuemax={max} tabIndex={0}
    className="sd-divisor" data-activo={activo}
    onPointerDown={e => { e.preventDefault(); (e.target as HTMLElement).setPointerCapture(e.pointerId); inicio.current = { x: e.clientX, v: valor }; setActivo(true); document.body.style.userSelect = "none"; }}
    onPointerMove={e => { if (inicio.current) onCambio(inicio.current.v + signo * (e.clientX - inicio.current.x)); }}
    onPointerUp={soltar} onPointerCancel={soltar}
    onDoubleClick={() => onCambio(lado === "izq" ? 260 : 320)}
    onKeyDown={e => {
      const paso = e.shiftKey ? 48 : 16;
      if (e.key === "ArrowLeft") { e.preventDefault(); onCambio(valor - signo * paso); }
      else if (e.key === "ArrowRight") { e.preventDefault(); onCambio(valor + signo * paso); }
      else if (e.key === "Home") { e.preventDefault(); onCambio(min); }
      else if (e.key === "End") { e.preventDefault(); onCambio(max); }
    }} />;
}
