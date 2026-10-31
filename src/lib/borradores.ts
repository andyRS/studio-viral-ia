"use client";
// Borradores de formularios que sobreviven a cambiar de módulo o recargar (idea de la historia, notas,
// transcripción del laboratorio, entrada del calendario…) y el «último punto editado» para «Retomar».
// Van en el navegador, por usuario, y caducan a los 14 días. No sustituyen al guardado real: son lo que
// el usuario estaba escribiendo y aún no envió.
import { useCallback, useEffect, useRef, useState } from "react";
import { useData } from "./DataContext";
import { claveLocal } from "./persistencia";
import { load, removeKey, saveSync } from "./store";

const CADUCA_MS = 14 * 86400000;
type Guardado<T> = { v: T; at: number };

export function leerBorrador<T>(clave: string, userId: string | null): T | undefined {
  const g = load<Guardado<T> | null>(claveLocal(`borrador:${clave}`, userId), null);
  return g && Date.now() - g.at < CADUCA_MS ? g.v : undefined;
}
export function escribirBorrador<T>(clave: string, userId: string | null, v: T) {
  return saveSync(claveLocal(`borrador:${clave}`, userId), { v, at: Date.now() } as Guardado<T>);
}
export function borrarBorrador(clave: string, userId: string | null) { removeKey(claveLocal(`borrador:${clave}`, userId)); }

// Como useState, pero el valor se guarda como borrador (con 400 ms de espera) y se restaura al volver.
// `vacio(v)` decide cuándo no hace falta guardarlo (p. ej. texto vacío): entonces se borra el borrador.
export function useBorrador<T>(clave: string, inicial: T, vacio: (v: T) => boolean = v => v === inicial || (typeof v === "string" && !v.trim())) {
  const { userId, mode } = useData();
  const [valor, setValor] = useState<T>(inicial);
  const [restaurado, setRestaurado] = useState(false);
  const listo = useRef(false);
  const tocado = useRef(false);
  // Restaurar cuando se sabe quién es el usuario (y solo si no se escribió nada antes).
  useEffect(() => {
    if (mode === "cargando") return;
    listo.current = true;
    const b = leerBorrador<T>(clave, userId);
    if (b !== undefined && !tocado.current && !vacio(b)) { setValor(b); setRestaurado(true); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, userId, mode]);
  useEffect(() => {
    if (!listo.current || !tocado.current) return;
    const t = setTimeout(() => { if (vacio(valor)) borrarBorrador(clave, userId); else escribirBorrador(clave, userId, valor); }, 400);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor, clave, userId]);
  const set = useCallback((v: T | ((prev: T) => T)) => { tocado.current = true; setRestaurado(false); setValor(v as any); }, []);
  const limpiar = useCallback(() => { tocado.current = true; borrarBorrador(clave, userId); setValor(inicial); setRestaurado(false); }, [clave, userId, inicial]);
  return [valor, set, { restaurado, limpiar }] as const;
}

// ---------- Último punto editado ----------
export type Punto = { episodeId: string; seriesId?: string; tab?: string; escena?: number; at: number };
export const leerUltimoPunto = (userId: string | null) => load<Punto | null>(claveLocal("ultimo-punto", userId), null);
export function anotarPunto(userId: string | null, p: Omit<Punto, "at">) { saveSync(claveLocal("ultimo-punto", userId), { ...p, at: Date.now() }); }
