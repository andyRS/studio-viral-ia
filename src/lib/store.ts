"use client";
export function load<T>(key:string, fallback:T):T { if(typeof window==="undefined") return fallback; try{ const v=localStorage.getItem("estudio-viral:"+key); return v?JSON.parse(v):fallback }catch{ return fallback } }
export function save(key:string, value:any){ if(typeof window!=="undefined") try{ localStorage.setItem("estudio-viral:"+key, JSON.stringify(value)) }catch{} }
export const uid=()=> Math.random().toString(36).slice(2,9)+Date.now().toString(36);
