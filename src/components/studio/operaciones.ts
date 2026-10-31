// Operaciones reversibles de los directores. Cada operación se aplica sobre el estado ACTUAL y devuelve su
// inversa, que solo deshace lo que ella cambió (un campo, un movimiento, una copia). Deshacer ya no
// restaura una copia completa del proyecto, así que no borra lo guardado después por otros caminos
// (p. ej. el editor de guion).
import { findNode, mapNode, snapshot, type Outline } from "@/lib/outline";
import { duplicarEscena, editarEscena, moverEscenaCorta, type Mapa } from "@/lib/ordenEscenas";
import { moverEscenaLarga } from "./outlineOrder";

const igual = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
export type Aplicada<T> = { valor: T; inversa: Op<T>; etiqueta: string; mapa?: Mapa };
export type Op<T> = (base: T) => Aplicada<T> | { motivo: string } | null;
export const esAplicada = <T,>(r: ReturnType<Op<T>>): r is Aplicada<T> => !!r && "valor" in r;

// ---------- Proyecto largo ----------
export const opEditarLarga = (id: string, campo: string, valor: unknown): Op<Outline> => o => {
  const n: any = findNode(o, id)?.node;
  if (!n || igual(n[campo], valor)) return null;
  const antes = n[campo];
  return { valor: mapNode(o, id, x => ({ ...x, [campo]: valor })), inversa: opEditarLarga(id, campo, antes), etiqueta: `${campo} de «${n.heading || n.title}»` };
};
export const opMoverLarga = (id: string, a: number, version = true): Op<Outline> => o => {
  const f = findNode(o, id); if (!f?.seq) return { motivo: "No se encontró la escena." };
  const i = f.seq.scenes.findIndex(s => s.id === id);
  const r = moverEscenaLarga(o, id, a);
  if (!r.movida) return r.motivo ? { motivo: r.motivo } : null;
  return { valor: version ? snapshot(r.outline, `Antes de mover «${f.node.heading}»`) : r.outline, inversa: opMoverLarga(id, i, false), etiqueta: "mover escena" };
};
// Mover relativo (±1): el destino se calcula sobre el estado actual, no sobre el del render en que se pidió.
export const opDesplazarLarga = (id: string, delta: number): Op<Outline> => o => {
  const f = findNode(o, id); if (!f?.seq) return { motivo: "No se encontró la escena." };
  const i = f.seq.scenes.findIndex(s => s.id === id);
  return opMoverLarga(id, i + delta)(o);
};
export const opCandadoLarga = (id: string, locked: boolean): Op<Outline> => o => {
  const n: any = findNode(o, id)?.node; if (!n || !!n.locked === locked) return null;
  return { valor: mapNode(o, id, x => ({ ...x, locked })), inversa: opCandadoLarga(id, !locked), etiqueta: locked ? "bloquear" : "desbloquear" };
};

// ---------- Episodio corto (escenas numeradas) ----------
export const opEditarCorta = (n: number, campo: string, valor: unknown): Op<any> => out => {
  const s = (out?.scenes || []).find((x: any) => x.n === n);
  if (!s || igual(s[campo] ?? "", valor ?? "")) return null;
  const antes = s[campo];
  return { valor: editarEscena(out, n, { [campo]: valor }), inversa: opEditarCorta(n, campo, antes), etiqueta: `${campo} de la escena ${n}` };
};
export const opMoverCorta = (n: number, a: number): Op<any> => out => {
  const r = moverEscenaCorta(out, n, a); if (!r) return null;
  return { valor: r.out, mapa: r.mapa, inversa: opMoverCorta(a, n), etiqueta: `escena ${n} → posición ${a}` };
};
export const opDuplicarCorta = (n: number): Op<any> => out => {
  const r = duplicarEscena(out, n); if (!r) return null;
  return { valor: r.out, mapa: r.mapa, inversa: opQuitarCorta(r.nueva, n), etiqueta: `duplicar escena ${n}` };
};
// Quita la escena `n` (la copia de un duplicado). Sus revisiones y archivos quedan huérfanos (número 0),
// nunca pasan a la escena siguiente. `origen` permite rehacer la duplicación.
export const opQuitarCorta = (n: number, origen: number): Op<any> => out => {
  const scenes: any[] = out?.scenes || [];
  const i = scenes.findIndex(s => s.n === n); if (i < 0) return null;
  const mapa: Mapa = {};
  scenes.forEach((s, k) => { mapa[s.n] = k < i ? k + 1 : k === i ? 0 : k; });
  const quitar = (arr: any[] | undefined) => (Array.isArray(arr) && arr.length === scenes.length ? arr.filter((_, k) => k !== i) : arr);
  const valor = {
    ...out, scenes: scenes.filter((_, k) => k !== i).map((s, k) => ({ ...s, n: k + 1 })),
    ...(out?.guionJson ? { guionJson: { ...out.guionJson, clips: quitar(out.guionJson.clips) } } : {}),
    ...(Array.isArray(out?.scriptBlocks) && out.scriptBlocks.length === scenes.length ? { scriptBlocks: quitar(out.scriptBlocks)!.map((b: any, k: number) => ({ ...b, block: k + 1 })) } : {}),
    ...(Array.isArray(out?.dolaSceneNumbers) ? { dolaSceneNumbers: out.dolaSceneNumbers.filter((x: number) => x !== n).map((x: number) => mapa[x] || x) } : {}),
  };
  return { valor, mapa, inversa: opDuplicarCorta(origen), etiqueta: `quitar la copia de la escena ${origen}` };
};
