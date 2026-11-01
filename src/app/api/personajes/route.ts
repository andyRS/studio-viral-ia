import { NextRequest, NextResponse } from "next/server";
export const maxDuration = 120;
import { requireUser } from "@/lib/auth-guard";
import { adaptarPersonajes } from "@/lib/story";
// POST /api/personajes — adapta fichas de personajes escritas por otra IA al elenco de la app. Protegida con sesión.
export async function POST(req: NextRequest) {
  const auth = await requireUser(); if (!auth.user) return auth.response!;
  let body: any = {}; try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Body JSON inválido" }, { status: 400 }); }
  try { return NextResponse.json({ ok: true, data: await adaptarPersonajes(body) }); }
  catch (e: any) { return NextResponse.json({ ok: false, error: e.message }, { status: 500 }); }
}
