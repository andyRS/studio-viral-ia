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
import { load, save, uid } from "./store";
import { COLLECTIONS, LOCAL_KEY_OF, OPTIONAL_TABLES, TABLE_OF, fromRow, toRow, type CollectionName } from "./db";
import { seedAccounts, seedFormulas } from "./seed";
import type { Account, AccountProfile, CalendarEntry, Character, ClipCheck, Cost, Episode, Formula, Metric, Product, ProductTest, ProductionCard, Series, ViralAnalysis } from "./types";

export type { CollectionName };

export interface DataState {
  accounts: Account[]; series: Series[]; characters: Character[]; formulas: Formula[];
  episodes: Episode[]; productionCards: ProductionCard[]; clipChecks: ClipCheck[]; costs: Cost[];
  calendarEntries: CalendarEntry[]; metrics: Metric[]; viralAnalyses: ViralAnalysis[];
  products: Product[]; productTests: ProductTest[]; accountProfiles: AccountProfile[]; storyOutlines: any[];
}

export type DataMode = "cargando" | "supabase" | "local";

interface DataCtx {
  mode: DataMode;
  userEmail: string | null;
  userId: string | null;
  error: string | null;
  data: DataState;
  insert: (collection: CollectionName, item: any) => Promise<any>;
  update: (collection: CollectionName, id: string, patch: any) => Promise<any>;
  remove: (collection: CollectionName, id: string) => Promise<void>;
  removeMany: (collection: CollectionName, ids: string[]) => Promise<void>;
  /** true si esa colección se guarda en el navegador porque su tabla aún no existe en Supabase. */
  isLocalOnly: (collection: CollectionName) => boolean;
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
function saveLocalCollection(collection: CollectionName, items: any[]) {
  save(LOCAL_KEY_OF[collection], items);
}


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
  const supabaseRef = useRef<any>(null);
  const loadLockRef = useRef<Promise<void> | null>(null);
  const loadedForRef = useRef<string | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;
  // Tablas opcionales que aún no existen en Supabase: esas colecciones se guardan en el navegador.
  const missingRef = useRef<Set<CollectionName>>(new Set());
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const applyLocal = useCallback(() => {
    setMode("local"); setUserEmail(null); setUserId(null); loadedForRef.current = null;
    setData(loadLocal());
  }, []);

  const loadSupabase = useCallback(async (user: any) => {
    if (loadLockRef.current && loadedForRef.current === user.id) return loadLockRef.current;
    const p = (async () => {
      const supabase = supabaseRef.current;
      if (!supabase) return;
      try {
        const results = await Promise.all(
          COLLECTIONS.map(async (c) => {
            const { rows, error: qError } = await fetchAll(supabase, TABLE_OF[c], user.id);
            if (qError && OPTIONAL_TABLES.includes(c)) {   // migración sin ejecutar: no rompe la carga
              missingRef.current.add(c);
              return [c, load(LOCAL_KEY_OF[c], [])] as const;
            }
            if (qError) throw qError;
            missingRef.current.delete(c);
            return [c, (rows || []).map((r: any) => fromRow(c, r))] as const;
          })
        );
        const state = {} as any;
        for (const [c, items] of results) state[c] = items;

        // ---- Seed por usuario (solo si SUS tablas están vacías) ----
        // Fórmulas base:
        if (state.formulas.length === 0) {
          for (const f of seedFormulas) {
            const { data: row, error: insErr } = await supabase.from("formulas").insert(toRow("formulas", f, user.id)).select().single();
            if (!insErr && row) state.formulas.push(fromRow("formulas", row));
          }
        }
        loadedForRef.current = user.id;
        setUserId(user.id); setUserEmail(user.email ?? null); setMode("supabase");
        setData(state as DataState); setError(null);
      } catch (e: any) {
        const msg = e?.message || String(e);
        setError(/timeout|57014/i.test(msg)
          ? "Supabase tardó demasiado en responder (incluso leyendo por partes). Recarga la página en un minuto; si se repite, ejecuta la migración de índices supabase/migrations/20261031_indices.sql en el SQL Editor."
          : "Error leyendo Supabase: " + msg);
        // No dejar la app vacía: se mantiene el estado anterior/local visible.
      }
    })();
    loadLockRef.current = p;
    try { await p; } finally { if (loadLockRef.current === p) loadLockRef.current = null; }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let listener: any = null;
    let channel: any = null;
    (async () => {
      if (!hasSupabase()) { applyLocal(); return; }
      const supabase = createClient();
      supabaseRef.current = supabase;
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session?.user) await loadSupabase(session.user); else applyLocal();
      const { data: sub } = supabase.auth.onAuthStateChange(async (_event: string, sess: any) => {
        if (sess?.user) await loadSupabase(sess.user);
        else applyLocal();
      });
      listener = sub;
      // Refresh en vivo cuando cambian filas del usuario (si Realtime está
      // activo en el proyecto; si no, las mutaciones propias ya refrescan).
      try {
        channel = supabase.channel("estudio-viral-cambios");
        for (const c of COLLECTIONS) {
          channel = channel.on("postgres_changes", { event: "*", schema: "public", table: TABLE_OF[c] }, () => {
            // Recarga silenciosa para el usuario cargado:
            supabase.auth.getUser().then(({ data: { user } }: any) => { if (user) { loadedForRef.current = null; loadSupabase(user); } }).catch(() => {});
          });
        }
        channel.subscribe();
      } catch { /* Realtime no disponible: se sigue con refresh por mutación */ }
    })();
    return () => { cancelled = true; try { listener?.subscription?.unsubscribe(); } catch {} try { if (channel && supabaseRef.current) supabaseRef.current.removeChannel(channel); } catch {} };
  }, [applyLocal, loadSupabase]);

  avisoColumna = setError;
  const insert = useCallback(async (collection: CollectionName, item: any) => {
    if (modeRef.current === "supabase" && supabaseRef.current && userId && !missingRef.current.has(collection)) {
      const { data: row, error: insErr } = await sinColumnaNueva(toRow(collection, item, userId), r => supabaseRef.current.from(TABLE_OF[collection]).insert(r).select().single());
      if (insErr) { setError("Error guardando en Supabase: " + insErr.message); throw insErr; }
      const mapped = fromRow(collection, row);
      setData((prev) => ({ ...prev, [collection]: [...(prev as any)[collection], mapped] }));
      return mapped;
    }
    const newItem = { ...item, id: item.id && !String(item.id).startsWith("tmp") ? item.id : uid() };
    setData((prev) => {
      const next = { ...prev, [collection]: [...(prev as any)[collection], newItem] } as DataState;
      saveLocalCollection(collection, (next as any)[collection]);
      return next;
    });
    return newItem;
  }, [userId]);

  const update = useCallback(async (collection: CollectionName, id: string, patch: any) => {
    const current = (dataRef.current as any)[collection].find((x: any) => x.id === id);
    const merged = { ...(current || { id }), ...patch, id };
    if (modeRef.current === "supabase" && supabaseRef.current && userId && !missingRef.current.has(collection)) {
      const { data: row, error: updErr } = await sinColumnaNueva(toRow(collection, merged, userId), r => supabaseRef.current
        .from(TABLE_OF[collection]).update(r).eq("id", id).eq("user_id", userId).select().single());
      if (updErr) { setError("Error actualizando en Supabase: " + updErr.message); throw updErr; }
      const mapped = fromRow(collection, row);
      setData((prev) => ({ ...prev, [collection]: (prev as any)[collection].map((x: any) => (x.id === id ? mapped : x)) }));
      return mapped;
    }
    setData((prev) => {
      const next = { ...prev, [collection]: (prev as any)[collection].map((x: any) => (x.id === id ? merged : x)) } as DataState;
      saveLocalCollection(collection, (next as any)[collection]);
      return next;
    });
    return merged;
  }, [userId]);

  const remove = useCallback(async (collection: CollectionName, id: string) => {
    if (modeRef.current === "supabase" && supabaseRef.current && userId && !missingRef.current.has(collection)) {
      const { error: delErr } = await supabaseRef.current.from(TABLE_OF[collection]).delete().eq("id", id).eq("user_id", userId);
      if (delErr) { setError("Error borrando en Supabase: " + delErr.message); throw delErr; }
      setData((prev) => ({ ...prev, [collection]: (prev as any)[collection].filter((x: any) => x.id !== id) }));
      return;
    }
    setData((prev) => {
      const next = { ...prev, [collection]: (prev as any)[collection].filter((x: any) => x.id !== id) } as DataState;
      saveLocalCollection(collection, (next as any)[collection]);
      return next;
    });
  }, [userId]);

  // Borrado en bloque: una sola petición a Supabase (o un solo guardado local).
  const removeMany = useCallback(async (collection: CollectionName, ids: string[]) => {
    const set = new Set(ids.filter(Boolean));
    if (!set.size) return;
    if (modeRef.current === "supabase" && supabaseRef.current && userId && !missingRef.current.has(collection)) {
      const { error: delErr } = await supabaseRef.current.from(TABLE_OF[collection]).delete().in("id", Array.from(set)).eq("user_id", userId);
      if (delErr) { setError("Error borrando en Supabase: " + delErr.message); throw delErr; }
      setData((prev) => ({ ...prev, [collection]: (prev as any)[collection].filter((x: any) => !set.has(x.id)) }));
      return;
    }
    setData((prev) => {
      const next = { ...prev, [collection]: (prev as any)[collection].filter((x: any) => !set.has(x.id)) } as DataState;
      saveLocalCollection(collection, (next as any)[collection]);
      return next;
    });
  }, [userId]);

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
  const value: DataCtx = { mode, userEmail, userId, error, data, insert, update, remove, removeMany, isLocalOnly, seriesFootprint, removeSeries, refresh, signOut };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// Indicador visible del modo + estado de sesión + botón Salir.
export function SessionBar({ compact = false }: { compact?: boolean } = {}) {
  const { mode, userEmail, signOut } = useData();
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
