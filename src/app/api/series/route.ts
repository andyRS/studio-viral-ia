import { NextRequest, NextResponse } from "next/server";
export const maxDuration = 60;
import { requireUser } from "@/lib/auth-guard";
import { generateSeries } from "@/lib/story";
// POST /api/series — crea una serie nueva (personajes + episodio 1). Protegida con sesión.
export async function POST(req: NextRequest) {
  const auth = await requireUser(); if (!auth.user) return auth.response!;
  let body: any = {}; try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Body JSON inválido" }, { status: 400 }); }
  try { return NextResponse.json({ ok: true, data: await generateSeries(body) }); }
  catch (e: any) { return NextResponse.json({ ok: false, error: e.message }, { status: 500 }); }
}
