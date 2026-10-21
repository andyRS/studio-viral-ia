import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-guard";
import { setSelection } from "@/lib/meta";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
// POST /api/meta/pages { ids } — guarda qué páginas quiere ver el usuario y devuelve
// los externalId de las páginas quitadas para borrar sus métricas.
export async function POST(req: NextRequest) {
  const auth = await requireUser(); if (!auth.user) return auth.response!;
  let body: any = {}; try { body = await req.json(); } catch {}
  try { return NextResponse.json({ ok: true, ...(await setSelection(auth.user.id, Array.isArray(body.ids) ? body.ids.map(String) : [])) }); }
  catch (e: any) { return NextResponse.json({ ok: false, error: e.message }, { status: 500 }); }
}
