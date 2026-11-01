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
  const prueba = moverEscenaLarga(o, id, a);
  if (!prueba.movida) return prueba.motivo ? { motivo: prueba.motivo } : null;
  // La versión del historial guarda el proyecto ANTES de mover (snapshot primero, cambio después).
  const r = version ? moverEscenaLarga(snapshot(o, `Antes de mover «${f.node.heading}»`), id, a) : prueba;
  return { valor: r.outline, inversa: opMoverLarga(id, i, false), etiqueta: "mover escena" };
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

// Trasladar una escena a otra secuencia del MISMO acto, delante de `beforeSceneId` (o al final si es null).
// Se valida todo sobre el proyecto actual al ejecutarse (no sobre lo que vio el diálogo): acto, origen,
// destino, ancla y candados. La escena es el mismo objeto (id, guion, tomas, historial y escenario).
// La inversa la devuelve a su secuencia original, delante de la escena que tenía detrás.
export type Traslado = { sceneId: string; sourceSequenceId: string; targetSequenceId: string; beforeSceneId: string | null };
export const opTrasladarLarga = (t: Traslado, restaurar = false): Op<Outline> => o => {
  const act = o.acts.find(a => a.sequences.some(q => q.id === t.sourceSequenceId));
  const origen = act?.sequences.find(q => q.id === t.sourceSequenceId);
  const destino = act?.sequences.find(q => q.id === t.targetSequenceId);
  if (!act || !origen) return { motivo: "La secuencia de origen ya no existe." };
  const i = origen.scenes.findIndex(s => s.id === t.sceneId);
  if (i < 0) return { motivo: "La escena ya no está en esa secuencia (pudo moverse en otra ventana). Vuelve a abrir el traslado." };
  if (!destino) return { motivo: "La secuencia de destino no existe o pertenece a otro acto." };
  if (destino.id === origen.id) return { motivo: "Elige una secuencia distinta de la de origen." };
  const escena = origen.scenes[i];
  if (act.locked) return { motivo: "El acto está bloqueado: desbloquéalo para cambiar escenas de secuencia." };
  if (origen.locked || destino.locked) return { motivo: "La secuencia de origen o la de destino está bloqueada." };
  if (escena.locked) return { motivo: "La escena está bloqueada: desbloquéala para trasladarla." };
  if (!restaurar && destino.scenes.some(s => s.locked)) return { motivo: "La secuencia de destino tiene escenas bloqueadas: desbloquéalas antes de insertar otra entre ellas." };
  const j = t.beforeSceneId ? destino.scenes.findIndex(s => s.id === t.beforeSceneId) : destino.scenes.length;
  if (j < 0) return { motivo: "La escena de referencia del destino ya no existe. Elige otra posición." };
  const despues = origen.scenes[i + 1]?.id ?? null;
  const nuevasDestino = [...destino.scenes.slice(0, j), escena, ...destino.scenes.slice(j)];
  // Historial: la versión guarda el proyecto ANTES del traslado (al deshacer no se añade otra).
  const b = restaurar ? o : snapshot(o, `Antes de trasladar «${escena.heading}» a «${destino.title}»`);
  const valor: Outline = { ...b, acts: o.acts.map(a => a.id !== act.id ? a : { ...a, sequences: a.sequences.map(q =>
    q.id === origen.id ? { ...q, scenes: q.scenes.filter(s => s.id !== escena.id) } : q.id === destino.id ? { ...q, scenes: nuevasDestino } : q) }) };
  return {
    valor,
    inversa: opTrasladarLarga({ sceneId: escena.id, sourceSequenceId: destino.id, targetSequenceId: origen.id, beforeSceneId: despues }, !restaurar),
    etiqueta: restaurar ? `devolver «${escena.heading}» a «${destino.title}»` : `trasladar «${escena.heading}» a «${destino.title}»`,
  };
};
