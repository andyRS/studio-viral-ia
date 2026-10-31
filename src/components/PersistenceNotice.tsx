"use client";
import { useEffect, useState } from "react";
import { generacionesInterrumpidas, olvidarInterrumpidas, type Generacion } from "@/lib/api-client";
import { useData } from "@/lib/DataContext";

const COLLECTION_LABELS: Record<string, string> = { accounts: "Cuenta", series: "Serie", characters: "Personaje", formulas: "Fórmula", episodes: "Episodio", productionCards: "Producción", clipChecks: "Revisión de clip", costs: "Costo", calendarEntries: "Publicación", metrics: "Métrica", viralAnalyses: "Análisis", products: "Producto", productTests: "Prueba de producto", accountProfiles: "Perfil", storyOutlines: "Proyecto largo" };
const FIELD_LABELS: Record<string, string> = { title: "título", name: "nombre", description: "descripción", data: "contenido", output: "contenido del episodio", stage: "etapa", status: "estado", notes: "notas", acts: "actos y escenas", image_url: "referencia visual", clothing: "vestuario", speech_style: "voz", reference_version: "versión de referencia" };

/** Uses the persistence agent's public API; never clears a failure visually. */
export default function PersistenceNotice() {
  const { data, falloGuardado, conflictos, resolverConflicto, descargarRespaldo } = useData();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  // Generaciones que se cortaron porque la página se recargó o cerró antes de recibir la respuesta.
  const [cortadas, setCortadas] = useState<Generacion[]>([]);
  useEffect(() => { setCortadas(generacionesInterrumpidas()); }, []);
  if (!falloGuardado && !conflictos.length && !cortadas.length) return null;
  async function resolve(id: string, choice: "mio" | "servidor") {
    setBusy(id); setMessage("");
    try { await resolverConflicto(id, choice); }
    catch (error: unknown) { setMessage(error instanceof Error ? error.message : "No se pudo resolver el conflicto. Tu cambio sigue pendiente."); }
    finally { setBusy(null); }
  }
  return <section className="persistence-notice" aria-label="Cambios que requieren atención">
    {!!cortadas.length && <div className="persistence-failure" role="status"><div><strong>{cortadas.length === 1 ? "Una generación se interrumpió" : `${cortadas.length} generaciones se interrumpieron`}</strong><p>La página se recargó o cerró antes de recibir el resultado de: {cortadas.map(g => `«${g.etiqueta}» (${new Date(g.inicio).toLocaleTimeString("es-DO", { hour: "2-digit", minute: "2-digit" })})`).join(", ")}. No se guardó nada de eso: vuelve a pedirlo.</p></div><button type="button" className="studio-secondary-action" onClick={() => { olvidarInterrumpidas(); setCortadas([]); }}>Entendido</button></div>}
    {falloGuardado && <div className="persistence-failure" role="alert"><div><strong>Sin guardar en este navegador</strong><p>El contenido sigue en pantalla. Descarga una copia antes de cerrar o recargar.</p><p className="persistence-detail">{falloGuardado.mensaje}</p></div><button type="button" className="studio-secondary-action" onClick={descargarRespaldo}>Descargar copia</button></div>}
    {!!conflictos.length && <div className="persistence-conflicts"><header><strong>Otra ventana cambió el mismo contenido</strong><p>Ves la versión del servidor. Tu cambio está apartado: elige qué conservar.</p></header><ul>{conflictos.map(c => {
      const record = (data[c.collection] as { id: string; title?: string; name?: string }[]).find(r => r.id === c.recordId);
      return <li key={c.id}><div><strong>{record?.title || record?.name || COLLECTION_LABELS[c.collection] || "Registro"}</strong><p>Campos en conflicto: {c.columnas.map(k => FIELD_LABELS[k] || k.replace(/_/g, " ")).join(", ")}.</p></div><div className="persistence-actions"><button type="button" disabled={!!busy} className="studio-secondary-action" onClick={() => { void resolve(c.id, "mio"); }}>{busy === c.id ? "Resolviendo…" : "Reaplicar mi cambio"}</button><button type="button" disabled={!!busy} className="studio-secondary-action" onClick={() => { void resolve(c.id, "servidor"); }}>Conservar servidor</button></div></li>;
    })}</ul><button type="button" className="studio-text-action" onClick={descargarRespaldo}>Descargar copia del estado actual</button>{message && <p role="alert" className="persistence-detail">{message}</p>}</div>}
  </section>;
}
