import { NextResponse } from "next/server";
import { createServerSupabase } from "./supabase/server";

// Protección de las rutas de IA (/api/generate, /api/analyze-metrics,
// /api/analyze-viral, /api/dropshipping):
// - Sin variables de Supabase en el servidor -> 503 claro (ruta CERRADA,
//   nunca abierta por falta de configuración).
// - Sin sesión válida (auth.getUser() desde cookies) -> 401
//   { error: "No autorizado: inicia sesión" } SIN llamar al LLM.
// - Con sesión -> { user } y la ruta procesa normal.
export async function requireUser(): Promise<{ user: any; response: NextResponse | null }> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return {
      user: null,
      response: NextResponse.json(
        { ok: false, error: "Supabase no está configurado en el servidor (faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY). Las rutas de IA están cerradas." },
        { status: 503 }
      ),
    };
  }
  try {
    const supabase = await createServerSupabase();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return { user: null, response: NextResponse.json({ ok: false, error: "No autorizado: inicia sesión" }, { status: 401 }) };
    }
    return { user, response: null };
  } catch {
    return { user: null, response: NextResponse.json({ ok: false, error: "No autorizado: inicia sesión" }, { status: 401 }) };
  }
}
