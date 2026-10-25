"use client";
// Logos para tapar marcas de agua: FrutiEnganchados (viene con el montaje) y los de cada página
// (p. ej. «Un Minuto en Oración»), guardados en este navegador (IndexedDB).
import { useEffect, useState } from "react";

export type SavedLogo = { id: string; name: string; blob: Blob };
export const FRUTI = "frutienganchados";

function logoDb(): Promise<IDBDatabase | null> {
  return new Promise(res => { try { const r = indexedDB.open("estudio-viral-logos", 1); r.onupgradeneeded = () => r.result.createObjectStore("logos", { keyPath: "id" }); r.onsuccess = () => res(r.result); r.onerror = () => res(null); } catch { res(null); } });
}
export async function listLogos(): Promise<SavedLogo[]> {
  const db = await logoDb(); if (!db) return [];
  return new Promise(res => { const q = db.transaction("logos").objectStore("logos").getAll(); q.onsuccess = () => res(q.result || []); q.onerror = () => res([]); });
}
async function putLogo(l: SavedLogo) {
  const db = await logoDb(); if (!db) return;
  await new Promise(res => { const t = db.transaction("logos", "readwrite"); t.objectStore("logos").put(l); t.oncomplete = t.onerror = () => res(null); });
}
async function delLogo(id: string) {
  const db = await logoDb(); if (!db) return;
  await new Promise(res => { const t = db.transaction("logos", "readwrite"); t.objectStore("logos").delete(id); t.oncomplete = t.onerror = () => res(null); });
}
// El archivo para mandar al montaje (null = FrutiEnganchados, que ya tiene el montaje).
export async function logoFile(id: string): Promise<File | null> {
  if (!id || id === FRUTI) return null;
  const l = (await listLogos()).find(x => x.id === id);
  return l ? new File([l.blob], `${l.name.replace(/[^\w-]+/g, "_") || "logo"}.png`, { type: l.blob.type || "image/png" }) : null;
}
// Logo por defecto: el último elegido para esa serie o cuenta; en las cristianas, el de «oración» si existe.
export async function defaultLogo(key: string, style?: string): Promise<string> {
  let saved = ""; try { saved = localStorage.getItem(`estudio-viral:logo:${key}`) || ""; } catch {}
  const logos = await listLogos();
  if (saved && (saved === FRUTI || logos.some(l => l.id === saved))) return saved;
  if (style === "cristiana") return logos.find(l => /oraci/i.test(l.name))?.id || FRUTI;
  return FRUTI;
}
export function rememberLogo(key: string, id: string) { try { localStorage.setItem(`estudio-viral:logo:${key}`, id); } catch {} }

export default function LogoPicker({ value, onChange, disabled }: { value: string; onChange: (id: string) => void; disabled?: boolean }) {
  const [logos, setLogos] = useState<SavedLogo[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [name, setName] = useState("");
  const [pending, setPending] = useState<File | null>(null);
  async function reload() { setLogos(await listLogos()); }
  useEffect(() => { reload(); }, []);
  useEffect(() => {
    const u: Record<string, string> = {}; for (const l of logos) u[l.id] = URL.createObjectURL(l.blob); setUrls(u);
    return () => Object.values(u).forEach(x => URL.revokeObjectURL(x));
  }, [logos]);
  async function add() {
    if (!pending) return;
    const id = `logo-${Date.now()}`;
    await putLogo({ id, name: name.trim() || pending.name.replace(/\.[^.]+$/, ""), blob: pending });
    setPending(null); setName(""); await reload(); onChange(id);
  }
  const chip = (active: boolean) => `flex items-center gap-2 rounded-xl border px-2.5 py-2 text-xs ${active ? "border-[#598BFF] bg-[#598BFF]/10 text-white" : "border-white/10 text-slate-300 hover:border-white/25"}`;
  return <div className="space-y-2">
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Logo que tapa la marca">
      <button type="button" role="radio" aria-checked={value === FRUTI} disabled={disabled} onClick={() => onChange(FRUTI)} className={chip(value === FRUTI)}>
        <img src="/marca/frutienganchados.png" alt="" className="h-7 w-7 object-contain" />FrutiEnganchados</button>
      {logos.map(l => <span key={l.id} className={chip(value === l.id)}>
        <button type="button" role="radio" aria-checked={value === l.id} disabled={disabled} onClick={() => onChange(l.id)} className="flex items-center gap-2">
          {urls[l.id] && <img src={urls[l.id]} alt="" className="h-7 w-7 rounded object-contain" />}{l.name}</button>
        <button type="button" disabled={disabled} aria-label={`Borrar el logo ${l.name}`} onClick={async () => { if (!confirm(`¿Borrar el logo «${l.name}»?`)) return; await delLogo(l.id); if (value === l.id) onChange(FRUTI); reload(); }} className="text-slate-500 hover:text-rose-300">×</button>
      </span>)}
    </div>
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <label className="cursor-pointer rounded-lg border border-dashed border-white/20 px-2.5 py-1.5 text-slate-300 hover:border-white/40">+ Añadir logo de otra página
        <input type="file" accept="image/png,image/webp,image/jpeg" className="sr-only" disabled={disabled} onChange={e => { const f = e.target.files?.[0] || null; setPending(f); if (f) setName(f.name.replace(/\.[^.]+$/, "")); }} /></label>
      {pending && <>
        <input value={name} onChange={e => setName(e.target.value)} maxLength={40} placeholder="Nombre (p. ej. Un Minuto en Oración)" className="w-56 text-xs" />
        <button type="button" onClick={add} className="rounded-lg bg-[#598BFF] px-2.5 py-1.5 font-semibold text-white">Guardar logo</button>
      </>}
    </div>
    <p className="text-[11px] text-slate-500">Mejor un PNG con fondo transparente. Se guarda en este navegador y se usa también al montar.</p>
  </div>;
}
