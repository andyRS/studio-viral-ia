// Deshacer/rehacer por operación, sin React (probado en tests/directores.test.ts).
// - Cada operación aplicada deja su inversa en «deshacer»; deshacerla deja la directa en «rehacer».
// - Si un deshacer/rehacer FALLA al guardar, o no puede aplicarse ahora (p. ej. una escena bloqueada),
//   la acción vuelve a su pila: el usuario puede reintentarla. Solo se descarta si ya no cambia nada.
// - Un deshacer/rehacer a la vez: mientras uno guarda, los siguientes esperan su turno (no se piden),
//   así una acción devuelta a la pila no queda desordenada respecto de otra.
import type { Mapa } from "@/lib/ordenEscenas";
import type { Resultado } from "./cola";
import { esAplicada, type Aplicada, type Op } from "./operaciones";

export type Aplicar<T> = (fn: (base: T) => Resultado<T, Mapa>) => Promise<T | null>;
export type Efecto<T> = { hecha?: Aplicada<T>; motivo?: string; error?: unknown; ocupado?: boolean };

export function crearHistorial<T>(aplicar: () => Aplicar<T>, maximo = 30) {
  const pilaDeshacer: Op<T>[] = [];
  const pilaRehacer: Op<T>[] = [];
  let historialEnCurso = false;

  async function ejecutar(op: Op<T>, origen?: "deshacer" | "rehacer"): Promise<Efecto<T>> {
    let hecha: Aplicada<T> | null = null; let motivo = "";
    const devolver = () => { if (origen === "deshacer") pilaDeshacer.push(op); else if (origen === "rehacer") pilaRehacer.push(op); };
    try {
      await aplicar()(base => {
        const r = op(base);
        if (!r) return null;
        if (!esAplicada(r)) { motivo = r.motivo; return null; }
        hecha = r; return { valor: r.valor, meta: r.mapa };
      });
    } catch (error) { devolver(); return { error }; }
    const h = hecha as Aplicada<T> | null;
    if (!h) { if (motivo) devolver(); return { motivo }; }
    if (origen === "deshacer") pilaRehacer.push(h.inversa);
    else {
      pilaDeshacer.push(h.inversa);
      if (pilaDeshacer.length > maximo) pilaDeshacer.splice(0, pilaDeshacer.length - maximo);
      if (!origen) pilaRehacer.length = 0;
    }
    return { hecha: h };
  }
  async function desdePila(pila: Op<T>[], origen: "deshacer" | "rehacer"): Promise<Efecto<T>> {
    if (historialEnCurso) return { ocupado: true };
    const op = pila.pop(); if (!op) return {};
    historialEnCurso = true;
    try { return await ejecutar(op, origen); } finally { historialEnCurso = false; }
  }
  return {
    ejecutar: (op: Op<T>) => ejecutar(op),
    deshacer: () => desdePila(pilaDeshacer, "deshacer"),
    rehacer: () => desdePila(pilaRehacer, "rehacer"),
    get puedeDeshacer() { return pilaDeshacer.length > 0 && !historialEnCurso; },
    get puedeRehacer() { return pilaRehacer.length > 0 && !historialEnCurso; },
    get ocupado() { return historialEnCurso; },
  };
}
