// Orden de escenas del proyecto largo dentro de su secuencia. Conserva ids, guion, tomas e historial;
// no mueve ni atraviesa piezas bloqueadas (escena, secuencia o acto con candado).
import type { Outline } from "@/lib/outline";

export function moverEscenaLarga(o: Outline, sceneId: string, a: number): { outline: Outline; movida: boolean; motivo?: string } {
  for (const act of o.acts) for (const seq of act.sequences) {
    const i = seq.scenes.findIndex(s => s.id === sceneId);
    if (i < 0) continue;
    const j = Math.max(0, Math.min(seq.scenes.length - 1, a));
    if (i === j) return { outline: o, movida: false };
    if (act.locked || seq.locked) return { outline: o, movida: false, motivo: "La secuencia o el acto están bloqueados." };
    if (seq.scenes.slice(Math.min(i, j), Math.max(i, j) + 1).some(s => s.locked)) return { outline: o, movida: false, motivo: "Desbloquea las escenas antes de moverlas o atravesarlas." };
    const escenas = [...seq.scenes]; escenas.splice(j, 0, escenas.splice(i, 1)[0]);
    return {
      movida: true,
      outline: { ...o, acts: o.acts.map(x => x.id !== act.id ? x : { ...x, sequences: x.sequences.map(q => q.id !== seq.id ? q : { ...q, scenes: escenas }) }) },
    };
  }
  return { outline: o, movida: false, motivo: "No se encontró la escena." };
}
