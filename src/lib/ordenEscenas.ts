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

// Duplicar una escena justo después de ella: las siguientes suben un número (y con ellas sus revisiones y
// archivos, vía el mapa). La copia nace sin revisión ni archivos: hay que generarla y revisarla.
export function duplicarEscena(out: any, n: number): { out: any; mapa: Mapa; nueva: number } | null {
  const scenes: any[] = Array.isArray(out?.scenes) ? out.scenes : [];
  const i = scenes.findIndex(s => s.n === n);
  if (i < 0) return null;
  const mapa: Mapa = {};
  scenes.forEach((s, k) => { mapa[s.n] = k <= i ? k + 1 : k + 2; });
  const copia = { ...scenes[i], title: `${scenes[i].title || `Escena ${n}`} (copia)` };
  const nuevas = [...scenes.slice(0, i + 1), copia, ...scenes.slice(i + 1)].map((s, k) => ({ ...s, n: k + 1 }));
  const dup = (arr: any[] | undefined) => (Array.isArray(arr) && arr.length === scenes.length ? [...arr.slice(0, i + 1), arr[i], ...arr.slice(i + 1)] : arr);
  const bloques = Array.isArray(out?.scriptBlocks) && out.scriptBlocks.length === scenes.length ? dup(out.scriptBlocks)!.map((b: any, k: number) => ({ ...b, block: k + 1 })) : out?.scriptBlocks;
  return {
    mapa, nueva: i + 2,
    out: {
      ...out, scenes: nuevas,
      ...(out?.guionJson ? { guionJson: { ...out.guionJson, clips: dup(out.guionJson.clips) } } : {}),
      ...(bloques ? { scriptBlocks: bloques } : {}),
      ...(Array.isArray(out?.dolaSceneNumbers) ? { dolaSceneNumbers: out.dolaSceneNumbers.map((x: number) => mapa[x] ?? x) } : {}),
    },
  };
}

// Cambiar campos de una escena (edición en el inspector). Si cambia la frase, también el diálogo del montaje.
export function editarEscena(out: any, n: number, cambios: Record<string, any>) {
  const scenes: any[] = Array.isArray(out?.scenes) ? out.scenes : [];
  const i = scenes.findIndex(s => s.n === n);
  if (i < 0) return out;
  const nueva = { ...scenes[i], ...cambios };
  const clips = out?.guionJson?.clips;
  const clipsNuevos = ("line" in cambios || "speaker" in cambios) && Array.isArray(clips) && clips.length === scenes.length
    ? clips.map((c: any, k: number) => (k === i ? [[nueva.speaker, nueva.line]] : c)) : clips;
  return { ...out, scenes: scenes.map((s, k) => (k === i ? nueva : s)), ...(out?.guionJson ? { guionJson: { ...out.guionJson, clips: clipsNuevos } } : {}) };
}
