"use client";
// Almacenamiento del navegador. `save` ya no se calla los fallos: devuelve si se guardó y por qué no
// (cuota llena, almacenamiento denegado). Si localStorage no cabe, la copia va a IndexedDB (mucho más
// espacio) y `loadAsync` la recupera al abrir. Así una imagen grande no deja la pantalla «guardada» en falso.
const PRE = "estudio-viral:";

// Sin strictNullChecks, TypeScript no distingue la unión por `ok`: por eso los campos de error son opcionales.
export type ResultadoGuardado = { ok: boolean; donde?: "local" | "indexeddb"; motivo?: "cuota" | "denegado" | "otro"; mensaje?: string };

export function load<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { const v = localStorage.getItem(PRE + key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}

function motivoDe(e: any): "cuota" | "denegado" | "otro" {
  const n = `${e?.name ?? ""} ${e?.message ?? ""}`;
  if (/Quota|exceeded|NS_ERROR_DOM_QUOTA/i.test(n) || e?.code === 22 || e?.code === 1014) return "cuota";
  if (/Security|denied|disabled|access/i.test(n)) return "denegado";
  return "otro";
}

export function saveSync(key: string, value: any): ResultadoGuardado {
  if (typeof window === "undefined") return { ok: false, motivo: "otro", mensaje: "sin navegador" };
  try {
    localStorage.setItem(PRE + key, JSON.stringify(value));
    void idbDel(key);   // la copia grande, si había, ya no hace falta
    return { ok: true, donde: "local" };
  } catch (e: any) {
    return { ok: false, motivo: motivoDe(e), mensaje: e?.message || String(e) };
  }
}

// Guarda en localStorage y, si no cabe o está bloqueado, en IndexedDB. Devuelve dónde quedó (o por qué no).
export async function save(key: string, value: any): Promise<ResultadoGuardado> {
  const r = saveSync(key, value);
  if (r.ok) return r;
  try {
    await idbPut(key, value);
    try { localStorage.removeItem(PRE + key); } catch {}   // que no quede una copia vieja más pequeña que gane al leer
    return { ok: true, donde: "indexeddb" };
  } catch (e: any) {
    return { ok: false, motivo: r.motivo, mensaje: `${r.mensaje} · IndexedDB: ${e?.message || e}` };
  }
}

// Lectura que también mira IndexedDB (donde van las colecciones que no cupieron en localStorage).
export async function loadAsync<T>(key: string, fallback: T): Promise<T> {
  try { const v = await idbGet(key); if (v !== undefined) return v as T; } catch {}
  return load(key, fallback);
}

// Solo lo que quedó en IndexedDB (undefined si no hay copia allí).
export async function loadIdb<T>(key: string): Promise<T | undefined> { try { return await idbGet(key); } catch { return undefined; } }

export function removeKey(key: string) { try { localStorage.removeItem(PRE + key); } catch {} void idbDel(key); }
export function hasKey(key: string) { try { return localStorage.getItem(PRE + key) !== null; } catch { return false; } }

// ---------- IndexedDB mínimo ----------
function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    if (typeof indexedDB === "undefined") return rej(new Error("IndexedDB no disponible"));
    const r = indexedDB.open("estudio-viral-respaldo", 1);
    r.onupgradeneeded = () => { r.result.createObjectStore("kv"); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function idbPut(key: string, value: any) {
  const db = await idb();
  await new Promise<void>((res, rej) => { const t = db.transaction("kv", "readwrite"); t.objectStore("kv").put(value, key); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
}
async function idbGet(key: string) {
  const db = await idb();
  return new Promise<any>((res, rej) => { const r = db.transaction("kv").objectStore("kv").get(key); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
async function idbDel(key: string) {
  try { const db = await idb(); db.transaction("kv", "readwrite").objectStore("kv").delete(key); } catch {}
}

export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
