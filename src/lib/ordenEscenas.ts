// Mover una escena de un episodio corto sin romper lo que depende de su número: las escenas se
// renumeran (s01, s02…) y con ellas el diálogo del montaje (guionJson.clips), los bloques del guion,
// las escenas elegidas para Dola, las revisiones de clips (clipChecks.clipIndex) y los archivos
// guardados en el navegador. Devuelve el mapa número viejo → nuevo para aplicarlo fuera.
export type Mapa = Record<number, number>;

export function moverEscenaCorta(out: any, desde: number, hasta: number): { out: any; mapa: Mapa } | null {
  const scenes: any[] = Array.isArray(out?.scenes) ? out.scenes : [];
  const i = scenes.findIndex(s => s.n === desde), j = Math.max(0, Math.min(scenes.length - 1, hasta - 1));
  if (i < 0 || i === j) return null;
  const orden = scenes.map((_, k) => k);
  const [x] = orden.splice(i, 1); orden.splice(j, 0, x);
  const mapa: Mapa = {};
  orden.forEach((viejo, nuevo) => { mapa[scenes[viejo].n] = nuevo + 1; });
  const nuevas = orden.map((viejo, nuevo) => ({ ...scenes[viejo], n: nuevo + 1 }));
  const reordenar = (arr: any[] | undefined) => (Array.isArray(arr) && arr.length === scenes.length ? orden.map(k => arr[k]) : arr);
  const clips = reordenar(out?.guionJson?.clips);
  const bloques = Array.isArray(out?.scriptBlocks) && out.scriptBlocks.length === scenes.length
    ? orden.map((k, nuevo) => ({ ...out.scriptBlocks[k], block: nuevo + 1 })) : out?.scriptBlocks;
  return {
    mapa,
    out: {
      ...out, scenes: nuevas,
      ...(out?.guionJson ? { guionJson: { ...out.guionJson, clips } } : {}),
      ...(bloques ? { scriptBlocks: bloques } : {}),
      ...(Array.isArray(out?.dolaSceneNumbers) ? { dolaSceneNumbers: out.dolaSceneNumbers.map((n: number) => mapa[n] ?? n).sort((a: number, b: number) => a - b) } : {}),
    },
  };
}

// Revisiones de clips a cambiar: [{ id, clipIndex nuevo }] (clipIndex = n - 1).
export function remapRevisiones(checks: { id: string; clipIndex: number }[], mapa: Mapa) {
  return checks.map(c => ({ id: c.id, de: c.clipIndex, a: (mapa[c.clipIndex + 1] ?? c.clipIndex + 1) - 1 })).filter(c => c.de !== c.a);
}
