// Reglas puras de persistencia (sin React ni Supabase): qué significa cada error, qué columnas cambian,
// cuándo dos ediciones chocan y dónde se guarda el respaldo local de cada usuario. Probadas en tests/.

// ---------- Errores de Supabase/PostgREST ----------
export type TipoError = "tabla_ausente" | "columna_ausente" | "tiempo" | "permiso" | "red" | "servicio" | "otro";
export function clasificarError(err: any): TipoError {
  const code = String(err?.code ?? "");
  const msg = `${err?.message ?? ""} ${err?.details ?? ""} ${err?.hint ?? ""}`;
  const status = Number(err?.status ?? err?.statusCode ?? 0);
  if (code === "42P01" || code === "PGRST205" || /relation .* does not exist|Could not find the table/i.test(msg)) return "tabla_ausente";
  if (code === "42703" || code === "PGRST204" || /column .* does not exist|Could not find the '.*' column/i.test(msg)) return "columna_ausente";
  if (code === "57014" || /statement timeout|canceling statement|timed? ?out/i.test(msg)) return "tiempo";
  if (code === "42501" || status === 401 || status === 403 || /permission denied|row-level security|JWT/i.test(msg)) return "permiso";
  if (/Failed to fetch|NetworkError|network|ECONN|fetch failed|Load failed/i.test(msg)) return "red";
  if (status >= 500 || /Service Unavailable|Bad Gateway|upstream/i.test(msg)) return "servicio";
  return "otro";
}
export const esMigracionPendiente = (t: TipoError) => t === "tabla_ausente";
export function explicarError(t: TipoError, tabla: string) {
  switch (t) {
    case "tabla_ausente": return `Falta la tabla «${tabla}» en Supabase: ejecuta su migración (supabase/migrations). Mientras tanto se guarda en este navegador.`;
    case "columna_ausente": return `Falta una columna nueva en «${tabla}»: ejecuta las migraciones pendientes.`;
    case "tiempo": return `Supabase tardó demasiado leyendo «${tabla}». No es una migración pendiente: reintenta en un minuto.`;
    case "permiso": return `Supabase rechazó el acceso a «${tabla}» (sesión caducada o permisos). Vuelve a iniciar sesión.`;
    case "red": return `Sin conexión con Supabase al leer «${tabla}». Revisa internet y reintenta; no se guardará nada en esa sección hasta que vuelva.`;
    case "servicio": return `Supabase no está disponible ahora mismo («${tabla}»). Reintenta en unos minutos.`;
    default: return `No se pudo leer «${tabla}».`;
  }
}

// ---------- Cambios por columnas ----------
const igual = (a: any, b: any) => a === b || JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
// Columnas de `nuevo` que difieren de `base` (las dos ya pasadas por toRow). Nunca incluye las fijas.
export function columnasCambiadas(base: Record<string, any> | undefined, nuevo: Record<string, any>, fijas = ["id", "user_id", "created_at", "revision", "updated_at"]) {
  const out: Record<string, any> = {};
  for (const k of Object.keys(nuevo)) if (!fijas.includes(k) && (!base || !igual(base[k], nuevo[k]))) out[k] = nuevo[k];
  return out;
}
// Al chocar (otra ventana guardó antes): si lo que cambió el otro no toca las mismas columnas que yo,
// se puede reintentar con mi parche sobre su versión; si toca alguna con otro valor, es un conflicto real.
export function resolverChoque(base: Record<string, any>, remoto: Record<string, any>, parche: Record<string, any>) {
  const cambiadasFuera = Object.keys(columnasCambiadas(base, remoto));
  const choques = Object.keys(parche).filter(k => cambiadasFuera.includes(k) && !igual(remoto[k], parche[k]));
  return { reintentar: choques.length === 0, choques };
}

// ---------- Respaldo local por usuario ----------
// Sin sesión: claves de siempre («estudio-viral:<clave>»). Con sesión: «u:<userId>:<clave>», para que dos
// cuentas en el mismo navegador nunca mezclen proyectos. Lo antiguo (sin usuario) solo se importa a mano.
export const claveLocal = (clave: string, userId?: string | null) => (userId ? `u:${userId}:${clave}` : clave);
