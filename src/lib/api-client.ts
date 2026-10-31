"use client";
// Helper del frontend para llamar a las rutas de IA protegidas.
// Devuelve también el status para que cada módulo maneje el 401 mostrando
// «Inicia sesión para usar la IA» con enlace a /login, sin romperse.
//
// Generación observable (honesta): las rutas devuelven la respuesta entera al final, así que no hay
// etapas ni porcentajes reales. Lo que sí se sabe y se muestra: qué se está generando, desde cuándo,
// que se puede cancelar, y si una generación se cortó porque se recargó o cerró la página (el resultado
// no llegó; puede que la IA terminara en el servidor, pero no se guardó nada).
export interface ApiResult { status: number; json: any }

export type Generacion = { id: string; ruta: string; etiqueta: string; inicio: number; pagina: string };
const CLAVE = "estudio-viral:generaciones";
// Identifica esta carga de la página: lo que quede apuntado con otra id es de una carga anterior (cortada).
const PAGINA = typeof window !== "undefined" ? Math.random().toString(36).slice(2) : "srv";
const ETIQUETAS: Record<string, string> = {
  "/api/series": "Crear la serie y el episodio 1", "/api/next-episode": "Escribir el episodio siguiente", "/api/outline": "Proyecto largo",
  "/api/ideas": "Proponer ideas", "/api/hooks": "Proponer ganchos", "/api/analyze-viral": "Analizar un viral", "/api/analyze-metrics": "Analizar las métricas",
  "/api/generate": "Generar contenido", "/api/dropshipping": "Contenido de dropshipping",
};
const leer = (): Generacion[] => { try { return JSON.parse(localStorage.getItem(CLAVE) || "[]"); } catch { return []; } };
const escribir = (g: Generacion[]) => { try { localStorage.setItem(CLAVE, JSON.stringify(g.slice(-20))); } catch {} };

// Latido de cada pestaña abierta: una generación de OTRA pestaña viva no está cortada, solo en curso allí.
const LATIDOS = "estudio-viral:latidos";
const latidos = (): Record<string, number> => { try { return JSON.parse(localStorage.getItem(LATIDOS) || "{}"); } catch { return {}; } };
function latir() {
  const l = latidos(); const ahora = Date.now();
  for (const k of Object.keys(l)) if (ahora - l[k] > 60000) delete l[k];
  l[PAGINA] = ahora;
  try { localStorage.setItem(LATIDOS, JSON.stringify(l)); } catch {}
}
if (typeof window !== "undefined") { latir(); setInterval(latir, 5000); }
const viva = (pagina: string) => pagina === PAGINA || Date.now() - (latidos()[pagina] || 0) < 15000;

export function generacionesInterrumpidas(): Generacion[] {
  if (typeof window === "undefined") return [];
  return leer().filter(g => !viva(g.pagina) && Date.now() - g.inicio < 2 * 86400000);
}
export function olvidarInterrumpidas() { escribir(leer().filter(g => viva(g.pagina))); }
export const generacionesEnCurso = () => (typeof window === "undefined" ? [] : leer().filter(g => g.pagina === PAGINA));

export async function postApi(path: string, body: any, opts: { signal?: AbortSignal; etiqueta?: string } = {}): Promise<ApiResult> {
  const g: Generacion = { id: Math.random().toString(36).slice(2), ruta: path, etiqueta: opts.etiqueta || ETIQUETAS[path] || path.replace("/api/", ""), inicio: Date.now(), pagina: PAGINA };
  const esIA = path in ETIQUETAS;   // el resto (p. ej. el pase del montaje) no es una generación
  if (esIA && typeof window !== "undefined") escribir([...leer(), g]);
  try {
    const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}), signal: opts.signal });
    let json: any = null;
    try { json = await res.json(); } catch { json = null; }
    if (!json && res.status >= 500) json = { ok: false, error: res.status === 504 ? "El servidor tardó demasiado (límite de tiempo). Prueba con un pedido más corto o reintenta." : `Error del servidor (HTTP ${res.status}). Reintenta en un momento.` };
    return { status: res.status, json };
  } catch (e: any) {
    if (e?.name === "AbortError") return { status: 499, json: { ok: false, cancelado: true, error: "Generación cancelada. No se guardó nada." } };
    return { status: 0, json: { ok: false, error: "Se cortó la conexión con el servidor. Revisa internet y reintenta (no se guardó nada)." } };
  } finally {
    if (esIA && typeof window !== "undefined") escribir(leer().filter(x => x.id !== g.id));
  }
}
export const isAuthError = (r: ApiResult) => r.status === 401 || r.status === 503;
