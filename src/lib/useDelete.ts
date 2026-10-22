"use client";
// Borrados con confirmación para toda la app. Nunca se borra nada sin preguntar,
// y la confirmación dice exactamente qué se va a eliminar.
import { useData } from "./DataContext";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function useDeleteSeries() {
  const { seriesFootprint, removeSeries } = useData();
  return async (series: { id: string; title: string }) => {
    const f = seriesFootprint(series.id);
    const parts = [
      plural(f.episodes.length, "episodio", "episodios"),
      plural(f.characters.length, "personaje", "personajes"),
      f.productionCards.length ? plural(f.productionCards.length, "tarjeta de producción", "tarjetas de producción") : "",
      f.clipChecks.length ? plural(f.clipChecks.length, "revisión de escena", "revisiones de escena") : "",
      f.costs.length ? plural(f.costs.length, "costo", "costos") : "",
      f.calendarEntries.length ? plural(f.calendarEntries.length, "publicación del calendario", "publicaciones del calendario") : "",
    ].filter(Boolean);
    if (!window.confirm(`¿Eliminar la serie «${series.title}» completa?\n\nSe borrarán: ${parts.join(", ")}.\nLas métricas de lo ya publicado se conservan.\n\nEsta acción no se puede deshacer.`)) return false;
    await removeSeries(series.id);
    return true;
  };
}

// Confirmación estándar para borrar un elemento suelto.
export const confirmDelete = (what: string) => window.confirm(`¿Eliminar ${what}? Esta acción no se puede deshacer.`);
