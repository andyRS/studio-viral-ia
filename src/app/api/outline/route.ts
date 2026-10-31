import { NextRequest, NextResponse } from "next/server";
export const maxDuration = 180;
import { requireUser } from "@/lib/auth-guard";
import { generateOutline, regenerateNode, reviewAgainstSources, writeScene } from "@/lib/outlineAI";
// POST /api/outline — proyecto largo: { action: "estructura" | "regenerar" | "guion" | "revisar", ... }. Protegida con sesión.
export async function POST(req: NextRequest) {
  const auth = await requireUser(); if (!auth.user) return auth.response!;
  let body: any = {}; try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Body JSON inválido" }, { status: 400 }); }
  if (!process.env.LLM_API_KEY) return NextResponse.json({ ok: false, error: "El servidor no tiene clave de IA configurada (LLM_API_KEY)." }, { status: 503 });
  try {
    const data = body.action === "estructura" ? await generateOutline(body) : body.action === "regenerar" ? await regenerateNode(body) : body.action === "guion" ? await writeScene(body) : body.action === "revisar" ? await reviewAgainstSources(body) : null;
    if (!data) return NextResponse.json({ ok: false, error: "Acción no válida" }, { status: 400 });
    return NextResponse.json({ ok: true, data });
  } catch (e: any) { return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 }); }
}
