import { NextRequest, NextResponse } from "next/server";
export const maxDuration = 180;
import { requireUser } from "@/lib/auth-guard";
import { generateHookVariants } from "@/lib/story";
// POST /api/hooks — propone 5 ganchos para elegir antes de generar. Protegida con sesión.
export async function POST(req: NextRequest) {
  const auth = await requireUser(); if (!auth.user) return auth.response!;
  let body: any = {}; try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Body JSON inválido" }, { status: 400 }); }
  try { return NextResponse.json({ ok: true, data: await generateHookVariants(body) }); }
  catch (e: any) { return NextResponse.json({ ok: false, error: e.message }, { status: 500 }); }
}
