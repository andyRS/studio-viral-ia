import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Cliente Supabase de servidor (lee la sesión desde las cookies).
// Lanza un error claro si faltan las variables de entorno: las rutas que lo
// usan (auth-guard) lo capturan y responden 401/503, nunca quedan abiertas.
export async function createServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Supabase no está configurado: faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const cookieStore = cookies();
  return createServerClient(url, anon, { cookies: { getAll: () => cookieStore.getAll(), setAll: (cs: any[]) => { try { cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch {} } } });
}
