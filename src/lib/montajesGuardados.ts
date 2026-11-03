export type MontajeGuardado = { id: string; base: string; titulo: string; inicio: number; estado?: string; ubicacion?: string; episodioId?: string };
export function correspondeMontaje(trabajo:MontajeGuardado,titulo:string,ubicacion?:string) {
  return trabajo.ubicacion ? trabajo.ubicacion===(ubicacion || titulo) : trabajo.titulo===titulo;
}
const prefijo = "estudio-viral:montajes:v1:";
export const CAMBIO_MONTAJES = "estudio-viral:montajes";
export const PC_MONTAJE = "http://127.0.0.1:8765";
export function montajeValido(x: any): x is MontajeGuardado {
  if (!x || !/^[a-f0-9]{32}$/.test(x.id) || typeof x.titulo !== "string" || !Number.isFinite(x.inicio)) return false;
  try { const u = new URL(x.base); return u.origin === x.base && (x.base === PC_MONTAJE || (u.protocol === "https:" && !u.username && !u.password)); } catch { return false; }
}
export function leerMontajes(cuenta: string, storage?: Pick<Storage, "getItem">): MontajeGuardado[] {
  try { const lista = JSON.parse((storage || localStorage).getItem(prefijo + cuenta) || "[]"); return Array.isArray(lista) ? lista.filter(montajeValido) : []; } catch { return []; }
}
export function guardarMontaje(cuenta: string, trabajo: MontajeGuardado, storage: Pick<Storage, "getItem" | "setItem"> = localStorage) {
  if (!montajeValido(trabajo)) throw new Error("Identificador o servidor de montaje inválido.");
  const lista = leerMontajes(cuenta, storage).filter(x => x.id !== trabajo.id || x.base !== trabajo.base);
  storage.setItem(prefijo + cuenta, JSON.stringify([trabajo, ...lista]));
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CAMBIO_MONTAJES));
}
export function olvidarMontaje(cuenta: string, trabajo: MontajeGuardado) {
  localStorage.setItem(prefijo + cuenta, JSON.stringify(leerMontajes(cuenta).filter(x => x.id !== trabajo.id || x.base !== trabajo.base)));
  window.dispatchEvent(new Event(CAMBIO_MONTAJES));
}

export type EstadoMontaje = { estado:string; pct:number; paso:string; seq:number; log:string[]; error?:string; segunda?:boolean; extras?:any[] };
export async function seguirMontaje(trabajo:MontajeGuardado, signal:AbortSignal, alRecibir:(dato:EstadoMontaje)=>void, consultar:typeof fetch=fetch) {
  let secuencia=-1;
  while(!signal.aborted) {
    const r=await consultar(`${trabajo.base}/trabajos/${trabajo.id}?desde=${secuencia}`,{signal});
    if(r.status===404)throw new Error("El servidor no encuentra este trabajo: pudo caducar o perderse al reiniciar el servidor.");
    if(!r.ok)throw new Error(`No se pudo consultar (HTTP ${r.status}).`);
    const dato:EstadoMontaje=await r.json(); if(signal.aborted)return;
    if(!["en cola","montando","listo","error"].includes(dato.estado) || !Number.isFinite(dato.pct) || !Number.isFinite(dato.seq))throw new Error("El servidor devolvió un progreso inválido. Reconecta para volver a consultarlo.");
    alRecibir(dato);secuencia=dato.seq;
    if(dato.estado==="listo" || dato.estado==="error")return dato;
    await new Promise<void>(resolve=>{const terminar=()=>{clearTimeout(t);signal.removeEventListener("abort",terminar);resolve();};const t=setTimeout(terminar,500);signal.addEventListener("abort",terminar,{once:true});});
  }
}
