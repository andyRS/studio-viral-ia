"use client";
// Deshacer/rehacer por operación + estado de guardado (envoltorio React de historial.ts), sobre una cola que
// aplica cada operación al último estado guardado (ver cola.ts y operaciones.ts).
import { useCallback, useMemo, useRef, useState } from "react";
import { crearHistorial, type Aplicar, type Efecto } from "./historial";
import type { Op } from "./operaciones";

export type { Aplicar };
export type EstadoGuardado = { estado: "" | "guardando" | "guardado" | "error"; texto: string };

export function useOperaciones<T>(aplicar: Aplicar<T>) {
  const [estado, setEstado] = useState<EstadoGuardado>({ estado: "", texto: "" });
  const [, forzar] = useState(0);
  const aplicarRef = useRef(aplicar); aplicarRef.current = aplicar;
  const historial = useMemo(() => crearHistorial<T>(() => aplicarRef.current), []);
  const informar = useCallback((r: Efecto<T>, origen?: "deshacer" | "rehacer") => {
    if (r.ocupado) setEstado({ estado: "guardando", texto: "Espera: aún se está guardando el paso anterior." });
    else if (r.error) setEstado({ estado: "error", texto: `No se guardó (${(r.error as any)?.message || r.error}). ${origen ? `Puedes volver a intentar ${origen}.` : "Nada cambió."}` });
    else if (r.motivo) setEstado({ estado: "error", texto: origen ? `${r.motivo} (la acción sigue disponible para ${origen})` : r.motivo });
    else if (r.hecha) setEstado({ estado: "guardado", texto: `Guardado · ${origen ? `${origen} ` : ""}${r.hecha.etiqueta}` });
    else setEstado({ estado: "", texto: "" });
    forzar(x => x + 1);
    return r.hecha || null;
  }, []);
  const ejecutar = useCallback(async (op: Op<T>) => {
    setEstado({ estado: "guardando", texto: "Guardando…" });
    return informar(await historial.ejecutar(op));
  }, [historial, informar]);
  const deshacer = useCallback(async () => {
    if (historial.puedeDeshacer) { setEstado({ estado: "guardando", texto: "Deshaciendo…" }); forzar(x => x + 1); }
    informar(await historial.deshacer(), "deshacer");
  }, [historial, informar]);
  const rehacer = useCallback(async () => {
    if (historial.puedeRehacer) { setEstado({ estado: "guardando", texto: "Rehaciendo…" }); forzar(x => x + 1); }
    informar(await historial.rehacer(), "rehacer");
  }, [historial, informar]);
  const deshacerYa = useCallback(() => { void deshacer(); }, [deshacer]);
  const rehacerYa = useCallback(() => { void rehacer(); }, [rehacer]);
  return { estado, ejecutar, deshacer: deshacerYa, rehacer: rehacerYa, puedeDeshacer: historial.puedeDeshacer, puedeRehacer: historial.puedeRehacer };
}

// Espera a que React pinte el estado nuevo (p. ej. revisiones recién renumeradas) antes de la operación siguiente.
export const despuesDePintar = () => new Promise<void>(r => (typeof requestAnimationFrame === "function" ? requestAnimationFrame(() => setTimeout(r, 0)) : setTimeout(r, 0)));
