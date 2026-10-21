import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-guard";
import { checkState, exchangeCode, saveConnection } from "@/lib/meta";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
// GET /api/meta/callback — Facebook vuelve aquí con ?code; se guardan los tokens de página en el servidor.
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin; const q = req.nextUrl.searchParams;
  const back = (estado: string, detalle = "") => NextResponse.redirect(`${origin}/?modulo=metricas&meta=${estado}${detalle ? "&detalle=" + encodeURIComponent(detalle.slice(0, 200)) : ""}`);
  const auth = await requireUser(); if (!auth.user) return NextResponse.redirect(`${origin}/login`);
  if (q.get("error")) return back("cancelado", q.get("error_description") || "");
  if (!checkState(q.get("state") || "", auth.user.id)) return back("error", "La sesión de conexión caducó. Vuelve a intentarlo.");
  try {
    const conn = await exchangeCode(q.get("code") || "", origin);
    await saveConnection(auth.user.id, conn);
    return back(conn.pages.length ? "conectado" : "sin-paginas");
  } catch (e: any) { return back("error", e.message); }
}
