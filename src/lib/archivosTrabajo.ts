"use client";
// Archivos de trabajo del episodio (clips e imágenes de cada escena) guardados en ESTE navegador
// (IndexedDB), por usuario y episodio. Así una recarga no obliga a subir otra vez 20 clips.
// No es almacenamiento en la nube (gratis y sin límite de 50 MB por archivo): si se cambia de navegador
// o se borran los datos del sitio, hay que volver a subirlos. Se limpian solos a los 30 días sin uso.
export type Clase = "image" | "clip";
type Registro = { clave: string; usuario: string; episodio: string; clase: Clase; n: number; nombre: string; tipo: string; blob: Blob; at: number };

const DB = "estudio-viral-archivos", ST = "archivos";
export const DIAS_RETENCION = 30;

function abrir(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    if (typeof indexedDB === "undefined") return rej(new Error("Este navegador no permite guardar archivos (IndexedDB no disponible)."));
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { const s = r.result.createObjectStore(ST, { keyPath: "clave" }); s.createIndex("episodio", ["usuario", "episodio"]); s.createIndex("at", "at"); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
const tx = async <T,>(modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> => {
  const db = await abrir();
  return new Promise((res, rej) => {
    const t = db.transaction(ST, modo); const s = t.objectStore(ST);
    const req = fn(s);
    t.oncomplete = () => res(req ? (req as IDBRequest<T>).result : undefined);
    t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error("Sin espacio para guardar el archivo en el navegador."));
  });
};
const claveDe = (usuario: string, episodio: string, clase: Clase, n: number) => `${usuario}|${episodio}|${clase}|${n}`;

// Pide al navegador que no borre estos datos por falta de espacio (si lo concede).
export async function pedirPersistencia() { try { return (await navigator.storage?.persist?.()) ?? false; } catch { return false; } }
export async function espacio() {
  try { const e = await navigator.storage?.estimate?.(); return e ? { usado: e.usage || 0, cuota: e.quota || 0 } : null; } catch { return null; }
}

export async function guardarArchivo(usuario: string, episodio: string, clase: Clase, n: number, file: File) {
  const r: Registro = { clave: claveDe(usuario, episodio, clase, n), usuario, episodio, clase, n, nombre: file.name, tipo: file.type, blob: file, at: Date.now() };
  await tx("readwrite", s => s.put(r));
}
export async function quitarArchivo(usuario: string, episodio: string, clase: Clase, n: number) {
  await tx("readwrite", s => s.delete(claveDe(usuario, episodio, clase, n)));
}
export async function cargarArchivos(usuario: string, episodio: string) {
  const regs = (await tx<Registro[]>("readonly", s => s.index("episodio").getAll([usuario, episodio]))) || [];
  const out: Record<Clase, Record<number, File>> = { image: {}, clip: {} };
  for (const r of regs) out[r.clase][r.n] = new File([r.blob], r.nombre, { type: r.tipo });
  if (regs.length) await tx("readwrite", s => { for (const r of regs) s.put({ ...r, at: Date.now() }); });   // marca de uso: no caducan mientras se usan
  return out;
}
export async function borrarEpisodio(usuario: string, episodio: string) {
  const regs = (await tx<Registro[]>("readonly", s => s.index("episodio").getAll([usuario, episodio]))) || [];
  await tx("readwrite", s => { for (const r of regs) s.delete(r.clave); });
  return regs.length;
}
// Borra lo que lleva más de DIAS_RETENCION días sin abrirse. Devuelve cuántos archivos quitó.
export async function limpiarViejos(dias = DIAS_RETENCION) {
  const limite = Date.now() - dias * 86400000;
  const viejos = (await tx<Registro[]>("readonly", s => s.index("at").getAll(IDBKeyRange.upperBound(limite)))) || [];
  if (viejos.length) await tx("readwrite", s => { for (const r of viejos) s.delete(r.clave); });
  return viejos.length;
}

// Al mover escenas: cada archivo pasa al número nuevo de su escena (mapa viejo → nuevo).
export async function renumerarArchivos(usuario: string, episodio: string, mapa: Record<number, number>) {
  const regs = (await tx<Registro[]>("readonly", s => s.index("episodio").getAll([usuario, episodio]))) || [];
  await tx("readwrite", s => {
    for (const r of regs) s.delete(r.clave);
    for (const r of regs) { const n = mapa[r.n] ?? r.n; s.put({ ...r, n, clave: claveDe(usuario, episodio, r.clase, n) }); }
  });
}
