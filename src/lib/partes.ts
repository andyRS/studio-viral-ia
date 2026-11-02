// Película larga (más de 80 tomas): el montaje del PC trabaja en partes de hasta 80 clips y al final las une
// sin recodificar («Unir los actos»). Aquí se decide dónde cortar y qué guion lleva cada parte.
export const MAX_CLIPS_PARTE = 80;
export type Parte = { k: number; desde: number; hasta: number };   // clips [desde, hasta), índices desde 0

// Corta en partes iguales de como mucho `max` clips; si hay un cambio de secuencia (transición o tarjeta)
// cerca del corte ideal, corta ahí: así la unión cae en un paso por negro y no en mitad de una escena.
export function partesDeMontaje(total: number, cortes: number[] = [], max = MAX_CLIPS_PARTE): Parte[] {
  if (total <= max) return [{ k: 0, desde: 0, hasta: total }];
  const n = Math.ceil(total / max);
  const buenos = Array.from(new Set(cortes.map(Number).filter(c => Number.isInteger(c) && c > 0 && c < total))).sort((a, b) => a - b);
  const limites = [0];
  for (let i = 1; i < n; i++) {
    const prev = limites[i - 1];
    const ideal = Math.round((total * i) / n);
    const restantes = n - i;                                     // partes que quedan después de este corte
    const minimo = Math.max(prev + 10, total - restantes * max); // que lo que queda quepa
    const maximo = Math.min(prev + max, total - restantes * 10);
    const cerca = buenos.filter(c => c >= minimo && c <= maximo && Math.abs(c - ideal) <= Math.max(6, Math.round(max * 0.15)));
    const corte = cerca.length ? cerca.reduce((a, b) => Math.abs(b - ideal) < Math.abs(a - ideal) ? b : a) : Math.min(maximo, Math.max(minimo, ideal));
    limites.push(corte);
  }
  limites.push(total);
  return limites.slice(0, -1).map((d, k) => ({ k, desde: d, hasta: limites[k + 1] }));
}

// Guion de una parte: solo sus clips, con todo lo que apunta a un clip (tarjetas, transiciones, tiempos,
// recursos, pantallas…) renumerado desde 0. El título va solo en la primera parte y la tarjeta final en la última.
export function guionDeParte(g: any, p: Parte, totalPartes: number) {
  const dentro = (i: unknown) => Number.isInteger(Number(i)) && Number(i) >= p.desde && Number(i) < p.hasta;
  const mover = (i: unknown) => Number(i) - p.desde;
  const out: any = { ...g, clips: (Array.isArray(g?.clips) ? g.clips : []).slice(p.desde, p.hasta), parte_pelicula: p.k + 1, partes_pelicula: totalPartes };
  // Una tarjeta o transición justo en el corte (antes = desde) no se dibuja: esa parte empieza ahí.
  out.tarjetas = (g?.tarjetas || []).filter((t: any) => dentro(t.antes) && Number(t.antes) > p.desde).map((t: any) => ({ ...t, antes: mover(t.antes) }));
  out.transiciones = (g?.transiciones || []).filter((t: any) => dentro(t.antes) && Number(t.antes) > p.desde).map((t: any) => ({ ...t, antes: mover(t.antes) }));
  if (Array.isArray(g?.tiempos)) out.tiempos = g.tiempos.filter((t: any) => dentro(t.clip)).map((t: any) => ({ ...t, clip: mover(t.clip) }));
  if (Array.isArray(g?.recursos_plan)) out.recursos_plan = g.recursos_plan.filter((r: any) => dentro(r.clip)).map((r: any) => ({ ...r, clip: mover(r.clip) }));
  if (Array.isArray(g?.pantallas)) out.pantallas = g.pantallas.filter((x: any) => dentro(x.clip)).map((x: any) => ({ ...x, clip: mover(x.clip) }));
  if (Array.isArray(g?.telefono)) out.telefono = g.telefono.filter(dentro).map(mover);
  if (dentro(g?.titulo_tras)) out.titulo_tras = mover(g.titulo_tras); else delete out.titulo_tras;
  if (p.k > 0) { delete out.titulo_pelicula; delete out.titulo_tras; out.gancho = []; }   // la película ya empezó
  if (p.k < totalPartes - 1) delete out.cierre;                                          // «FIN» solo al final
  return out;
}
