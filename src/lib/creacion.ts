// Creación de una historia nueva en pasos que se pueden reanudar: la IA genera serie + elenco + episodio
// y luego se guardan con varias operaciones. Si una falla a mitad (red, Supabase), lo generado ya quedó
// apartado en el navegador con lo que se alcanzó a guardar; «Reintentar guardado» sigue desde ahí sin
// volver a generar (ni gastar otra llamada a la IA) y sin duplicar la serie o los personajes ya guardados.
import { claveLocal } from "./persistencia";
import { load, removeKey, saveSync } from "./store";

export type CreacionPendiente = {
  id: string; at: string; titulo: string;
  serie: any;                    // lo que se inserta en «series»
  personajes: any[];             // lo que se inserta en «characters» (sin seriesId)
  episodio: { ep: any; bible: any };
  hecho: { seriesId?: string; personajes: string[]; episodeId?: string; output?: any };
  error?: string;
};

const clave = (userId?: string | null) => claveLocal("creacion-pendiente", userId);
export const leerPendiente = (userId?: string | null) => load<CreacionPendiente | null>(clave(userId), null);
export const borrarPendiente = (userId?: string | null) => removeKey(clave(userId));
export function apartar(p: CreacionPendiente, userId?: string | null) {
  const r = saveSync(clave(userId), p);
  return r.ok;
}

export type Pasos = {
  insertarSerie: (serie: any) => Promise<{ id: string }>;
  insertarPersonaje: (personaje: any, seriesId: string) => Promise<unknown>;
  guardarEpisodio: (seriesId: string, ep: any, bible: any) => Promise<{ episodeId: string; output: any }>;
};

// Ejecuta solo los pasos que faltan y anota cada uno al terminarlo.
export async function completarCreacion(p: CreacionPendiente, pasos: Pasos, anotar: (p: CreacionPendiente) => void) {
  const nombre = (c: any) => String(c?.name || "").toLowerCase();
  if (!p.hecho.seriesId) {
    const s = await pasos.insertarSerie(p.serie);
    p = { ...p, hecho: { ...p.hecho, seriesId: s.id } }; anotar(p);
  }
  const sid = p.hecho.seriesId!;
  for (const c of p.personajes) {
    if (p.hecho.personajes.includes(nombre(c))) continue;
    await pasos.insertarPersonaje(c, sid);
    p = { ...p, hecho: { ...p.hecho, personajes: [...p.hecho.personajes, nombre(c)] } }; anotar(p);
  }
  if (!p.hecho.episodeId) {
    const r = await pasos.guardarEpisodio(sid, p.episodio.ep, p.episodio.bible);
    p = { ...p, hecho: { ...p.hecho, episodeId: r.episodeId, output: r.output } }; anotar(p);
  }
  return { seriesId: sid, episodeId: p.hecho.episodeId!, output: p.hecho.output, p };
}
