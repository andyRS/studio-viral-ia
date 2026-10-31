"use client";
// Deshacer/rehacer por operación + estado de guardado, sobre una cola que aplica cada operación al último
// estado guardado (ver cola.ts y operaciones.ts).
import { useCallback, useRef, useState } from "react";
import type { Mapa } from "@/lib/ordenEscenas";
import type { Resultado } from "./cola";
import { esAplicada, type Aplicada, type Op } from "./operaciones";

export type Aplicar<T> = (fn: (base: T) => Resultado<T, Mapa>) => Promise<T | null>;
export type EstadoGuardado = { estado: "" | "guardando" | "guardado" | "error"; texto: string };

export function useOperaciones<T>(aplicar: Aplicar<T>) {
  const [estado, setEstado] = useState<EstadoGuardado>({ estado: "", texto: "" });
  const deshacerRef = useRef<Op<T>[]>([]);
  const rehacerRef = useRef<Op<T>[]>([]);
  const enCurso = useRef(0);
  const [, forzar] = useState(0);
  const ejecutar = useCallback(async (op: Op<T>, origen?: "deshacer" | "rehacer") => {
    let hecha: Aplicada<T> | null = null; let motivo = "";
    enCurso.current++; setEstado({ estado: "guardando", texto: "Guardando…" });
    try {
      await aplicar(base => {
        const r = op(base);
        if (!r) return null;
        if (!esAplicada(r)) { motivo = r.motivo; return null; }
        hecha = r; return { valor: r.valor, meta: r.mapa };
      });
      const h = hecha as Aplicada<T> | null;
      if (!h) { setEstado(motivo ? { estado: "error", texto: motivo } : { estado: "", texto: "" }); return null; }
      if (origen === "deshacer") rehacerRef.current.push(h.inversa);
      else { deshacerRef.current = [...deshacerRef.current, h.inversa].slice(-30); if (!origen) rehacerRef.current = []; }
      setEstado({ estado: "guardado", texto: `Guardado · ${origen ? `${origen} ` : ""}${h.etiqueta}` });
      return h;
    } catch (e: any) {
      setEstado({ estado: "error", texto: `No se guardó (${e?.message || e}). Nada cambió.` });
      return null;
    } finally { enCurso.current--; forzar(x => x + 1); }
  }, [aplicar]);
  const deshacer = useCallback(() => { const op = deshacerRef.current.pop(); if (op) void ejecutar(op, "deshacer"); }, [ejecutar]);
  const rehacer = useCallback(() => { const op = rehacerRef.current.pop(); if (op) void ejecutar(op, "rehacer"); }, [ejecutar]);
  return { estado, ejecutar, deshacer, rehacer, puedeDeshacer: deshacerRef.current.length > 0, puedeRehacer: rehacerRef.current.length > 0 };
}

// Espera a que React pinte el estado nuevo (p. ej. revisiones recién renumeradas) antes de la operación siguiente.
export const despuesDePintar = () => new Promise<void>(r => (typeof requestAnimationFrame === "function" ? requestAnimationFrame(() => setTimeout(r, 0)) : setTimeout(r, 0)));
