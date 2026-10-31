"use client";
// ============================================================================
// Capa de datos de Estudio Viral.
//
// - CON SESIÓN (Supabase configurado + login): TODO se lee/escribe en
//   Supabase filtrando por user_id = auth.uid(). RLS también lo impone en la
//   base de datos (ver supabase/schema.sql).
// - SIN SESIÓN (o sin variables de Supabase): «modo sin login» con
//   localStorage y los datos de ejemplo (seed). La UI muestra siempre un
//   indicador visible del modo activo.
//
// Primer login: si las tablas del usuario están vacías, se siembran en SU
// cuenta las fórmulas base y la serie/personajes de ejemplo (solo una vez:
// en logins siguientes las tablas ya tienen filas y no se duplica nada).
// ============================================================================
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createClient, hasSupabase } from "./supabase/client";
import { hasKey, load, loadAsync, loadIdb, save, uid } from "./store";
import { COLLECTIONS, LOCAL_KEY_OF, OPTIONAL_TABLES, TABLE_OF, fromRow, toRow, type CollectionName } from "./db";
import { claveLocal, clasificarError, columnasCambiadas, esMigracionPendiente, explicarError, resolverChoque } from "./persistencia";
import { seedAccounts, seedFormulas } from "./seed";
import type { Outline } from "./outline";
import type { Account, AccountProfile, CalendarEntry, Character, ClipCheck, Cost, Episode, Formula, Metric, Product, ProductTest, ProductionCard, Series, ViralAnalysis } from "./types";

export type { CollectionName };

export interface DataState {
  accounts: Account[]; series: Series[]; characters: Character[]; formulas: Formula[];
  episodes: Episode[]; productionCards: ProductionCard[]; clipChecks: ClipCheck[]; costs: Cost[];
  calendarEntries: CalendarEntry[]; metrics: Metric[]; viralAnalyses: ViralAnalysis[];
  products: Product[]; productTests: ProductTest[]; accountProfiles: AccountProfile[]; storyOutlines: Outline[];
}

export type DataMode = "cargando" | "supabase" | "local";
/** Último guardado en el navegador que falló (cuota llena, almacenamiento bloqueado): los datos siguen en pantalla pero NO están guardados. */
export type FalloGuardado = { collection: CollectionName; motivo: "cuota" | "denegado" | "otro"; mensaje: string; at: string };
/** Dos ventanas cambiaron lo mismo: se muestra lo guardado y aquí queda el cambio propio para reaplicarlo o descartarlo. */
export type Conflicto = { id: string; collection: CollectionName; recordId: string; columnas: string[]; patch: any; at: string };
export class ConflictoError extends Error { constructor(public conflicto: Conflicto) { super("Otra ventana guardó cambios en lo mismo a la vez"); } }

interface DataCtx {
  mode: DataMode;
  userEmail: string | null;
  userId: string | null;
  error: string | null;
  data: DataState;
  insert: (collection: CollectionName, item: any) => Promise<any>;
  /** Envía solo las columnas que cambian; con la migración de revisiones detecta si otra ventana guardó antes (ConflictoError). */
  update: (collection: CollectionName, id: string, patch: any) => Promise<any>;
  remove: (collection: CollectionName, id: string) => Promise<void>;
  removeMany: (collection: CollectionName, ids: string[]) => Promise<void>;
  /** true si esa colección se guarda en el navegador porque su tabla aún no existe en Supabase. */
  isLocalOnly: (collection: CollectionName) => boolean;
  /** true si la tabla existe pero no respondió (red, tiempo, permisos): no se escribe en ella hasta reintentar. */
  isUnavailable: (collection: CollectionName) => boolean;
  falloGuardado: FalloGuardado | null;
  conflictos: Conflicto[];
  resolverConflicto: (id: string, opcion: "mio" | "servidor") => Promise<void>;
  /** Copias del navegador sin dueño (de antes de iniciar sesión o de versiones anteriores): solo se importan a mano. */
  importables: () => Partial<Record<CollectionName, number>>;
  importarLocal: (collection: CollectionName) => Promise<number>;
  descartarImportable: (collection: CollectionName) => void;
  /** Descarga un JSON con todo lo que hay en pantalla (sirve de borrador si el guardado falló). */
  descargarRespaldo: () => void;
  seriesFootprint: (seriesId: string) => SeriesFootprint;
  removeSeries: (seriesId: string) => Promise<SeriesFootprint>;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

// Lo que se borra al eliminar una serie completa (las métricas se conservan como historial).
export interface SeriesFootprint { episodes: string[]; characters: string[]; productionCards: string[]; clipChecks: string[]; costs: string[]; calendarEntries: string[] }

const Ctx = createContext<DataCtx | null>(null);
export function useData(): DataCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useData debe usarse dentro de <DataProvider>");
  return c;
}

function localDefaults(): DataState {
  // Sin series, personajes ni métricas de ejemplo: la app arranca limpia para crear historias nuevas.
  return {
    accounts: seedAccounts, series: [], characters: [], formulas: seedFormulas,
    episodes: [], productionCards: [], clipChecks: [], costs: [], calendarEntries: [], metrics: [],
    viralAnalyses: [], products: [], productTests: [], accountProfiles: [], storyOutlines: [],
  };
}
function loadLocal(): DataState {
  const d = localDefaults();
  const out = { ...d } as any;
  for (const c of COLLECTIONS) out[c] = load(LOCAL_KEY_OF[c], (d as any)[c]);
  return out as DataState;
}
const importadoKey = (userId: string, c: CollectionName) => `importado:${userId}:${LOCAL_KEY_OF[c]}`;


// Lectura por partes: una tabla grande (los episodios guardan guion, prompts y elenco) leída de una vez
// pasaba el límite de tiempo de Supabase («canceling statement due to statement timeout»). Se lee en
// páginas pequeñas y, si una página se pasa de tiempo, se reintenta hasta 3 veces con espera.
// Si falta una columna nueva (migración sin ejecutar todavía), se guarda sin ella en vez de fallar y se avisa.
let avisoColumna: ((msg: string) => void) | null = null;
async function sinColumnaNueva(row: any, run: (r: any) => Promise<any>) {
  let res = await run(row);
  for (let i = 0; i < 3 && res.error; i++) {
    const m = /column "?([a-z_]+)"? (?:of relation \S+ )?does not exist|Could not find the '([a-z_]+)' column/i.exec(res.error.message || "");
    const col = m?.[1] || m?.[2];
    if (!col || !(col in row)) break;
    const { [col]: _quitada, ...resto } = row; row = resto;
    avisoColumna?.(`Falta ejecutar una migración en Supabase (columna «${col}»): se guardó sin ese dato. Ejecuta los archivos de supabase/migrations en el SQL Editor.`);
    res = await run(row);
  }
  return res;
}
const PAGE_OF: Record<string, number> = { episodes: 10, viral_analyses: 20, story_outlines: 5 };
async function fetchAll(supabase: any, table: string, userId: string): Promise<{ rows: any[]; error: any }> {
  const size = PAGE_OF[table] || 200;
  const rows: any[] = [];
  for (let from = 0; ; from += size) {
    let res: any = null;
    for (let intento = 0; intento < 3; intento++) {
      res = await supabase.from(table).select("*").eq("user_id", userId)
        .order("created_at", { ascending: true }).order("id", { ascending: true }).range(from, from + size - 1);
      if (!res.error || !/timeout|57014/i.test(`${res.error.code} ${res.error.message}`)) break;
      await new Promise(r => setTimeout(r, 700 * (intento + 1)));
    }
    if (res.error) return { rows, error: res.error };
    rows.push(...(res.data || []));
    if (!res.data || res.data.length < size) return { rows, error: null };
  }
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<DataMode>("cargando");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DataState>(() => localDefaults());
  const [falloGuardado, setFalloGuardado] = useState<FalloGuardado | null>(null);
  const [conflictos, setConflictos] = useState<Conflicto[]>([]);
  const supabaseRef = useRef<any>(null);
  const loadLockRef = useRef<Promise<void> | null>(null);
  const loadedForRef = useRef<string | null>(null);
  const dataRef = useRef(data);
  // Tablas opcionales que aún no existen en Supabase: esas colecciones se guardan en el navegador (por usuario).
  const missingRef = useRef<Set<CollectionName>>(new Set());
  // Tablas que existen pero no respondieron (red, tiempo, permisos): no se escribe en ellas hasta recargar.
  const unavailableRef = useRef<Set<CollectionName>>(new Set());
  // Revisión de cada fila (columna «revision» de la migración 20261104) para detectar ediciones simultáneas.
  const revRef = useRef<Map<string, number>>(new Map());
  // Una escritura a la vez por registro: la segunda parte del resultado de la primera.
  const colaRef = useRef<Map<string, Promise<any>>>(new Map());
  const enVueloRef = useRef(0);
  const ultimaEscrituraRef = useRef(0);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const userIdRef = useRef<string | null>(null);

  // El estado se cambia siempre a partir de dataRef (no de un render viejo): dos inserciones seguidas no se pisan.
  const aplicar = useCallback((fn: (d: DataState) => DataState) => {
    const next = fn(dataRef.current);
    dataRef.current = next;
    setData(next);
    return next;
  }, []);
  const remoto = (c: CollectionName) => modeRef.current === "supabase" && !!supabaseRef.current && !!userIdRef.current && !missingRef.current.has(c);
  const claveDe = (c: CollectionName) => claveLocal(LOCAL_KEY_OF[c], modeRef.current === "supabase" ? userIdRef.current : null);
  const guardarLocal = useCallback(async (c: CollectionName, items: any[]) => {
    const r = await save(claveDe(c), items);
    if (!r.ok) {
      setFalloGuardado({ collection: c, motivo: r.motivo, mensaje: r.mensaje, at: new Date().toISOString() });
      setError(r.motivo === "cuota"
        ? "No se pudo guardar en este navegador: el almacenamiento está lleno (imágenes o historiales grandes). Lo que ves NO está guardado: descarga la copia de respaldo y libera espacio, o inicia sesión para guardar en tu cuenta."
        : r.motivo === "denegado" ? "Este navegador no deja guardar datos (modo privado o almacenamiento bloqueado). Lo que ves NO está guardado: descarga la copia de respaldo." : "No se pudo guardar en este navegador: " + r.mensaje);
    } else setFalloGuardado(f => (f?.collection === c ? null : f));
    return r;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const anotarRevisiones = (c: CollectionName, rows: any[]) => { for (const r of rows) if (r && typeof r.revision === "number") revRef.current.set(`${c}:${r.id}`, r.revision); };

  const applyLocal = useCallback(() => {
    setMode("local"); modeRef.current = "local"; setUserEmail(null); setUserId(null); userIdRef.current = null; loadedForRef.current = null;
    revRef.current.clear(); missingRef.current.clear(); unavailableRef.current.clear();
    aplicar(() => loadLocal());
    // Lo que no cupo en localStorage quedó en IndexedDB: se recupera al momento.
    void (async () => {
      const extra: Partial<DataState> = {};
      for (const c of COLLECTIONS) { const v = await loadIdb<any[]>(LOCAL_KEY_OF[c]); if (v) (extra as any)[c] = v; }
      if (modeRef.current === "local" && Object.keys(extra).length) aplicar(d => ({ ...d, ...extra }));
    })();
  }, [aplicar]);

  const loadSupabase = useCallback(async (user: any) => {
    if (loadLockRef.current && loadedForRef.current === user.id) return loadLockRef.current;
    const p = (async () => {
      const supabase = supabaseRef.current;
      if (!supabase) return;
      try {
        const avisos: string[] = [];
        const results = await Promise.all(
          COLLECTIONS.map(async (c) => {
            const { rows, error: qError } = await fetchAll(supabase, TABLE_OF[c], user.id);
            if (qError) {
              const tipo = clasificarError(qError);
              if (OPTIONAL_TABLES.includes(c) && esMigracionPendiente(tipo)) {   // migración sin ejecutar: copia local de ESTE usuario
                missingRef.current.add(c); unavailableRef.current.delete(c);
                return [c, await loadAsync(claveLocal(LOCAL_KEY_OF[c], user.id), [])] as const;
              }
              if (OPTIONAL_TABLES.includes(c)) {   // fallo pasajero: se muestra lo último que había, sin escribir en ella
                unavailableRef.current.add(c); missingRef.current.delete(c);
                avisos.push(explicarError(tipo, TABLE_OF[c]));
                return [c, loadedForRef.current === user.id ? (dataRef.current as any)[c] : []] as const;
              }
              throw Object.assign(qError, { tipo, tabla: TABLE_OF[c] });
            }
            missingRef.current.delete(c); unavailableRef.current.delete(c);
            anotarRevisiones(c, rows || []);
            return [c, (rows || []).map((r: any) => fromRow(c, r))] as const;
          })
        );
        const state = {} as any;
        for (const [c, items] of results) state[c] = items;

        // ---- Seed por usuario (solo si SUS tablas están vacías) ----
        if (state.formulas.length === 0) {
          for (const f of seedFormulas) {
            const { data: row, error: insErr } = await supabase.from("formulas").insert(toRow("formulas", f, user.id)).select().single();
            if (!insErr && row) state.formulas.push(fromRow("formulas", row));
          }
        }
        loadedForRef.current = user.id;
        userIdRef.current = user.id; modeRef.current = "supabase";
        setUserId(user.id); setUserEmail(user.email ?? null); setMode("supabase");
        aplicar(() => state as DataState); setError(avisos.length ? avisos.join(" ") : null);
      } catch (e: any) {
        const tipo = e?.tipo || clasificarError(e);
        setError(tipo === "tiempo"
          ? "Supabase tardó demasiado en responder (incluso leyendo por partes). Recarga la página en un minuto; si se repite, ejecuta la migración de índices supabase/migrations/20261031_indices.sql en el SQL Editor."
          : e?.tabla ? explicarError(tipo, e.tabla) : "Error leyendo Supabase: " + (e?.message || String(e)));
        // No dejar la app vacía: se mantiene el estado anterior/local visible.
      }
    })();
    loadLockRef.current = p;
    try { await p; } finally { if (loadLockRef.current === p) loadLockRef.current = null; }
  }, [aplicar]);

  useEffect(() => {
    let cancelled = false;
    let listener: any = null;
    let channel: any = null;
    let espera: any = null;
    (async () => {
      if (!hasSupabase()) { applyLocal(); return; }
      const supabase = createClient();
      supabaseRef.current = supabase;
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session?.user) await loadSupabase(session.user); else applyLocal();
      const { data: sub } = supabase.auth.onAuthStateChange(async (_event: string, sess: any) => {
        if (sess?.user) { if (sess.user.id !== loadedForRef.current) await loadSupabase(sess.user); }
        else applyLocal();
      });
      listener = sub;
      // Cambios hechos en otra ventana o dispositivo: una recarga agrupada (no una por fila) y nunca a mitad
      // de una escritura propia (su eco llega por aquí y no debe pisar lo que se está guardando).
      const recargar = () => {
        clearTimeout(espera);
        espera = setTimeout(() => {
          if (enVueloRef.current > 0 || Date.now() - ultimaEscrituraRef.current < 1500) return recargar();
          supabase.auth.getUser().then(({ data: { user } }: any) => { if (user) { loadedForRef.current = null; loadSupabase(user); } }).catch(() => {});
        }, 1200);
      };
      try {
        channel = supabase.channel("estudio-viral-cambios");
        for (const c of COLLECTIONS) channel = channel.on("postgres_changes", { event: "*", schema: "public", table: TABLE_OF[c] }, recargar);
        channel.subscribe();
      } catch { /* Realtime no disponible: se sigue con refresh por mutación */ }
    })();
    return () => { cancelled = true; clearTimeout(espera); try { listener?.subscription?.unsubscribe(); } catch {} try { if (channel && supabaseRef.current) supabaseRef.current.removeChannel(channel); } catch {} };
  }, [applyLocal, loadSupabase]);

  avisoColumna = setError;
  const noDisponible = (c: CollectionName) => {
    if (modeRef.current === "supabase" && unavailableRef.current.has(c)) {
      const e = new Error(`«${TABLE_OF[c]}» no respondió al cargar. Recarga la página antes de guardar ahí (para no dejar cambios solo en este navegador).`);
      setError(e.message); throw e;
    }
  };
  const conVuelo = async <T,>(fn: () => Promise<T>) => { enVueloRef.current++; try { return await fn(); } finally { enVueloRef.current--; ultimaEscrituraRef.current = Date.now(); } };

  const insert = useCallback(async (collection: CollectionName, item: any) => {
    noDisponible(collection);
    if (remoto(collection)) return conVuelo(async () => {
      const { data: row, error: insErr } = await sinColumnaNueva(toRow(collection, item, userIdRef.current!), r => supabaseRef.current.from(TABLE_OF[collection]).insert(r).select().single());
      if (insErr) { setError("Error guardando en Supabase: " + insErr.message); throw insErr; }
      anotarRevisiones(collection, [row]);
      const mapped = fromRow(collection, row);
      aplicar(prev => ({ ...prev, [collection]: [...(prev as any)[collection], mapped] }));
      return mapped;
    });
    const newItem = { ...item, id: item.id && !String(item.id).startsWith("tmp") ? item.id : uid() };
    const next = aplicar(prev => ({ ...prev, [collection]: [...(prev as any)[collection], newItem] } as DataState));
    await guardarLocal(collection, (next as any)[collection]);
    return newItem;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aplicar, guardarLocal]);

  // Escritura remota de un parche con control de revisión. Devuelve la fila guardada o lanza ConflictoError.
  const escribirParche = useCallback(async (collection: CollectionName, id: string, base: any, patchRow: Record<string, any>, forzar = false): Promise<any> => {
    const sb = supabaseRef.current; const uidActual = userIdRef.current!;
    const clave = `${collection}:${id}`;
    for (let intento = 0; intento < 3; intento++) {
      const rev = revRef.current.get(clave);
      const { data: rows, error: updErr } = await sinColumnaNueva(patchRow, r => {
        let q = sb.from(TABLE_OF[collection]).update(r).eq("id", id).eq("user_id", uidActual);
        if (rev !== undefined && !forzar) q = q.eq("revision", rev);
        return q.select();
      });
      if (updErr) { setError("Error actualizando en Supabase: " + updErr.message); throw updErr; }
      if (rows?.length) { anotarRevisiones(collection, rows); return rows[0]; }
      // 0 filas: otra ventana guardó antes (cambió la revisión) o el registro ya no existe.
      const { data: fresca, error: getErr } = await sb.from(TABLE_OF[collection]).select("*").eq("id", id).eq("user_id", uidActual).maybeSingle();
      if (getErr) { setError("Error releyendo en Supabase: " + getErr.message); throw getErr; }
      if (!fresca) { const e = new Error("Ese registro ya no existe (se borró en otra ventana o dispositivo)."); setError(e.message); throw e; }
      anotarRevisiones(collection, [fresca]);
      const remotoMapped = fromRow(collection, fresca);
      const { reintentar, choques } = resolverChoque(toRow(collection, base, uidActual), toRow(collection, remotoMapped, uidActual), patchRow);
      if (!reintentar) {
        aplicar(prev => ({ ...prev, [collection]: (prev as any)[collection].map((x: any) => (x.id === id ? remotoMapped : x)) }));
        const conflicto: Conflicto = { id: uid(), collection, recordId: id, columnas: choques, patch: patchRow, at: new Date().toISOString() };
        setConflictos(cs => [...cs, conflicto]);
        setError(`Otra ventana cambió lo mismo a la vez (${choques.join(", ")}). Se muestra la versión guardada; tu cambio quedó apartado para reaplicarlo o descartarlo.`);
        throw new ConflictoError(conflicto);
      }
      base = remotoMapped;   // lo del otro no toca lo mío: se reintenta sobre su versión
    }
    throw new Error("No se pudo guardar tras varios intentos: hay muchas ediciones a la vez. Reintenta.");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aplicar]);

  const update = useCallback(async (collection: CollectionName, id: string, patch: any) => {
    noDisponible(collection);
    const clave = `${collection}:${id}`;
    const anterior = colaRef.current.get(clave) || Promise.resolve();
    const tarea = anterior.catch(() => {}).then(async () => {
      const current = (dataRef.current as any)[collection].find((x: any) => x.id === id);
      const merged = { ...(current || { id }), ...patch, id };
      if (remoto(collection)) return conVuelo(async () => {
        const uidActual = userIdRef.current!;
        const cambios = columnasCambiadas(current ? toRow(collection, current, uidActual) : undefined, toRow(collection, merged, uidActual));
        if (!Object.keys(cambios).length) return current;
        const row = await escribirParche(collection, id, current || merged, cambios);
        const mapped = fromRow(collection, row);
        aplicar(prev => ({ ...prev, [collection]: (prev as any)[collection].map((x: any) => (x.id === id ? mapped : x)) }));
        return mapped;
      });
      const next = aplicar(prev => ({ ...prev, [collection]: (prev as any)[collection].map((x: any) => (x.id === id ? merged : x)) } as DataState));
      await guardarLocal(collection, (next as any)[collection]);
      return merged;
    });
    colaRef.current.set(clave, tarea);
    try { return await tarea; } finally { if (colaRef.current.get(clave) === tarea) colaRef.current.delete(clave); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aplicar, escribirParche, guardarLocal]);

  const resolverConflicto = useCallback(async (cid: string, opcion: "mio" | "servidor") => {
    const c = conflictos.find(x => x.id === cid); if (!c) return;
    if (opcion === "mio" && remoto(c.collection)) {
      const base = (dataRef.current as any)[c.collection].find((x: any) => x.id === c.recordId);
      const row = await conVuelo(() => escribirParche(c.collection, c.recordId, base, c.patch, true));
      const mapped = fromRow(c.collection, row);
      aplicar(prev => ({ ...prev, [c.collection]: (prev as any)[c.collection].map((x: any) => (x.id === c.recordId ? mapped : x)) }));
    }
    setConflictos(cs => cs.filter(x => x.id !== cid));
    if (conflictos.length <= 1) setError(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conflictos, escribirParche, aplicar]);

  const remove = useCallback(async (collection: CollectionName, id: string) => {
    noDisponible(collection);
    if (remoto(collection)) return conVuelo(async () => {
      const { error: delErr } = await supabaseRef.current.from(TABLE_OF[collection]).delete().eq("id", id).eq("user_id", userIdRef.current);
      if (delErr) { setError("Error borrando en Supabase: " + delErr.message); throw delErr; }
      aplicar(prev => ({ ...prev, [collection]: (prev as any)[collection].filter((x: any) => x.id !== id) }));
    });
    const next = aplicar(prev => ({ ...prev, [collection]: (prev as any)[collection].filter((x: any) => x.id !== id) } as DataState));
    await guardarLocal(collection, (next as any)[collection]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aplicar, guardarLocal]);

  // Borrado en bloque: una sola petición a Supabase (o un solo guardado local).
  const removeMany = useCallback(async (collection: CollectionName, ids: string[]) => {
    const set = new Set(ids.filter(Boolean));
    if (!set.size) return;
    noDisponible(collection);
    if (remoto(collection)) return conVuelo(async () => {
      const { error: delErr } = await supabaseRef.current.from(TABLE_OF[collection]).delete().in("id", Array.from(set)).eq("user_id", userIdRef.current);
      if (delErr) { setError("Error borrando en Supabase: " + delErr.message); throw delErr; }
      aplicar(prev => ({ ...prev, [collection]: (prev as any)[collection].filter((x: any) => !set.has(x.id)) }));
    });
    const next = aplicar(prev => ({ ...prev, [collection]: (prev as any)[collection].filter((x: any) => !set.has(x.id)) } as DataState));
    await guardarLocal(collection, (next as any)[collection]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aplicar, guardarLocal]);

  // ---- Copias locales sin dueño: se ofrecen para importar, nunca se mezclan solas ----
  const importables = useCallback(() => {
    const out: Partial<Record<CollectionName, number>> = {};
    const u = userIdRef.current;
    if (modeRef.current !== "supabase" || !u) return out;
    for (const c of OPTIONAL_TABLES) {
      if (hasKey(importadoKey(u, c))) continue;
      const items = load<any[]>(LOCAL_KEY_OF[c], []);
      const propios = new Set(((dataRef.current as any)[c] || []).map((x: any) => x.id));
      const n = items.filter(x => !propios.has(x.id)).length;
      if (n) out[c] = n;
    }
    return out;
  }, []);
  const descartarImportable = useCallback((c: CollectionName) => { const u = userIdRef.current; if (u) void save(importadoKey(u, c), true); }, []);
  const importarLocal = useCallback(async (c: CollectionName) => {
    const u = userIdRef.current; if (!u) return 0;
    const propios = new Set(((dataRef.current as any)[c] || []).map((x: any) => x.id));
    const items = load<any[]>(LOCAL_KEY_OF[c], []).filter(x => !propios.has(x.id));
    let n = 0;
    for (const it of items) {
      // En Supabase el id lo pone la base (las ids locales no son uuid); en el navegador se conserva.
      const { id: _id, ...resto } = it;
      await insert(c, remoto(c) ? resto : it); n++;
    }
    await save(importadoKey(u, c), true);
    return n;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insert]);

  const descargarRespaldo = useCallback(() => {
    const blob = new Blob([JSON.stringify({ app: "estudio-viral", at: new Date().toISOString(), modo: modeRef.current, data: dataRef.current }, null, 1)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `estudio-viral-respaldo-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }, []);

  const seriesFootprint = useCallback((seriesId: string): SeriesFootprint => {
    const d = dataRef.current;
    const episodes = d.episodes.filter((e: any) => e.seriesId === seriesId).map((e: any) => e.id);
    const eps = new Set(episodes);
    const of = (list: any[]) => list.filter((x: any) => x.episodeId && eps.has(x.episodeId)).map((x: any) => x.id);
    return {
      episodes, characters: d.characters.filter((c: any) => c.seriesId === seriesId).map((c: any) => c.id),
      productionCards: of(d.productionCards), clipChecks: of(d.clipChecks), costs: of(d.costs), calendarEntries: of(d.calendarEntries),
    };
  }, []);

  // Serie completa: primero lo que cuelga de sus episodios, después episodios, personajes y la serie.
  const removeSeries = useCallback(async (seriesId: string) => {
    const f = seriesFootprint(seriesId);
    await removeMany("clipChecks", f.clipChecks);
    await removeMany("productionCards", f.productionCards);
    await removeMany("costs", f.costs);
    await removeMany("calendarEntries", f.calendarEntries);
    await removeMany("episodes", f.episodes);
    await removeMany("characters", f.characters);
    // El proyecto largo de la serie (en Supabase cae solo por la clave foránea; en el navegador hay que quitarlo).
    await removeMany("storyOutlines", (dataRef.current as any).storyOutlines.filter((o: any) => o.seriesId === seriesId).map((o: any) => o.id));
    await removeMany("series", [seriesId]);
    return f;
  }, [removeMany, seriesFootprint]);

  const refresh = useCallback(async () => {
    if (modeRef.current === "supabase" && supabaseRef.current) {
      const { data: { user } } = await supabaseRef.current.auth.getUser();
      if (user) { loadedForRef.current = null; await loadSupabase(user); }
    }
  }, [loadSupabase]);

  const signOut = useCallback(async () => {
    try { await supabaseRef.current?.auth?.signOut(); } catch {}
    applyLocal();
  }, [applyLocal]);

  const isLocalOnly = useCallback((c: CollectionName) => modeRef.current !== "supabase" || missingRef.current.has(c), []);
  const isUnavailable = useCallback((c: CollectionName) => modeRef.current === "supabase" && unavailableRef.current.has(c), []);
  const value: DataCtx = { mode, userEmail, userId, error, data, insert, update, remove, removeMany, isLocalOnly, isUnavailable, falloGuardado, conflictos, resolverConflicto, importables, importarLocal, descartarImportable, descargarRespaldo, seriesFootprint, removeSeries, refresh, signOut };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// Indicador visible del modo + estado de sesión + botón Salir.
export function SessionBar({ compact = false }: { compact?: boolean } = {}) {
  const { mode, userEmail, signOut, falloGuardado, conflictos, descargarRespaldo } = useData();
  if (falloGuardado || conflictos.length) return (
    <div className="session-pill" role="alert" title={falloGuardado ? `No se guardó: ${falloGuardado.mensaje}` : "Hay cambios en conflicto con otra ventana"}>
      <span className="dot bg-rose-400" />
      {!compact && <span className="truncate">{falloGuardado ? "Sin guardar en este navegador" : `${conflictos.length} cambio(s) en conflicto`}</span>}
      <button onClick={() => descargarRespaldo()} className="ml-auto text-[11px] font-semibold text-rose-200 hover:text-white">Descargar copia</button>
    </div>
  );
  if (mode === "cargando") return <div className="session-pill"><span className="dot bg-slate-500 animate-pulse" />Cargando…</div>;
  if (mode === "supabase") return (
    <div className="session-pill" title="Tus datos se guardan en Supabase, solo visibles para tu usuario.">
      <span className="dot bg-emerald-400" />
      {!compact && <span className="truncate">{userEmail}</span>}
      <button onClick={() => signOut()} className="ml-auto text-[11px] text-slate-400 hover:text-white">Salir</button>
    </div>
  );
  return (
    <div className="session-pill" title="Sin sesión: los datos se guardan solo en este navegador. Inicia sesión para crear guiones y personajes con Gemini.">
      <span className="dot bg-amber-400" />
      {!compact && <span className="truncate">Modo local · sin sesión</span>}
      <a href="/login" className="ml-auto text-[11px] font-semibold text-amber-300 hover:text-amber-200">Entrar</a>
    </div>
  );
}
